-- Backend login role. The password is set out of band (a SCRAM verifier was
-- generated locally; the plain password lives only in backend/.env as DB_PASSWORD).
create role raksha_app login;
grant usage on schema public, extensions to raksha_app;
grant select, insert, update, delete on all tables in schema public to raksha_app;
grant usage, select on all sequences in schema public to raksha_app;
alter default privileges in schema public grant select, insert, update, delete on tables to raksha_app;
alter default privileges in schema public grant usage, select on sequences to raksha_app;
alter role raksha_app set search_path = public, extensions;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('create policy raksha_app_all on %I to raksha_app using (true) with check (true)', t);
  end loop;
end $$;
