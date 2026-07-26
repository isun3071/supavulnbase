-- RLS DIAL: permissive
--
-- Row level security IS enabled and policies DO exist, so every "is RLS on?"
-- check passes. The SELECT policy is auth.role() = 'authenticated', which is
-- true for every logged-in user, so it reads as access control and behaves as
-- "is anyone signed in".
--
-- This is the failure mode no platform default prevents, and the one a
-- generator that writes policies rather than omitting them tends to produce.
-- Writes are correctly owner-scoped, so only reads leak — which is what makes
-- it easy to miss.

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'bookmarks'
  loop
    execute format('drop policy %I on public.bookmarks', p.policyname);
  end loop;
end $$;

alter table public.bookmarks enable row level security;

create policy "Bookmarks are visible to signed-in users"
  on public.bookmarks for select
  using (auth.role() = 'authenticated');

create policy "Users add their own bookmarks"
  on public.bookmarks for insert
  with check (auth.uid() = user_id);

create policy "Users edit their own bookmarks"
  on public.bookmarks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete their own bookmarks"
  on public.bookmarks for delete
  using (auth.uid() = user_id);
