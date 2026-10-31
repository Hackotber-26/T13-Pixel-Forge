"""Blood requests: create, live status page, donor response, close, report, check-in."""

import re
import secrets
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from app import matching, whatsapp
from app.db import tx
from app.routes.donors import BloodGroup
from app.routes.geo import nearby_banks
from app.security import create_action_link, current_user, optional_user

router = APIRouter()
IST = ZoneInfo("Asia/Kolkata")
MAX_OPEN_REQUESTS = 2
REPORTS_TO_PAUSE = 2

# Requests can't carry payment details, links or phone/account numbers.
SCAM_RE = re.compile(
    r"(https?://|www\.|\.(com|in|ly|me)\b|[\w.\-]+@[a-z]+|\d[\d\s\-]{7,}\d|\b(upi|gpay|paytm|phonepe|ifsc|account|"
    r"a/c|transfer|payment|pay|money|rupees?|rs\.?|inr|fee|charges?)\b|₹)",
    re.IGNORECASE,
)


class PinnedHospital(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    lat: float = Field(ge=6, le=37.5)
    lng: float = Field(ge=68, le=97.5)


class RequestIn(BaseModel):
    blood_group: BloodGroup
    component: Literal["whole_blood", "platelets", "plasma"] = "whole_blood"
    units: int = Field(ge=1, le=10)
    hospital_id: int | None = None
    pinned_hospital: PinnedHospital | None = None
    urgency: Literal["now", "today", "tomorrow"]
    ailment: Literal["accident", "surgery", "childbirth", "disease", "critical"] | None = None
    note: str | None = Field(default=None, max_length=280)

    @model_validator(mode="after")
    def one_hospital(self):
        if (self.hospital_id is None) == (self.pinned_hospital is None):
            raise ValueError("Choose a hospital or drop a pin")
        return self


def _needed_by(urgency: str) -> datetime:
    now = datetime.now(IST)
    if urgency == "now":
        return now + timedelta(hours=6)
    day = date.today() if urgency == "today" else date.today() + timedelta(days=1)
    return datetime.combine(day, time(23, 59), IST)


@router.post("/requests")
def create_request(body: RequestIn, background: BackgroundTasks, user_id: str = Depends(current_user)):
    if body.note and SCAM_RE.search(body.note):
        raise HTTPException(
            status_code=422,
            detail="Please remove links, numbers or payment words from the note. Donors are contacted through Raksha.",
        )
    with tx() as conn:
        user = conn.execute("select phone, blocked_at from users where id = %s", (user_id,)).fetchone()
        if user["blocked_at"]:
            raise HTTPException(status_code=403, detail="This number is under review. Please contact the hospital blood bank.")
        open_count = conn.execute(
            "select count(*) as n from blood_requests where requester_id = %s and status in ('active','paused')",
            (user_id,),
        ).fetchone()["n"]
        if open_count >= MAX_OPEN_REQUESTS:
            raise HTTPException(status_code=429, detail="You already have 2 open requests. Close one first.")

        if body.hospital_id is not None:
            h = conn.execute(
                """select id, name, st_x(location::geometry) as lng, st_y(location::geometry) as lat
                   from hospitals where id = %s and verified""",
                (body.hospital_id,),
            ).fetchone()
            if not h:
                raise HTTPException(status_code=404, detail="Hospital not found")
            hospital_id, name, lat, lng, verified = h["id"], h["name"], h["lat"], h["lng"], True
        else:
            p = body.pinned_hospital
            hospital_id = conn.execute(
                """insert into hospitals (name, location, source, verified)
                   values (%s, st_point(%s, %s)::geography, 'user_pin', false) returning id""",
                (p.name.strip(), p.lng, p.lat),
            ).fetchone()["id"]
            name, lat, lng, verified = p.name.strip(), p.lat, p.lng, False

        token = secrets.token_urlsafe(8)
        req = conn.execute(
            """insert into blood_requests (public_token, requester_id, blood_group, component, units, hospital_id,
                 hospital_name, hospital_verified, location, urgency, needed_by, ailment, note)
               values (%s,%s,%s,%s,%s,%s,%s,%s, st_point(%s,%s)::geography, %s,%s,%s,%s)
               returning id, public_token""",
            (token, user_id, body.blood_group, body.component, body.units, hospital_id, name, verified,
             lng, lat, body.urgency, _needed_by(body.urgency), body.ailment, body.note),
        ).fetchone()
        page_url = create_action_link(conn, user_id, "me") + f"?next=/r/{token}"

    background.add_task(matching.run_next_wave, str(req["id"]))
    background.add_task(
        whatsapp.send_link, user["phone"],
        f"🩸 Your request for {body.blood_group} at {name} is live. We're alerting nearby donors and will update you here.",
        "Track request", page_url,
    )
    return {"token": req["public_token"]}


def _load(conn, token: str) -> dict:
    req = conn.execute(
        """select r.*, st_y(r.location::geometry) as lat, st_x(r.location::geometry) as lng
           from blood_requests r where r.public_token = %s""",
        (token,),
    ).fetchone()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return req


def _my_match(conn, request_id, user_id):
    if not user_id:
        return None
    return conn.execute(
        "select id, status, distance_km from request_matches where request_id = %s and donor_id = %s",
        (request_id, user_id),
    ).fetchone()


@router.get("/r/{token}")
def view_request(token: str, user_id: str | None = Depends(optional_user)):
    with tx() as conn:
        req = _load(conn, token)
        match = _my_match(conn, req["id"], user_id)
        if match and match["status"] == "alerted":
            conn.execute("update request_matches set status = 'viewed' where id = %s", (match["id"],))
            match["status"] = "viewed"
        counts = conn.execute(
            """select count(*) as alerted,
                      count(*) filter (where status <> 'alerted') as viewed,
                      count(*) filter (where status in ('accepted','donated')) as coming
               from request_matches where request_id = %s""",
            (req["id"],),
        ).fetchone()
        is_requester = user_id is not None and str(req["requester_id"]) == user_id
        view = {
            "token": token,
            "blood_group": req["blood_group"], "component": req["component"], "units": req["units"],
            "hospital_name": req["hospital_name"], "hospital_verified": req["hospital_verified"],
            "lat": req["lat"], "lng": req["lng"],
            "urgency": req["urgency"], "needed_by": req["needed_by"], "ailment": req["ailment"], "note": req["note"],
            "status": req["status"], "created_at": req["created_at"],
            "radius_km": matching.WAVE_RADII_KM[max(req["current_wave"], 1) - 1],
            "searching": req["status"] == "active" and req["next_wave_at"] is not None,
            "counts": counts,
            "role": "requester" if is_requester else "donor" if match else "viewer",
            "banks": nearby_banks(conn, req["lat"], req["lng"]),
        }
        if is_requester:
            # Only donors who confirmed are shown, never the alerted list.
            view["donors"] = conn.execute(
                """select d.name, d.blood_group, u.phone, m.distance_km, m.responded_at
                   from request_matches m join users u on u.id = m.donor_id
                   join donor_profiles d on d.user_id = m.donor_id
                   where m.request_id = %s and m.status in ('accepted','donated')
                   order by m.responded_at""",
                (req["id"],),
            ).fetchall()
        if match:
            view["my_match"] = {"status": match["status"], "distance_km": match["distance_km"]}
            if match["status"] in ("accepted", "donated"):
                view["requester_phone"] = conn.execute(
                    "select phone from users where id = %s", (req["requester_id"],)
                ).fetchone()["phone"]
        return view


class RespondIn(BaseModel):
    action: Literal["accept", "decline"]
    pause_days: int | None = Field(default=None, ge=1, le=90)


@router.post("/r/{token}/respond")
def respond(token: str, body: RespondIn, background: BackgroundTasks, user_id: str = Depends(current_user)):
    with tx() as conn:
        req = _load(conn, token)
        match = _my_match(conn, req["id"], user_id)
        if not match:
            raise HTTPException(status_code=403, detail="This request wasn't sent to you")
        if req["status"] != "active":
            raise HTTPException(status_code=409, detail="This request is already covered. Thank you 🙏")
        new_status = "accepted" if body.action == "accept" else "declined"
        conn.execute(
            "update request_matches set status = %s, responded_at = now() where id = %s", (new_status, match["id"])
        )
        if body.pause_days:
            conn.execute(
                "update donor_profiles set snooze_until = now() + make_interval(days => %s) where user_id = %s",
                (body.pause_days, user_id),
            )
        if new_status == "accepted":
            donor = conn.execute(
                "select d.name, d.blood_group, u.phone from donor_profiles d join users u on u.id = d.user_id where d.user_id = %s",
                (user_id,),
            ).fetchone()
            requester_phone = conn.execute("select phone from users where id = %s", (req["requester_id"],)).fetchone()["phone"]
            background.add_task(
                whatsapp.send_text, requester_phone,
                f"✅ {donor['name']} ({donor['blood_group']}) can donate and is {match['distance_km']} km away.\n"
                f"Call: +{donor['phone']}",
            )
    return view_request(token, user_id)


class CloseIn(BaseModel):
    found: bool


@router.post("/r/{token}/close")
def close(token: str, body: CloseIn, background: BackgroundTasks, user_id: str = Depends(current_user)):
    with tx() as conn:
        req = _load(conn, token)
    if str(req["requester_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Only the person who raised this request can close it")
    background.add_task(matching.close_request, str(req["id"]), "fulfilled" if body.found else "closed")
    return {"ok": True}


class ReportIn(BaseModel):
    reason: str | None = Field(default=None, max_length=200)


@router.post("/r/{token}/report")
def report(token: str, body: ReportIn, user_id: str = Depends(current_user)):
    """Two reports from different donors pause the request and put the requester's number under review."""
    with tx() as conn:
        req = _load(conn, token)
        if not _my_match(conn, req["id"], user_id):
            raise HTTPException(status_code=403, detail="Only alerted donors can report a request")
        conn.execute(
            "insert into request_reports (request_id, reporter_id, reason) values (%s,%s,%s) on conflict do nothing",
            (req["id"], user_id, body.reason),
        )
        n = conn.execute("select count(*) as n from request_reports where request_id = %s", (req["id"],)).fetchone()["n"]
        if n >= REPORTS_TO_PAUSE:
            conn.execute(
                "update blood_requests set status = 'paused', next_wave_at = null where id = %s and status = 'active'",
                (req["id"],),
            )
            conn.execute("update users set blocked_at = coalesce(blocked_at, now()) where id = %s", (req["requester_id"],))
    return {"ok": True}


class CheckinIn(BaseModel):
    donated: bool


@router.post("/r/{token}/checkin")
def checkin(token: str, body: CheckinIn, user_id: str = Depends(current_user)):
    with tx() as conn:
        req = _load(conn, token)
        match = _my_match(conn, req["id"], user_id)
        if not match or match["status"] not in ("accepted", "donated", "no_show"):
            raise HTTPException(status_code=403, detail="Nothing to confirm here")
        if body.donated and match["status"] != "donated":
            conn.execute("update request_matches set status = 'donated' where id = %s", (match["id"],))
            conn.execute(
                "insert into donations (donor_id, request_id) values (%s,%s) on conflict do nothing",
                (user_id, req["id"]),
            )
            conn.execute(
                """update donor_profiles set last_donated_at = current_date, donations_count = donations_count + 1,
                   updated_at = now() where user_id = %s""",
                (user_id,),
            )
        elif not body.donated:
            conn.execute("update request_matches set status = 'no_show' where id = %s", (match["id"],))
    return {"ok": True}
