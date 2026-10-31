"""End-to-end flow against the real database, with WhatsApp sends captured.

Test users use the reserved phone prefix 9100000000xx and are deleted afterwards.
"""

import pytest
from fastapi.testclient import TestClient

from app import whatsapp
from app.db import tx
from app.main import app
from app.routes.requests import SCAM_RE
from app.routes.webhook import handle_message
from app.security import normalize_phone

PREFIX = "9100000000"
HOSPITAL = {"lat": 12.9352, "lng": 77.6245}  # Koramangala, Bengaluru


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c
        with tx() as conn:
            conn.execute(
                "delete from blood_requests where requester_id in (select id from users where phone like %s)",
                (PREFIX + "%",),
            )
            conn.execute("delete from hospitals where source = 'user_pin' and name like 'Test %%'")
            conn.execute("delete from users where phone like %s", (PREFIX + "%",))
            conn.execute("delete from whatsapp_messages where phone like %s", (PREFIX + "%",))


@pytest.fixture(autouse=True)
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(whatsapp, "_post", lambda to, kind, payload: sent.append((to, kind, payload)))
    return sent


_msg_id = iter(range(10**6))


def verify(client, phone: str) -> dict:
    """Run Verify-with-WhatsApp exactly as a phone would."""
    start = client.post("/auth/wa/start").json()
    assert start["wa_link"].startswith("https://wa.me/")
    assert client.get(f"/auth/wa/status/{start['id']}", params={"secret": start["secret"]}).json() == {"verified": False}
    handle_message({"id": f"test-{next(_msg_id)}-{phone}", "from": phone, "type": "text",
                    "text": {"body": f"RAKSHA {start['code']}"}})
    status = client.get(f"/auth/wa/status/{start['id']}", params={"secret": start["secret"]}).json()
    assert status["verified"]
    return {"Authorization": f"Bearer {status['session']}"}


def join(client, headers, group, dlat=0.0):
    r = client.post("/donors", headers=headers, json={
        "name": "Test Donor", "blood_group": group, "readiness_ok": True, "consent": True,
        "location": {"lat": HOSPITAL["lat"] + dlat, "lng": HOSPITAL["lng"], "label": "Test area"},
    })
    assert r.status_code == 200, r.text


def test_phone_normalization():
    assert normalize_phone("+91 99455-39952") == "919945539952"
    assert normalize_phone("9945539952") == "919945539952"


def test_scam_filter():
    for bad in ["pay 500 to gpay", "send to abc@okaxis", "call 98765 43210", "visit www.x.com", "₹2000 fee"]:
        assert SCAM_RE.search(bad), bad
    assert not SCAM_RE.search("Mother needs blood after surgery, ward 3B")


def test_full_flow(client, outbox):
    requester = verify(client, PREFIX + "01")
    near_o_neg = verify(client, PREFIX + "02")
    far_b_pos = verify(client, PREFIX + "03")
    incompatible = verify(client, PREFIX + "04")
    join(client, near_o_neg, "O-", dlat=0.01)      # ~1 km away, universal donor
    join(client, far_b_pos, "B+", dlat=0.07)       # ~8 km away (second wave)
    join(client, incompatible, "A+", dlat=0.01)    # A+ can't give to B+

    # Note with a phone number is rejected
    bad = client.post("/requests", headers=requester, json={
        "blood_group": "B+", "units": 1, "urgency": "now", "note": "call 9876543210",
        "pinned_hospital": {"name": "Test Hospital", **HOSPITAL}})
    assert bad.status_code == 422

    outbox.clear()
    created = client.post("/requests", headers=requester, json={
        "blood_group": "B+", "units": 1, "urgency": "now", "ailment": "surgery",
        "pinned_hospital": {"name": "Test Hospital", **HOSPITAL}})
    assert created.status_code == 200, created.text
    token = created.json()["token"]

    # Wave 1 (5 km) alerts only the near compatible donor; requester gets a tracking link.
    alerts = [(to, p) for to, kind, p in outbox if kind == "alert"]
    assert [to for to, _ in alerts] == [PREFIX + "02"]
    template = alerts[0][1]["template"]
    assert template["name"] == "raksha_blood_alert"
    view_payload = template["components"][1]["parameters"][0]["payload"]

    # Tapping "View request" on the template replies with a one-tap link to this request.
    outbox.clear()
    handle_message({"id": f"test-{next(_msg_id)}", "from": PREFIX + "02", "type": "button",
                    "button": {"text": "View request", "payload": view_payload}})
    links = [p for to, kind, p in outbox if kind == "cta_url" and to == PREFIX + "02"]
    assert links and "/a/" in links[0]["interactive"]["action"]["parameters"]["url"]

    # Pinned (unverified) hospitals stop after wave 1.
    from app.matching import run_next_wave
    with tx() as conn:
        req_id = conn.execute("select id from blood_requests where public_token = %s", (token,)).fetchone()["id"]
    assert run_next_wave(str(req_id)) == 0

    # Public view hides donor contacts.
    public = client.get(f"/r/{token}").json()
    assert public["role"] == "viewer" and "donors" not in public and public["hospital_verified"] is False

    # Donor views (marks viewed) and accepts; requester is notified with the donor's number.
    view = client.get(f"/r/{token}", headers=near_o_neg).json()
    assert view["role"] == "donor" and view["my_match"]["status"] == "viewed"
    outbox.clear()
    accepted = client.post(f"/r/{token}/respond", headers=near_o_neg, json={"action": "accept"}).json()
    assert accepted["requester_phone"] == PREFIX + "01"
    assert any(to == PREFIX + "01" and PREFIX + "02" in p["text"]["body"] for to, k, p in outbox if k == "text")

    # A donor who wasn't alerted can't respond.
    assert client.post(f"/r/{token}/respond", headers=far_b_pos, json={"action": "accept"}).status_code == 403

    # Requester sees the accepted donor.
    mine = client.get(f"/r/{token}", headers=requester).json()
    assert mine["role"] == "requester" and [d["phone"] for d in mine["donors"]] == [PREFIX + "02"]

    # Close -> accepted donor gets a check-in link; check-in starts the cooldown.
    outbox.clear()
    assert client.post(f"/r/{token}/close", headers=requester, json={"found": True}).status_code == 200
    assert any(to == PREFIX + "02" and k == "cta_url" for to, k, _ in outbox)
    assert client.post(f"/r/{token}/checkin", headers=near_o_neg, json={"donated": True}).status_code == 200
    me = client.get("/me", headers=near_o_neg).json()
    assert me["donor"]["donations_count"] == 1 and me["donor"]["last_donated_at"]


