"""Load Indian cities/towns from an Overpass export and tag hospitals with the nearest one.

Usage: python scripts/seed_places.py path/to/osm_places.json

Overpass query (data (c) OpenStreetMap contributors, ODbL):
  [out:json][timeout:180];area["ISO3166-1"="IN"][admin_level=2]->.in;
  node["place"~"^(city|town)$"](area.in);out;
"""

import json
import math
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, ".")
from app.config import settings  # noqa: E402

CELL = 0.5          # grid cell in degrees (~55 km)
MAX_KM = {"city": 40, "town": 15}


def km(lat1, lon1, lat2, lon2):
    x = math.radians(lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    return 6371 * math.hypot(x, math.radians(lat2 - lat1))


def main(path):
    places = []
    for el in json.load(open(path, encoding="utf-8"))["elements"]:
        t = el.get("tags", {})
        name = (t.get("name:en") or t.get("name") or "").strip()
        if name:
            places.append((name, t["place"], el["lat"], el["lon"]))

    grid = defaultdict(list)
    for p in places:
        grid[(int(p[2] // CELL), int(p[3] // CELL))].append(p)

    def nearest(lat, lon):
        best = None  # (is_town, distance, name): prefer a city in range over a nearer town
        cx, cy = int(lat // CELL), int(lon // CELL)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for name, kind, plat, plon in grid[(cx + dx, cy + dy)]:
                    d = km(lat, lon, plat, plon)
                    if d <= MAX_KM[kind]:
                        cand = (kind != "city", d, name)
                        best = min(best, cand) if best else cand
        return best[2] if best else None

    with psycopg.connect(settings.db_dsn) as conn:
        conn.execute("delete from places where kind in ('city', 'town')")
        conn.cursor().executemany(
            "insert into places (name, kind, location) values (%s, %s, st_point(%s, %s)::geography)",
            [(n, k, lon, lat) for n, k, lat, lon in places],
        )
        hospitals = conn.execute(
            "select id, st_y(location::geometry), st_x(location::geometry) from hospitals where location is not null"
        ).fetchall()
        updates = [(c, hid) for hid, lat, lon in hospitals if (c := nearest(lat, lon))]
        conn.cursor().executemany("update hospitals set city = %s where id = %s", updates)
    print(f"places: {len(places)}, hospitals tagged: {len(updates)} of {len(hospitals)}")


if __name__ == "__main__":
    main(sys.argv[1])
