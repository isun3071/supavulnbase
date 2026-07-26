-- Private bookmarks: save someone else's project with a note to yourself.
--
-- FIXTURE NOTE: this table is the RLS dial. The table, its columns and its seed
-- data are identical in every mode; the ONLY variable is which policy set is
-- applied, from supabase/dials/rls/{off,permissive,correct}.sql. Three
-- separately named tables would confound the comparison with naming and
-- content differences, which is the whole reason this is one table.
--
-- No policies here on purpose. The dial owns them.

create table public.bookmarks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

create index bookmarks_user_id_idx on public.bookmarks (user_id);
create unique index bookmarks_user_project_idx on public.bookmarks (user_id, project_id);
