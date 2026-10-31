"""Sessions, one-tap action links and phone helpers."""

import base64
import hashlib
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta, timezone

from fastapi import Header, HTTPException

from app.config import settings
from app.db import tx

SESSION_DAYS = 30
LINK_HOURS = {"join": 72, "request": 72, "me": 72, "checkin": 168}


def normalize_phone(raw: str) -> str:
    """Digits only with country code. 10-digit Indian numbers get 91 prefixed."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        digits = "91" + digits
    return digits


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _sign(payload: str) -> str:
    return hmac.new(settings.app_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]


def issue_session(user_id: str) -> str:
    payload = f"{user_id}.{int(time.time()) + SESSION_DAYS * 86400}"
    raw = f"{payload}.{_sign(payload)}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def read_session(token: str) -> str | None:
    try:
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)).decode()
        user_id, exp, sig = raw.rsplit(".", 2)
    except Exception:
        return None
    if not hmac.compare_digest(sig, _sign(f"{user_id}.{exp}")) or int(exp) < time.time():
        return None
    return user_id


def current_user(authorization: str | None = Header(default=None)) -> str:
    user_id = read_session((authorization or "").removeprefix("Bearer ").strip())
    if not user_id:
        raise HTTPException(status_code=401, detail="Please verify with WhatsApp again")
    return user_id


def optional_user(authorization: str | None = Header(default=None)) -> str | None:
    return read_session((authorization or "").removeprefix("Bearer ").strip())


def get_or_create_user(conn, phone: str) -> dict:
    return conn.execute(
        """insert into users (phone) values (%s)
           on conflict (phone) do update set phone = excluded.phone
           returning id, phone, name, blocked_at""",
        (phone,),
    ).fetchone()


def create_action_link(conn, user_id: str, purpose: str, request_id: str | None = None) -> str:
    """Return a full web URL that signs the user in for one purpose."""
    token = secrets.token_urlsafe(9)
    expires = datetime.now(timezone.utc) + timedelta(hours=LINK_HOURS[purpose])
    conn.execute(
        "insert into action_links (token_hash, user_id, purpose, request_id, expires_at) values (%s,%s,%s,%s,%s)",
        (sha256(token), user_id, purpose, request_id, expires),
    )
    return f"{settings.web_base_url}/a/{token}"


def redeem_action_link(token: str) -> dict:
    with tx() as conn:
        link = conn.execute(
            """select l.user_id, l.purpose, l.request_id, r.public_token
               from action_links l left join blood_requests r on r.id = l.request_id
               where l.token_hash = %s and l.expires_at > now()""",
            (sha256(token),),
        ).fetchone()
    if not link:
        raise HTTPException(status_code=410, detail="This link has expired")
    return {
        "session": issue_session(str(link["user_id"])),
        "purpose": link["purpose"],
        "request_token": link["public_token"],
    }
