-- REVERT of supabase/harden/rls.sql.
--
-- Applied on every boot of the hardened stack when HARDEN_CLASS is NOT `rls`
-- or `all`. Without it, the database keeps whatever hardening a previous run
-- left behind: the overlay converges forward but the volume persists, so after
-- one `all` run every subsequent per-class run reported rls as FIXED and the
-- diff was not minimal. The sweep caught exactly that.
--
-- This restores the VULNERABLE baseline, matching the original migrations, so
-- that `rls` is hardened only when it is the selected class.
-- public.bookmarks is not touched here: the RLS_MODE dial file is applied
-- immediately before this and owns that table.

do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
           where schemaname = 'public'
             and tablename in ('projects','updates','sponsor_leads','drafts')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
  for p in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname in ('Project media is publicly readable',
                                'Project media readable by signed-in users')
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

-- rls-001 / rls-002 / rls-005: RLS was never enabled on these two at all.
alter table public.projects disable row level security;
alter table public.updates  disable row level security;

-- rls-003: the permissive SELECT policy comes back.
alter table public.sponsor_leads enable row level security;
create policy "Sponsor leads are visible to signed-in users"
  on public.sponsor_leads for select
  using (auth.role() = 'authenticated');
create policy "Users can add their own leads"
  on public.sponsor_leads for insert with check (auth.uid() = user_id);
create policy "Users can edit their own leads"
  on public.sponsor_leads for update using (auth.uid() = user_id);
create policy "Users can remove their own leads"
  on public.sponsor_leads for delete using (auth.uid() = user_id);

-- rls-004: SELECT scoped, writes wide open.
alter table public.drafts enable row level security;
create policy "Owners read their drafts"
  on public.drafts for select using (auth.uid() = user_id);
create policy "Autosave insert" on public.drafts for insert with check (true);
create policy "Autosave update" on public.drafts for update using (true);
create policy "Autosave delete" on public.drafts for delete using (true);

-- storage-001: the public read policy comes back. The bucket's `public` flag
-- is restored after seeding by infra/harden-storage.mjs.
create policy "Project media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'project-media');
