"""Load hospitals and blood banks from an OpenStreetMap Overpass export.

Usage: python scripts/seed_osm.py path/to/osm_in.json

The export comes from this Overpass query (data (c) OpenStreetMap contributors, ODbL):
  [out:json][timeout:180];area["ISO3166-1"="IN"][admin_level=2]->.in;
  (nwr["amenity"="hospital"](area.in);nwr["healthcare"="hospital"](area.in);
   nwr["healthcare"="blood_donation"](area.in);
   nwr["healthcare"="blood_bank"](area.in););out center tags;
"""

import json
import sys

import psycopg

sys.path.insert(0, ".")
from app.config import settings  # noqa: E402

BLOOD_WORDS = ("blood bank", "blood centre", "blood center")


def point(el):
    if "lat" in el:
        return el["lat"], el["lon"]
    c = el.get("center")
    return (c["lat"], c["lon"]) if c else None


def address(t):
    parts = [t.get(k) for k in ("addr:housenumber", "addr:street", "addr:suburb", "addr:city")]
    return ", ".join(p for p in parts if p) or None


def main(path):
    elements = json.load(open(path, encoding="utf-8"))["elements"]
    hospitals, banks = [], []
    for el in elements:
        t = el.get("tags", {})
        name = (t.get("name:en") or t.get("name") or "").strip()
        pt = point(el)
        if not name or not pt:
            continue
        lat, lon = pt
        row = (name, address(t), t.get("addr:district"), t.get("addr:state"), t.get("addr:postcode"), lon, lat)
        is_bank = t.get("healthcare") in ("blood_bank", "blood_donation") or any(w in name.lower() for w in BLOOD_WORDS)
        if is_bank:
            phone = t.get("phone") or t.get("contact:phone")
            banks.append((f"osm:{el['type']}/{el['id']}",) + row[:5] + (phone, lon, lat))
        if t.get("amenity") == "hospital" or t.get("healthcare") == "hospital":
            hospitals.append(row)

    with psycopg.connect(settings.db_dsn) as conn:
        conn.execute("delete from hospitals where source = 'osm'")
        # COPY is not allowed under RLS, so batch INSERTs (executemany pipelines them).
        conn.cursor().executemany(
            """insert into hospitals (name, address, district, state, pincode, location, source)
               values (%s,%s,%s,%s,%s, st_point(%s,%s)::geography, 'osm')""",
            hospitals,
        )
        for ext_id, name, addr, dist, state, pin, phone, lon, lat in banks:
            conn.execute(
                """insert into blood_banks (ext_id, name, address, district, state, pincode, phone, location, source)
                   values (%s,%s,%s,%s,%s,%s,%s, st_point(%s,%s)::geography, 'osm')
                   on conflict (ext_id) do update set name = excluded.name, phone = excluded.phone,
                     location = excluded.location""",
                (ext_id, name, addr, dist, state, pin, phone, lon, lat),
            )
    print(f"hospitals: {len(hospitals)}, blood banks: {len(banks)}")


if __name__ == "__main__":
    main(sys.argv[1])
