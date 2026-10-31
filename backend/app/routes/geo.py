"""Hospital search and nearby blood banks."""

from fastapi import APIRouter, Query

from app.db import tx

router = APIRouter()


# Short forms and old city names people type.
ALIASES = {
    "aiims": "all india institute of medical sciences",
    "pgimer": "post graduate institute of medical education and research",
    "nimhans": "national institute of mental health and neuro sciences",
    "govt": "government", "hosp": "hospital", "esi": "esic",
    "bangalore": "bengaluru", "bombay": "mumbai", "madras": "chennai", "calcutta": "kolkata",
    "gurgaon": "gurugram", "mysore": "mysuru", "poona": "pune", "trivandrum": "thiruvananthapuram",
    "baroda": "vadodara", "mangalore": "mangaluru", "cochin": "kochi", "benaras": "varanasi",
}
# Words too common to narrow the search on their own.
COMMON = {"hospital", "hospitals", "government", "medical", "clinic", "centre", "center", "nursing",
          "home", "institute", "sciences", "of", "and", "the", "general", "multispeciality", "speciality"}


def query_tokens(q: str, expand: bool) -> list[str]:
    words = []
    for w in q.lower().replace(",", " ").split():
        words.extend((ALIASES.get(w, w) if expand else w).split())
    return words


def anchor_of(tokens: list[str]) -> str:
    return max((t for t in tokens if t not in COMMON), key=len, default=max(tokens, key=len))


@router.get("/hospitals")
def search_hospitals(
    q: str = Query(min_length=2, max_length=80),
    lat: float | None = None,
    lng: float | None = None,
):
    """Typo-tolerant search over name + city + state. Every word counts (so "apollo bengaluru" works),
    short forms are tried both as typed and expanded ("aiims"), and nearer hospitals rank higher
    when the browser shares a location."""
    typed, expanded = query_tokens(q, False), query_tokens(q, True)
    if not typed:
        return []
    near = lat is not None and lng is not None
    score = "(select avg(word_similarity(t, h.search_text)) from unnest(%({})s::text[]) t)"
    with tx() as conn:
        conn.execute("set local pg_trgm.word_similarity_threshold = 0.5")
        return conn.execute(
            f"""select id, name, address, city, state,
                       st_y(location::geometry) as lat, st_x(location::geometry) as lng
                       {", round((st_distance(location, st_point(%(lng)s, %(lat)s)::geography) / 1000)::numeric, 1) as distance_km" if near else ""}
                from hospitals h
                where verified and location is not null
                  and (%(anchor1)s <%% search_text or %(anchor2)s <%% search_text)
                order by (greatest({score.format("typed")}, {score.format("expanded")})
                          {"- st_distance(location, st_point(%(lng)s, %(lat)s)::geography) / 200000" if near else ""}) desc,
                         length(name)
                limit 8""",
            {"typed": typed, "expanded": expanded, "anchor1": anchor_of(typed), "anchor2": anchor_of(expanded),
             "lat": lat, "lng": lng},
        ).fetchall()


def nearby_banks(conn, lat: float, lng: float, limit: int = 6) -> list[dict]:
    return conn.execute(
        """select name, address, phone, category,
                  st_y(location::geometry) as lat, st_x(location::geometry) as lng,
                  round((st_distance(location, st_point(%(lng)s, %(lat)s)::geography) / 1000)::numeric, 1) as distance_km
           from blood_banks
           where location is not null and st_dwithin(location, st_point(%(lng)s, %(lat)s)::geography, 50000)
           order by location <-> st_point(%(lng)s, %(lat)s)::geography
           limit %(limit)s""",
        {"lat": lat, "lng": lng, "limit": limit},
    ).fetchall()


@router.get("/banks")
def banks(lat: float, lng: float):
    with tx() as conn:
        return nearby_banks(conn, lat, lng, limit=20)


@router.get("/places/near")
def nearest_place(lat: float, lng: float):
    """Human label for a map point: nearest town, plus the city it belongs to if a bigger one is close."""
    with tx() as conn:
        rows = conn.execute(
            """select name, kind, round((st_distance(location, st_point(%(lng)s, %(lat)s)::geography) / 1000)::numeric, 1) as km
               from places
               where st_dwithin(location, st_point(%(lng)s, %(lat)s)::geography, 40000)
               order by location <-> st_point(%(lng)s, %(lat)s)::geography
               limit 30""",
            {"lat": lat, "lng": lng},
        ).fetchall()
    if not rows:
        return {"label": None}
    # "Neighbourhood, City" the way people say it: Kengeri, Bengaluru.
    local = next((r for r in rows if r["kind"] == "suburb" and r["km"] < 3), None) \
        or next((r for r in rows if r["kind"] == "town" and r["km"] < 8), None)
    city = next((r for r in rows if r["kind"] == "city"), None)
    if local and city and local["name"] != city["name"]:
        return {"label": f"{local['name']}, {city['name']}"}
    return {"label": (local or city or rows[0])["name"]}


@router.get("/places")
def search_places(q: str = Query(min_length=2, max_length=60)):
    """City/town lookup for "blood banks near <city>"."""
    name = ALIASES.get(q.strip().lower(), q.strip().lower())
    with tx() as conn:
        return conn.execute(
            """select name, kind, st_y(location::geometry) as lat, st_x(location::geometry) as lng
               from places
               where lower(name) like %(prefix)s or similarity(lower(name), %(name)s) > 0.45
               order by (lower(name) = %(name)s) desc, (kind = 'city') desc, similarity(lower(name), %(name)s) desc
               limit 6""",
            {"name": name, "prefix": name + "%"},
        ).fetchall()
