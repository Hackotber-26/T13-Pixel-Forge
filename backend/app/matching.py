"""Find compatible donors in widening waves and alert them on WhatsApp.

Waves run from the scheduler, so a search keeps going after the family closes the tab.
"""

import logging
from datetime import datetime, timedelta, timezone

from app import whatsapp
from app.db import tx
from app.security import create_action_link

log = logging.getLogger("raksha.matching")

WAVE_RADII_KM = [5, 10, 25, 50]
WAVE_SIZE = 15
WAVE_WAIT = {"now": timedelta(minutes=10), "today": timedelta(minutes=30), "tomorrow": timedelta(hours=1)}
COOLDOWN_DAYS = 90          # operational default; needs clinician review
MAX_ALERTS_PER_WEEK = 3

COMPONENT_LABEL = {"whole_blood": "blood", "platelets": "platelets", "plasma": "plasma"}
URGENCY_LABEL = {"now": "urgently", "today": "today", "tomorrow": "by tomorrow"}

CANDIDATES_SQL = """
select d.user_id, u.phone,
       round((st_distance(d.location, r.location) / 1000)::numeric, 1) as distance_km
from blood_requests r
join compatibility_rules c on c.component = r.component and c.recipient_group = r.blood_group
join donor_profiles d on d.blood_group = c.donor_group
join users u on u.id = d.user_id
where r.id = %(request_id)s
  and d.open_to_donate and d.readiness_ok
  and (d.snooze_until is null or d.snooze_until < now())
  and (d.last_donated_at is null or d.last_donated_at < current_date - %(cooldown)s)
  and u.blocked_at is null
  and d.user_id <> r.requester_id
  and st_dwithin(d.location, r.location, least(%(radius_km)s, d.radius_km) * 1000)
  and not exists (select 1 from request_matches m where m.request_id = r.id and m.donor_id = d.user_id)
  and (select count(*) from request_matches m
       where m.donor_id = d.user_id and m.alerted_at > now() - interval '7 days') < %(max_alerts)s
order by d.location <-> r.location
limit %(limit)s
"""


def run_next_wave(request_id: str) -> int:
    """Alert the next ring of donors. Returns how many were alerted."""
    outbox = []
    with tx() as conn:
        req = conn.execute(
            """select r.*, (select count(*) from request_matches m
                            where m.request_id = r.id and m.status in ('accepted','donated')) as accepted
               from blood_requests r where r.id = %s for update skip locked""",
            (request_id,),
        ).fetchone()
        if not req or req["status"] != "active":
            return 0
        wave = req["current_wave"]
        # Unverified hospitals (a dropped pin) only reach the first wave until reviewed.
        last_wave = 1 if not req["hospital_verified"] else len(WAVE_RADII_KM)
        if req["accepted"] >= req["units"] * 2 or wave >= last_wave:
            conn.execute("update blood_requests set next_wave_at = null where id = %s", (request_id,))
            return 0

        # A ring with nobody in it widens straight away instead of making the family wait.
        while True:
            radius = WAVE_RADII_KM[wave]
            donors = conn.execute(
                CANDIDATES_SQL,
                {"request_id": request_id, "cooldown": COOLDOWN_DAYS, "radius_km": radius,
                 "max_alerts": MAX_ALERTS_PER_WEEK, "limit": WAVE_SIZE},
            ).fetchall()
            if donors or wave + 1 >= last_wave:
                break
            wave += 1
        for d in donors:
            conn.execute(
                "insert into request_matches (request_id, donor_id, wave, distance_km) values (%s,%s,%s,%s)",
                (request_id, d["user_id"], wave + 1, d["distance_km"]),
            )
            outbox.append((d["phone"], d["user_id"], d["distance_km"]))
        has_more = wave + 1 < last_wave
        conn.execute(
            "update blood_requests set current_wave = %s, next_wave_at = %s where id = %s",
            (wave + 1, datetime.now(timezone.utc) + WAVE_WAIT[req["urgency"]] if has_more else None, request_id),
        )

    need = f"{req['blood_group']} {COMPONENT_LABEL[req['component']]}"
    for phone, donor_id, km in outbox:
        if whatsapp.send_alert(phone, need, URGENCY_LABEL[req["urgency"]], req["hospital_name"], km, request_id):
            continue
        # Template not usable (e.g. still in review): a plain link still reaches donors inside the 24h window.
        with tx() as conn:
            url = create_action_link(conn, donor_id, "request", request_id)
        whatsapp.send_link(
            phone,
            f"🩸 {need} needed {URGENCY_LABEL[req['urgency']]} at {req['hospital_name']}, {km} km from you.\n"
            "Raksha never asks for money.",
            "View request",
            url,
        )
    log.info("Request %s wave %s (%s km): alerted %s donors", request_id, wave + 1, radius, len(outbox))
    return len(outbox)


def close_request(request_id: str, status: str) -> None:
    """Tell everyone how it ended: 'covered' to waiting donors, a check-in to those who accepted."""
    covered, checkins = [], []
    with tx() as conn:
        req = conn.execute(
            """update blood_requests set status = %s, closed_at = now(), next_wave_at = null
               where id = %s and status in ('active','paused') returning hospital_name""",
            (status, request_id),
        ).fetchone()
        if not req:
            return
        covered = conn.execute(
            """update request_matches m set status = 'not_needed'
               from users u where u.id = m.donor_id and m.request_id = %s and m.status in ('alerted','viewed')
               returning u.phone""",
            (request_id,),
        ).fetchall()
        for row in conn.execute(
            """select m.donor_id, u.phone from request_matches m join users u on u.id = m.donor_id
               where m.request_id = %s and m.status = 'accepted'""",
            (request_id,),
        ).fetchall():
            checkins.append((row["phone"], create_action_link(conn, row["donor_id"], "checkin", request_id)))
        conn.execute("update blood_requests set checkin_sent_at = now() where id = %s", (request_id,))

    for row in covered:
        whatsapp.send_text(row["phone"], f"🙏 The request at {req['hospital_name']} is now covered. Thank you for being ready to help.")
    for phone, url in checkins:
        whatsapp.send_link(phone, "Thank you for stepping up 🙏 Did you get to donate?", "Tell us", url)


def process_due() -> None:
    """Scheduler tick: run due waves and expire stale requests."""
    with tx() as conn:
        due = conn.execute(
            "select id from blood_requests where status = 'active' and next_wave_at <= now()"
        ).fetchall()
        expired = conn.execute(
            "select id from blood_requests where status = 'active' and needed_by < now() - interval '24 hours'"
        ).fetchall()
    for row in due:
        try:
            run_next_wave(str(row["id"]))
        except Exception:
            log.exception("Wave failed for %s", row["id"])
    for row in expired:
        close_request(str(row["id"]), "expired")
