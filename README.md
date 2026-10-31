# Raksha

Find blood quickly: families raise a request in 3 screens, nearby compatible donors get a WhatsApp alert and respond on the web in 2 taps, and the nearest blood banks are listed with Call and Directions.

```
backend/    FastAPI (Python 3.13) – auth, WhatsApp webhook, donors, requests, matching waves
web/        React + Vite + Tailwind – mobile-first, English + Hindi
supabase/   SQL migrations (already applied to the "raksha" project, Mumbai)
```

## Setup (first time)

```powershell
# Backend (Python 3.13)
cd backend
py -3.13 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env        # fill in WhatsApp, database and APP_SECRET values

# Web (Node 20+)
cd ..\web
npm install
copy .env.example .env        # set VITE_WA_NUMBER
```

Database: apply `supabase/migrations/*.sql` in order to a Supabase project (the `raksha_app` role needs a password, see `0003_app_role.sql`), then load data with the scripts in `backend/scripts/` (hospitals and blood banks, cities, neighbourhoods).

## Run locally

Two terminals:

```powershell
# 1. API (http://localhost:8000)
cd backend
.venv\Scripts\python -m uvicorn app.main:app --port 8000

# 2. Web (http://127.0.0.1:5173) – also proxies /api and /webhook to the API
cd web
npm run dev
```

Tests (hit the real database, clean up after themselves):

```powershell
cd C:\Users\cheta\raksha\backend
.venv\Scripts\python -m pytest -q
```

## Test with WhatsApp

WhatsApp needs a public HTTPS URL. One tunnel to the web server is enough, because Vite forwards `/webhook` and `/api` to the API.

1. Start a tunnel: `& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:5173`
2. In `backend/.env` set `WEB_BASE_URL=https://<tunnel>.trycloudflare.com` (links in WhatsApp messages use it). The API reloads by itself.
3. In Meta's webhook settings set the callback to `https://<tunnel>.trycloudflare.com/webhook` with the same verify token as `WA_VERIFY_TOKEN`.
4. Add the test phones to the allow-list on Meta's API Testing page (Meta sends each phone a code).
5. From a test phone, send "Hi" to the test number → tap **Become a donor**.

Note: on the test number, Raksha can only start a conversation with someone who messaged it in the last 24 hours. Donor alerts outside that window need the approved templates below.

## How it works

- **Verify with WhatsApp**: the web app shows a button that opens WhatsApp with `RAKSHA 123456` typed in. The user presses send; the webhook matches the code and the page signs in. No SMS, no OTP typing.
- **One-tap links**: every WhatsApp button opens `/a/<token>`, which signs the person in for that purpose (join, view request, my profile, check-in).
- **Matching**: compatible group (`compatibility_rules`, needs clinical review), open to donate, not paused, 90-day cooldown, at most 3 alerts a week. Waves widen 5 → 10 → 25 → 50 km every 10 min (now) / 30 min (today) / 1 h (tomorrow), and stop once accepted donors reach units × 2.
- **Fake-request guards**: verified WhatsApp number, hospital from the directory (a dropped pin only reaches the first wave), notes can't contain numbers/links/payment words, at most 2 open requests per phone, donor numbers shown only after the donor confirms, 2 reports pause the request and block the number.

## Data

- Hospitals (54,925) and blood banks (369): OpenStreetMap via Overpass (`scripts/seed_osm.py`), tagged with the nearest city (`scripts/seed_places.py`). © OpenStreetMap contributors, ODbL.
- To add the government blood-bank directory (~4,000 centres), get a free API key from data.gov.in.

## WhatsApp templates to submit (Utility category)

Submit these in WhatsApp Manager once the business profile is approved. Each has one "Visit website" button with a dynamic URL `https://<your-domain>/a/{{1}}`.

| Name | Body | Button |
|---|---|---|
| `blood_alert` | 🩸 {{1}} needed {{2}} at {{3}}, {{4}} km from you. Can you help? Raksha never asks for money. | View request |
| `request_covered` | 🙏 The request at {{1}} is now covered. Thank you for being ready to help. | – |
| `donation_checkin` | Thank you for stepping up 🙏 Did you get to donate at {{1}}? | Tell us |
| `request_live` | 🩸 Your request for {{1}} at {{2}} is live. We're alerting nearby donors. | Track request |
