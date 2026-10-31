-- Raksha core schema. The browser never talks to the database directly:
-- all access goes through the FastAPI backend (role raksha_app), so RLS is
-- enabled everywhere with policies only for that role.

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- People -------------------------------------------------------------------

create table users (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null unique,            -- digits only, with country code: 919876543210
  name        text,
  blocked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table donor_profiles (
  user_id             uuid primary key references users(id) on delete cascade,
  name                text not null,
  blood_group         text not null check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  components          text[] not null default '{whole_blood}',
  location            extensions.geography(Point, 4326) not null,
  area_label          text,
  radius_km           int not null default 25 check (radius_km between 1 and 100),
  open_to_donate      boolean not null default true,
  snooze_until        timestamptz,
  last_donated_at     date,
  readiness_ok        boolean not null,
  consent_at          timestamptz not null,
  donations_count     int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index donor_profiles_location_idx on donor_profiles using gist (location);

-- Places -------------------------------------------------------------------

create table hospitals (
  id          bigserial primary key,
  name        text not null,
  address     text,
  district    text,
  state       text,
  pincode     text,
  location    extensions.geography(Point, 4326),
  source      text not null,                   -- 'hospital_directory' | 'blood_bank' | 'user_pin'
  verified    boolean not null default true,
  created_at  timestamptz not null default now()
);
create index hospitals_name_trgm_idx on hospitals using gin (name extensions.gin_trgm_ops);
create index hospitals_location_idx on hospitals using gist (location);

create table blood_banks (
  id          bigserial primary key,
  ext_id      text unique,
  name        text not null,
  address     text,
  district    text,
  state       text,
  pincode     text,
  phone       text,
  category    text,
  location    extensions.geography(Point, 4326),
  source      text not null
);
create index blood_banks_location_idx on blood_banks using gist (location);

-- Blood-group compatibility (donor -> recipient), kept as data so a clinician
-- can review and change it without a deploy.
create table compatibility_rules (
  component       text not null,                -- whole_blood | platelets | plasma
  recipient_group text not null,
  donor_group     text not null,
  primary key (component, recipient_group, donor_group)
);

-- Requests -----------------------------------------------------------------

create table blood_requests (
  id                uuid primary key default gen_random_uuid(),
  public_token      text not null unique,
  requester_id      uuid not null references users(id),
  blood_group       text not null check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  component         text not null check (component in ('whole_blood','platelets','plasma')),
  units             int not null check (units between 1 and 10),
  hospital_id       bigint references hospitals(id),
  hospital_name     text not null,
  hospital_verified boolean not null,
  location          extensions.geography(Point, 4326) not null,
  urgency           text not null check (urgency in ('now','today','tomorrow')),
  needed_by         timestamptz not null,
  ailment           text check (ailment in ('accident','surgery','childbirth','disease','critical')),
  note              text check (char_length(note) <= 280),
  status            text not null default 'active'
                    check (status in ('active','paused','fulfilled','closed','expired')),
  current_wave      int not null default 0,
  next_wave_at      timestamptz,
  created_at        timestamptz not null default now(),
  closed_at         timestamptz,
  checkin_sent_at   timestamptz
);
create index blood_requests_requester_idx on blood_requests (requester_id, status);
create index blood_requests_due_idx on blood_requests (next_wave_at) where status = 'active';

create table request_matches (
  id            bigserial primary key,
  request_id    uuid not null references blood_requests(id) on delete cascade,
  donor_id      uuid not null references users(id) on delete cascade,
  wave          int not null,
  distance_km   numeric(6,1) not null,
  status        text not null default 'alerted'
                check (status in ('alerted','viewed','accepted','declined','not_needed','donated','no_show')),
  alerted_at    timestamptz not null default now(),
  responded_at  timestamptz,
  unique (request_id, donor_id)
);
create index request_matches_donor_idx on request_matches (donor_id, alerted_at desc);

create table request_reports (
  request_id   uuid not null references blood_requests(id) on delete cascade,
  reporter_id  uuid not null references users(id) on delete cascade,
  reason       text,
  created_at   timestamptz not null default now(),
  primary key (request_id, reporter_id)
);

create table donations (
  id          bigserial primary key,
  donor_id    uuid not null references users(id) on delete cascade,
  request_id  uuid references blood_requests(id) on delete set null,
  donated_on  date not null default current_date,
  created_at  timestamptz not null default now(),
  unique (donor_id, request_id)
);

-- Auth ---------------------------------------------------------------------

-- "Verify with WhatsApp": the browser gets a code + a secret; the user sends
-- the code to our WhatsApp number; the webhook fills in the phone.
create table wa_verifications (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  secret_hash  text not null,
  phone        text,
  verified_at  timestamptz,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

-- One-tap links sent on WhatsApp (join, view request, my raksha, check-in).
create table action_links (
  token_hash  text primary key,
  user_id     uuid not null references users(id) on delete cascade,
  purpose     text not null check (purpose in ('join','request','me','checkin')),
  request_id  uuid references blood_requests(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- WhatsApp log -------------------------------------------------------------

create table whatsapp_messages (
  id             bigserial primary key,
  wa_message_id  text unique,
  direction      text not null check (direction in ('in','out')),
  phone          text not null,
  kind           text not null,
  body           jsonb,
  status         text,
  status_rank    int not null default 0,      -- sent=1 delivered=2 read=3 failed=4; only moves forward
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index whatsapp_messages_phone_idx on whatsapp_messages (phone, created_at desc);

-- Access -------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['users','donor_profiles','hospitals','blood_banks','compatibility_rules',
                           'blood_requests','request_matches','request_reports','donations',
                           'wa_verifications','action_links','whatsapp_messages']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
