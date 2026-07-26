-- RLS DIAL: off
--
-- The table was created by SQL migration and row level security was never
-- enabled. Supabase's default grants give anon and authenticated full DML on
-- everything in public, so the table is world readable and world writable
-- through PostgREST with the anon key alone.
--
-- This is what a generator produces when it writes no policy at all.

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'bookmarks'
  loop
    execute format('drop policy %I on public.bookmarks', p.policyname);
  end loop;
end $$;

alter table public.bookmarks disable row level security;
