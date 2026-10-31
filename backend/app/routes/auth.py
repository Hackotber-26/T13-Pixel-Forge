"""Verify with WhatsApp (reverse OTP) and one-tap action links."""

import secrets
import urllib.parse
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.db import tx
from app.security import issue_session, redeem_action_link, sha256

router = APIRouter(prefix="/auth")


@router.post("/wa/start")
def start_verification():
    """Browser asks for a code, then opens WhatsApp with 'RAKSHA 123456' pre-filled."""
    secret = secrets.token_urlsafe(24)
    with tx() as conn:
        for _ in range(5):
            code = f"{secrets.randbelow(10**6):06d}"
            row = conn.execute(
                """insert into wa_verifications (code, secret_hash, expires_at)
                   values (%s, %s, %s) on conflict (code) do nothing returning id""",
                (code, sha256(secret), datetime.now(timezone.utc) + timedelta(minutes=10)),
            ).fetchone()
            if row:
                break
        else:
            raise HTTPException(status_code=503, detail="Please try again")
    text = urllib.parse.quote(f"RAKSHA {code}\n(Send this message to verify your number)")
    return {
        "id": str(row["id"]),
        "secret": secret,
        "code": code,
        "wa_link": f"https://wa.me/{settings.wa_display_number}?text={text}",
    }


@router.get("/wa/status/{verification_id}")
def verification_status(verification_id: str, secret: str):
    with tx() as conn:
        row = conn.execute(
            """select v.verified_at, u.id as user_id, u.phone
               from wa_verifications v left join users u on u.phone = v.phone
               where v.id = %s and v.secret_hash = %s""",
            (verification_id, sha256(secret)),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Unknown verification")
    if not row["verified_at"]:
        return {"verified": False}
    return {"verified": True, "session": issue_session(str(row["user_id"])), "phone": row["phone"]}


@router.post("/link/{token}")
def redeem_link(token: str):
    return redeem_action_link(token)
