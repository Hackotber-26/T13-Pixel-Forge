"""Load Indian neighbourhood names (place=suburb) so map pins read "Kengeri, Bengaluru".

Usage: python scripts/seed_suburbs.py path/to/osm_suburbs.json

Overpass query (data (c) OpenStreetMap contributors, ODbL):
  [out:json][timeout:180];area["ISO3166-1"="IN"][admin_level=2]->.in;node["place"="suburb"](area.in);out;
"""

import json
import sys

import psycopg

sys.path.insert(0, ".")
from app.config import settings  # noqa: E402


def main(path):
    rows = []
    for el in json.load(open(path, encoding="utf-8"))["elements"]:
        t = el.get("tags", {})
        name = (t.get("name:en") or t.get("name") or "").strip()
        if name:
            rows.append((name, el["lon"], el["lat"]))
    with psycopg.connect(settings.db_dsn) as conn:
        conn.execute("delete from places where kind = 'suburb'")
        conn.cursor().executemany(
            "insert into places (name, kind, location) values (%s, 'suburb', st_point(%s, %s)::geography)", rows
        )
    print(f"suburbs: {len(rows)}")


if __name__ == "__main__":
    main(sys.argv[1])
