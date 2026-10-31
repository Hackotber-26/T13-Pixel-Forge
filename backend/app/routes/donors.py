"""Donor join + My Raksha."""

from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.db import tx
from app.security import current_user

router = APIRouter()

BloodGroup = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]


class Location(BaseModel):
    lat: float = Field(ge=6, le=37.5)     # India's bounding box
    lng: float = Field(ge=68, le=97.5)
    label: str | None = Field(default=None, max_length=120)


class JoinIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    blood_group: BloodGroup
    location: Location
    readiness_ok: bool
    consent: bool


class MeUpdate(BaseModel):
    open_to_donate: bool | None = None
    pause_days: int | None = Field(default=None, ge=0, le=90)
    location: Location | None = None
    components: list[Literal["whole_blood", "platelets", "plasma"]] | None = None


def _profile(conn, user_id: str) -> dict:
    user = conn.execute("select id, phone, name from users where id = %s", (user_id,)).fetchone()
    donor = conn.execute(
        """select name, blood_group, components, area_label, radius_km, open_to_donate, snooze_until,
                  last_donated_at, readiness_ok, donations_count,
                  st_y(location::geometry) as lat, st_x(location::geometry) as lng
           from donor_profiles where user_id = %s""",
        (user_id,),
    ).fetchone()
    history = conn.execute(
        """select r.blood_group, r.hospital_name, m.status, m.alerted_at
           from request_matches m join blood_requests r on r.id = m.request_id
           where m.donor_id = %s order by m.alerted_at desc limit 20""",
        (user_id,),
    ).fetchall()
    requests = conn.execute(
        """select public_token, blood_group, hospital_name, status, created_at
           from blood_requests where requester_id = %s order by created_at desc limit 10""",
        (user_id,),
    ).fetchall()
    return {"phone": user["phone"], "donor": donor, "history": history, "my_requests": requests}


@router.get("/me")
def me(user_id: str = Depends(current_user)):
    with tx() as conn:
        return _profile(conn, user_id)


@router.post("/donors")
def join(body: JoinIn, user_id: str = Depends(current_user)):
    if not body.consent:
        raise HTTPException(status_code=422, detail="Please agree so we can alert you")
    with tx() as conn:
        conn.execute("update users set name = coalesce(name, %s) where id = %s", (body.name, user_id))
        conn.execute(
            """insert into donor_profiles (user_id, name, blood_group, location, area_label, readiness_ok, consent_at)
               values (%s, %s, %s, st_point(%s, %s)::geography, %s, %s, now())
               on conflict (user_id) do update set
                 name = excluded.name, blood_group = excluded.blood_group, location = excluded.location,
                 area_label = excluded.area_label, readiness_ok = excluded.readiness_ok,
                 consent_at = now(), open_to_donate = true, updated_at = now()""",
            (user_id, body.name.strip(), body.blood_group, body.location.lng, body.location.lat,
             body.location.label, body.readiness_ok),
        )
        return _profile(conn, user_id)


@router.patch("/me")
def update_me(body: MeUpdate, user_id: str = Depends(current_user)):
    with tx() as conn:
        if not conn.execute("select 1 from donor_profiles where user_id = %s", (user_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Join as a donor first")
        if body.open_to_donate is not None:
            conn.execute(
                "update donor_profiles set open_to_donate = %s, snooze_until = null, updated_at = now() where user_id = %s",
                (body.open_to_donate, user_id),
            )
        if body.pause_days is not None:
            until = datetime.now(timezone.utc) + timedelta(days=body.pause_days) if body.pause_days else None
            conn.execute(
                "update donor_profiles set snooze_until = %s, updated_at = now() where user_id = %s", (until, user_id)
            )
        if body.location:
            conn.execute(
                """update donor_profiles set location = st_point(%s, %s)::geography, area_label = %s,
                   updated_at = now() where user_id = %s""",
                (body.location.lng, body.location.lat, body.location.label, user_id),
            )
        if body.components:
            conn.execute(
                "update donor_profiles set components = %s, updated_at = now() where user_id = %s",
                (body.components, user_id),
            )
        return _profile(conn, user_id)


@router.post("/me/donated")
def mark_donated(user_id: str = Depends(current_user)):
    """'I donated' without a Raksha request (e.g. at a camp): starts the cooldown."""
    with tx() as conn:
        conn.execute(
            """update donor_profiles set last_donated_at = %s, donations_count = donations_count + 1,
               updated_at = now() where user_id = %s""",
            (date.today(), user_id),
        )
        conn.execute("insert into donations (donor_id) values (%s)", (user_id,))
        return _profile(conn, user_id)


@router.delete("/me")
def delete_me(user_id: str = Depends(current_user)):
    with tx() as conn:
        conn.execute("delete from donor_profiles where user_id = %s", (user_id,))
    return {"deleted": True}
