"""WhatsApp webhook: verification codes, the two-button menu, delivery statuses."""

import hmac
import json
import logging
import re

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from app import whatsapp
from app.config import settings
from app.db import tx
from app.security import create_action_link, get_or_create_user, normalize_phone

log = logging.getLogger("raksha.webhook")
router = APIRouter()

CODE_RE = re.compile(r"\bRAKSHA[\s-]*(\d{6})\b", re.IGNORECASE)


@router.get("/webhook", response_class=PlainTextResponse)
def verify(
    mode: str = Query("", alias="hub.mode"),
    token: str = Query("", alias="hub.verify_token"),
    challenge: str = Query("", alias="hub.challenge"),
):
    if mode == "subscribe" and settings.wa_verify_token and hmac.compare_digest(token, settings.wa_verify_token):
        return challenge
    raise HTTPException(status_code=403, detail="Verification failed")


def _remember(msg: dict, phone: str) -> bool:
    """Store an inbound message; False if Meta already delivered it (retry)."""
    with tx() as conn:
        row = conn.execute(
            """insert into whatsapp_messages (wa_message_id, direction, phone, kind, body)
               values (%s, 'in', %s, %s, %s) on conflict (wa_message_id) do nothing returning id""",
            (msg.get("id"), phone, msg.get("type"), json.dumps(msg)),
        ).fetchone()
    return row is not None


def _verify_code(phone: str, code: str) -> bool:
    with tx() as conn:
        row = conn.execute(
            """update wa_verifications set phone = %s, verified_at = now()
               where code = %s and verified_at is null and expires_at > now() returning id""",
            (phone, code),
        ).fetchone()
        if row:
            get_or_create_user(conn, phone)
    return row is not None


def _menu_choice(phone: str, choice: str) -> None:
    with tx() as conn:
        user = get_or_create_user(conn, phone)
        is_donor = conn.execute("select 1 from donor_profiles where user_id = %s", (user["id"],)).fetchone()
        if choice == "need":
            url = create_action_link(conn, user["id"], "me") + "?next=request"
        elif choice == "join" and not is_donor:
            url = create_action_link(conn, user["id"], "join")
        else:
            url = create_action_link(conn, user["id"], "me")
    if choice == "need":
        whatsapp.send_link(phone, "Tell us what's needed. It takes under a minute.", "Request blood", url)
    elif choice == "join" and not is_donor:
        whatsapp.send_link(phone, "Thank you for stepping up 🙏 Joining takes 3 quick steps.", "Become a donor", url)
    else:
        whatsapp.send_link(phone, "Your donor profile, availability and history.", "Open My Raksha", url)


def _alert_reply(phone: str, payload: str) -> None:
    """Quick-reply taps on the alert template: 'view:<request id>' or 'decline:<request id>'."""
    action, _, request_id = payload.partition(":")
    with tx() as conn:
        match = conn.execute(
            """select m.id, m.donor_id, m.status, r.status as request_status, r.hospital_name
               from request_matches m join users u on u.id = m.donor_id
               join blood_requests r on r.id = m.request_id
               where u.phone = %s and m.request_id::text = %s""",
            (phone, request_id),
        ).fetchone()
        if not match:
            whatsapp.send_menu(phone)
            return
        if match["request_status"] != "active":
            whatsapp.send_text(phone, f"🙏 The request at {match['hospital_name']} is already covered. Thank you for being ready to help.")
            return
        if action == "decline":
            if match["status"] in ("alerted", "viewed"):
                conn.execute(
                    "update request_matches set status = 'declined', responded_at = now() where id = %s", (match["id"],)
                )
            url = create_action_link(conn, match["donor_id"], "me")
        else:
            url = create_action_link(conn, match["donor_id"], "request", request_id)
    if action == "decline":
        whatsapp.send_link(phone, "No problem, thanks for letting us know. You can pause alerts anytime.", "My Raksha", url)
    else:
        whatsapp.send_link(phone, f"Here are the details for {match['hospital_name']}. Say yes there in one tap.", "View request", url)


def handle_message(msg: dict) -> None:
    phone = normalize_phone(msg.get("from", ""))
    if not _remember(msg, phone):
        return
    kind = msg.get("type")
    if kind == "text":
        match = CODE_RE.search(msg["text"]["body"])
        if match:
            ok = _verify_code(phone, match.group(1))
            whatsapp.send_text(
                phone,
                "✅ Verified. You can go back to Raksha now." if ok
                else "That code has expired. Please tap Verify on Raksha again.",
            )
            return
    if kind == "button":
        payload = msg["button"].get("payload", "")
        if ":" in payload:                       # alert template: view:<id> / decline:<id>
            _alert_reply(phone, payload)
            return
        if payload in ("join", "need", "me"):    # welcome template
            _menu_choice(phone, payload)
            return
    if kind == "interactive":
        reply = msg["interactive"].get("button_reply") or {}
        if reply.get("id") in ("join", "need", "me"):
            _menu_choice(phone, reply["id"])
            return
    whatsapp.send_menu(phone)


@router.post("/webhook")
async def receive(request: Request, background: BackgroundTasks):
    body = await request.body()
    if not whatsapp.signature_valid(body, request.headers.get("X-Hub-Signature-256")):
        raise HTTPException(status_code=403, detail="Bad signature")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return {"status": "ignored"}

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for msg in value.get("messages", []):
                background.add_task(handle_message, msg)
            for status in value.get("statuses", []):
                background.add_task(whatsapp.record_status, status)
    # Always 200 so Meta doesn't retry.
    return {"status": "ok"}
