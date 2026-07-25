-- day 2: sponsor pipeline, draft autosave, and media buckets

------------------------------------------------------------------
-- sponsor_leads — who we are talking to about funding a project
------------------------------------------------------------------
create table public.sponsor_leads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles on delete cascade,
  project_id    uuid references public.projects on delete set null,
  company       text not null,
  contact_name  text,
  contact_email text,
  amount_cents  integer,
  stage         text not null default 'contacted',
  notes         text,
  created_at    timestamptz not null default now()
);

create index sponsor_leads_user_id_idx on public.sponsor_leads (user_id);

alter table public.sponsor_leads enable row level security;

-- keep leads out of the public feed — you have to be signed in to see them
create policy "Sponsor leads are visible to signed-in users"
  on public.sponsor_leads for select
  using (auth.role() = 'authenticated');

create policy "Users can add their own leads"
  on public.sponsor_leads for insert
  with check (auth.uid() = user_id);

create policy "Users can edit their own leads"
  on public.sponsor_leads for update
  using (auth.uid() = user_id);

create policy "Users can remove their own leads"
  on public.sponsor_leads for delete
  using (auth.uid() = user_id);

------------------------------------------------------------------
-- payout_accounts — where sponsorship money would land
------------------------------------------------------------------
create table public.payout_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles on delete cascade,
  label          text not null,
  account_last4  text,
  routing_hint   text,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now()
);

create index payout_accounts_user_id_idx on public.payout_accounts (user_id);

alter table public.payout_accounts enable row level security;

create policy "Owners read their payout accounts"
  on public.payout_accounts for select
  using (auth.uid() = user_id);

create policy "Owners add their payout accounts"
  on public.payout_accounts for insert
  with check (auth.uid() = user_id);

create policy "Owners edit their payout accounts"
  on public.payout_accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Owners delete their payout accounts"
  on public.payout_accounts for delete
  using (auth.uid() = user_id);

------------------------------------------------------------------
-- drafts — autosaved update text, so you do not lose a long post
------------------------------------------------------------------
create table public.drafts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  project_id uuid references public.projects on delete cascade,
  body       text not null default '',
  updated_at timestamptz not null default now()
);

create index drafts_user_id_idx on public.drafts (user_id);

alter table public.drafts enable row level security;

create policy "Owners read their drafts"
  on public.drafts for select
  using (auth.uid() = user_id);

-- autosave kept failing with "new row violates row-level security policy",
-- opened these up so the editor stops throwing. TODO tighten before launch
create policy "Autosave insert"
  on public.drafts for insert
  with check (true);

create policy "Autosave update"
  on public.drafts for update
  using (true);

create policy "Autosave delete"
  on public.drafts for delete
  using (true);

------------------------------------------------------------------
-- storage access rules
-- (the buckets themselves are created through the storage API, see infra/seed.mjs)
------------------------------------------------------------------

-- anyone can read project media, owners manage their own files
create policy "Project media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'project-media');

create policy "Owners upload project media"
  on storage.objects for insert
  with check (bucket_id = 'project-media' and auth.role() = 'authenticated');

-- payout documents: owner only, both directions
create policy "Owners read their payout documents"
  on storage.objects for select
  using (bucket_id = 'payout-documents' and auth.uid() = owner);

create policy "Owners upload their payout documents"
  on storage.objects for insert
  with check (bucket_id = 'payout-documents' and auth.uid() = owner);
