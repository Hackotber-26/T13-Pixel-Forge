"""WhatsApp Cloud API: signature check and outgoing messages.

Raksha never chats. Every outgoing message is a short line plus one button
that opens the web app.
"""

import hashlib
import hmac
import json
import logging

import httpx

from app.config import settings
from app.db import tx

log = logging.getLogger("raksha.whatsapp")

STATUS_RANK = {"sent": 1, "delivered": 2, "read": 3, "failed": 4}


def signature_valid(body: bytes, header: str | None) -> bool:
    if not settings.wa_app_secret:
        log.warning("WA_APP_SECRET not set - skipping signature check")
        return True
    if not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(settings.wa_app_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(header.removeprefix("sha256="), expected)


def _post(to: str, kind: str, payload: dict) -> bool:
    """Send one message. True if Meta accepted it (delivery is reported later via statuses)."""
    if not (settings.wa_access_token and settings.wa_phone_number_id):
        log.info("WhatsApp not configured; would send %s to %s: %s", kind, to, payload)
        return True
    body = {"messaging_product": "whatsapp", "to": to, **payload}
    try:
        resp = httpx.post(
            f"{settings.graph_url}/{settings.wa_phone_number_id}/messages",
            headers={"Authorization": f"Bearer {settings.wa_access_token}"},
            json=body,
            timeout=10,
        )
    except httpx.HTTPError as e:
        log.error("WhatsApp send to %s failed: %s", to, e)
        return False
    if not resp.is_success:
        log.error("WhatsApp send to %s failed: %s %s", to, resp.status_code, resp.text)
        return False
    wa_id = resp.json().get("messages", [{}])[0].get("id")
    with tx() as conn:
        conn.execute(
            """insert into whatsapp_messages (wa_message_id, direction, phone, kind, body, status, status_rank)
               values (%s, 'out', %s, %s, %s, 'sent', 1) on conflict (wa_message_id) do nothing""",
            (wa_id, to, kind, json.dumps(payload)),
        )
    return True


def send_text(to: str, text: str) -> None:
    _post(to, "text", {"type": "text", "text": {"body": text, "preview_url": False}})


def send_link(to: str, text: str, button: str, url: str) -> None:
    """One line of text and one button that opens a URL (works inside the 24h window)."""
    _post(
        to,
        "cta_url",
        {
            "type": "interactive",
            "interactive": {
                "type": "cta_url",
                "body": {"text": text},
                "action": {"name": "cta_url", "parameters": {"display_text": button[:20], "url": url}},
            },
        },
    )


ALERT_TEMPLATE = "raksha_blood_alert"


def send_alert(to: str, need: str, when: str, hospital: str, km, request_id: str) -> bool:
    """Donor alert. Uses the approved template so it reaches donors outside the 24h window.
    Its quick-reply buttons come back to the webhook as 'view:<id>' / 'decline:<id>'."""
    return _post(
        to,
        "alert",
        {
            "type": "template",
            "template": {
                "name": ALERT_TEMPLATE,
                "language": {"code": "en"},
                "components": [
                    {"type": "body", "parameters": [{"type": "text", "text": str(v)} for v in (need, when, hospital, km)]},
                    {"type": "button", "sub_type": "quick_reply", "index": "0", "parameters": [{"type": "payload", "payload": f"view:{request_id}"}]},
                    {"type": "button", "sub_type": "quick_reply", "index": "1", "parameters": [{"type": "payload", "payload": f"decline:{request_id}"}]},
                ],
            },
        },
    )


WELCOME_TEMPLATE = "raksha_welcome"


def send_welcome(to: str, name: str = "there") -> bool:
    """First message to someone who hasn't written to us (template, works outside the 24h window).
    Its buttons come back as 'join' / 'need' / 'me' and get the same one-tap links as the menu."""
    return _post(
        to,
        "welcome",
        {
            "type": "template",
            "template": {
                "name": WELCOME_TEMPLATE,
                "language": {"code": "en"},
                "components": [
                    {"type": "body", "parameters": [{"type": "text", "text": name}]},
                    *[
                        {"type": "button", "sub_type": "quick_reply", "index": str(i), "parameters": [{"type": "payload", "payload": p}]}
                        for i, p in enumerate(("join", "need", "me"))
                    ],
                ],
            },
        },
    )


def send_menu(to: str) -> None:
    """Reply to any inbound message: two buttons, no conversation."""
    _post(
        to,
        "menu",
        {
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": "🩸 Welcome to Raksha. What would you like to do?"},
                "action": {
                    "buttons": [
                        {"type": "reply", "reply": {"id": "join", "title": "Become a donor"}},
                        {"type": "reply", "reply": {"id": "need", "title": "Need blood"}},
                        {"type": "reply", "reply": {"id": "me", "title": "My Raksha"}},
                    ]
                },
            },
        },
    )


def record_status(status: dict) -> None:
    """Statuses can arrive out of order; only ever move forward."""
    rank = STATUS_RANK.get(status.get("status"), 0)
    errors = status.get("errors")
    if errors:
        log.error("WhatsApp delivery to %s failed: %s", status.get("recipient_id"), errors)
    with tx() as conn:
        conn.execute(
            """update whatsapp_messages set status = %s, status_rank = %s, updated_at = now(),
                 body = case when %s::jsonb is null then body else coalesce(body, '{}'::jsonb) || jsonb_build_object('errors', %s::jsonb) end
               where wa_message_id = %s and status_rank < %s""",
            (status.get("status"), rank, json.dumps(errors) if errors else None,
             json.dumps(errors) if errors else None, status.get("id"), rank),
        )