def test_verified_hospital_waves_and_reports(client, outbox):
    requester = verify(client, PREFIX + "11")
    d1, d2 = verify(client, PREFIX + "12"), verify(client, PREFIX + "13")
    with tx() as conn:
        h = conn.execute(
            """select id, st_y(location::geometry) as lat, st_x(location::geometry) as lng from hospitals
               where source = 'osm' and location is not null order by id limit 1"""
        ).fetchone()
    for d, dlat in ((d1, 0.01), (d2, 0.07)):
        r = client.post("/donors", headers=d, json={
            "name": "Test Donor", "blood_group": "O+", "readiness_ok": True, "consent": True,
            "location": {"lat": h["lat"] + dlat, "lng": h["lng"]}})
        assert r.status_code == 200, r.text

    outbox.clear()
    token = client.post("/requests", headers=requester, json={
        "blood_group": "O+", "units": 1, "urgency": "today", "hospital_id": h["id"]}).json()["token"]
    with tx() as conn:
        req_id = conn.execute("select id from blood_requests where public_token = %s", (token,)).fetchone()["id"]
    from app.matching import run_next_wave
    assert run_next_wave(str(req_id)) == 1   # wave 2 (10 km) reaches the farther donor

    # "Can't this time" on the template records a decline.
    handle_message({"id": f"test-{next(_msg_id)}", "from": PREFIX + "13", "type": "button",
                    "button": {"text": "Can't this time", "payload": f"decline:{req_id}"}})
    with tx() as conn:
        assert conn.execute(
            "select m.status from request_matches m join users u on u.id = m.donor_id where u.phone = %s",
            (PREFIX + "13",),
        ).fetchone()["status"] == "declined"

    # Two reports pause the request and put the requester under review.
    assert client.post(f"/r/{token}/report", headers=d1, json={"reason": "asked for money"}).status_code == 200
    assert client.post(f"/r/{token}/report", headers=d2, json={}).status_code == 200
    assert client.get(f"/r/{token}").json()["status"] == "paused"
    again = client.post("/requests", headers=requester, json={
        "blood_group": "O+", "units": 1, "urgency": "today", "hospital_id": h["id"]})
    assert again.status_code == 403


def test_empty_rings_widen_immediately(client, outbox):
    """A donor ~18 km away is alerted at once, not after waiting through the empty 5 km and 10 km rings."""
    requester, far = verify(client, PREFIX + "21"), verify(client, PREFIX + "22")
    with tx() as conn:
        h = conn.execute(
            """select id, st_y(location::geometry) as lat, st_x(location::geometry) as lng from hospitals
               where source = 'osm' and location is not null order by id desc limit 1"""
        ).fetchone()
    r = client.post("/donors", headers=far, json={
        "name": "Test Donor", "blood_group": "AB+", "readiness_ok": True, "consent": True,
        "location": {"lat": h["lat"] + 0.16, "lng": h["lng"]}})
    assert r.status_code == 200, r.text
    outbox.clear()
    token = client.post("/requests", headers=requester, json={
        "blood_group": "AB+", "units": 1, "urgency": "today", "hospital_id": h["id"]}).json()["token"]
    assert [to for to, kind, _ in outbox if kind == "alert"] == [PREFIX + "22"]
    assert client.get(f"/r/{token}").json()["radius_km"] == 25


def test_hospital_search(client):
    rows = client.get("/hospitals", params={"q": "apolo hospital"}).json()   # typo on purpose
    assert rows and any("apollo" in r["name"].lower() for r in rows)
    # With the browser's location (Bengaluru), nearby matches rank first.
    near = client.get("/hospitals", params={"q": "manipal", "lat": 12.97, "lng": 77.59})
    assert near.status_code == 200, near.text
    assert near.json() and near.json()[0]["distance_km"] < 50
