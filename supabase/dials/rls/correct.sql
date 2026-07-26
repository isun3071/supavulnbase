-- RLS DIAL: correct
--
-- Owner-scoped on all four verbs. This is the control setting: a grader that
-- reports a finding against public.bookmarks in this mode has a false positive,
-- and the table is byte-identical to the broken modes in every respect except
-- these policies.

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

create policy "Owners read their bookmarks"
  on public.bookmarks for select
  using (auth.uid() = user_id);

create policy "Owners add their bookmarks"
  on public.bookmarks for insert
  with check (auth.uid() = user_id);

create policy "Owners edit their bookmarks"
  on public.bookmarks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Owners delete their bookmarks"
  on public.bookmarks for delete
  using (auth.uid() = user_id);
