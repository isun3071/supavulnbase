-- Give the Supabase service roles a password so GoTrue / PostgREST / Storage can
-- log in over TCP. The roles themselves are created by the supabase/postgres
-- base image migrations; this only sets credentials, and tolerates their absence
-- so the script stays safe across base-image versions.
do $$
declare
  r text;
begin
  foreach r in array array[
    'authenticator',
    'supabase_auth_admin',
    'supabase_storage_admin',
    'supabase_admin'
  ] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('alter role %I with login password %L', r, 'postgres');
    end if;
  end loop;
end
$$;
