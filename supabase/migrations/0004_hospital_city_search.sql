-- Many directory hospitals have no address, so "AIIMS Delhi" can't match on name alone.
-- Tag each hospital with its nearest city/town and search over name + place.

create table places (
  id        bigserial primary key,
  name      text not null,
  kind      text not null,              -- city | town
  location  extensions.geography(Point, 4326) not null
);
create index places_location_idx on places using gist (location);
alter table places enable row level security;
create policy raksha_app_all on places to raksha_app using (true) with check (true);
grant select, insert, update, delete on places to raksha_app;
grant usage, select on sequence places_id_seq to raksha_app;

alter table hospitals add column city text;
alter table hospitals add column search_text text generated always as (
  lower(name || ' ' || coalesce(city, '') || ' ' || coalesce(district, '') || ' ' || coalesce(state, '') || ' ' || coalesce(address, ''))
) stored;
create index hospitals_search_trgm_idx on hospitals using gin (search_text extensions.gin_trgm_ops);
