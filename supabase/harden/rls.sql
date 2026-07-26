-- HARDENING: the `rls` class.
--
-- Applied only on the hardened reference stack, and only when
-- HARDEN_CLASS is `rls` or `all`. Fixes exactly the database-authorization
-- findings and nothing else: no renamed tables, no dropped columns, no changed
-- seed data, no tidied naming. The differential against the vulnerable target
-- must be attributable to policy alone.
--
-- Covers: rls-001, rls-002, rls-005 (projects, updates), rls-003
-- (sponsor_leads permissive SELECT), rls-004 (drafts INSERT),
-- dial-rls-001 (bookmarks), storage-001 (public bucket).

-- Idempotent by construction: this overlay is applied on EVERY boot of the
-- hardened stack and is never recorded as a migration, so flipping
-- HARDEN_CLASS takes effect on an existing volume. Clearing the policies it
-- owns first means a re-run — or a re-run after a partial failure, which is
-- how this was first found — always converges.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public'
             and tablename in ('projects','updates','sponsor_leads','drafts','bookmarks')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
  -- storage.objects is shared with the payout-documents policies, so drop by
  -- name rather than clearing the table.
  for p in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname in ('Project media is publicly readable',
                                'Project media readable by signed-in users')
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

-- rls-001 / rls-002 / rls-005 -------------------------------------------------
alter table public.projects enable row level security;

drop policy if exists "Projects are publicly readable" on public.projects;
create policy "Projects are publicly readable"
  on public.projects for select using (true);

drop policy if exists "Owners write their projects" on public.projects;
create policy "Owners write their projects"
  on public.projects for insert with check (auth.uid() = user_id);

drop policy if exists "Owners update their projects" on public.projects;
create policy "Owners update their projects"
  on public.projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Owners delete their projects" on public.projects;
create policy "Owners delete their projects"
  on public.projects for delete using (auth.uid() = user_id);

alter table public.updates enable row level security;

drop policy if exists "Updates are publicly readable" on public.updates;
create policy "Updates are publicly readable"
  on public.updates for select using (true);

-- the WITH CHECK is what closes rls-005: the author can no longer be forged,
-- because the row's user_id must equal the caller's own uid.
drop policy if exists "Authors write their own updates" on public.updates;
create policy "Authors write their own updates"
  on public.updates for insert with check (auth.uid() = user_id);

drop policy if exists "Authors update their own updates" on public.updates;
create policy "Authors update their own updates"
  on public.updates for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Authors delete their own updates" on public.updates;
create policy "Authors delete their own updates"
  on public.updates for delete using (auth.uid() = user_id);

-- rls-003: permissive SELECT becomes owner-scoped ------------------------------
drop policy if exists "Sponsor leads are visible to signed-in users" on public.sponsor_leads;
create policy "Owners read their sponsor leads"
  on public.sponsor_leads for select
  using (auth.uid() = user_id);

-- rls-004: the blanket write policies become owner-scoped ----------------------
drop policy if exists "Autosave insert" on public.drafts;
drop policy if exists "Autosave update" on public.drafts;
drop policy if exists "Autosave delete" on public.drafts;

create policy "Owners insert their drafts"
  on public.drafts for insert with check (auth.uid() = user_id);
create policy "Owners update their drafts"
  on public.drafts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owners delete their drafts"
  on public.drafts for delete using (auth.uid() = user_id);

-- dial-rls-001: bookmarks owner-scoped on all four verbs -----------------------
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
create policy "Owners read their bookmarks"   on public.bookmarks for select using (auth.uid() = user_id);
create policy "Owners add their bookmarks"    on public.bookmarks for insert with check (auth.uid() = user_id);
create policy "Owners edit their bookmarks"   on public.bookmarks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owners delete their bookmarks" on public.bookmarks for delete using (auth.uid() = user_id);

-- storage-001: object policy only. The bucket's `public` flag is flipped after
-- seeding by infra/harden-storage.mjs, because storage.buckets does not gain
-- its `public` column until storage-api runs its own migrations, which happens
-- after this file does.
create policy "Project media readable by signed-in users"
  on storage.objects for select
  using (bucket_id = 'project-media' and auth.role() = 'authenticated');
