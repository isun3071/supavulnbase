-- BuildLog — initial schema
-- build in public: post a project, log a daily update, people follow along

create extension if not exists pgcrypto;

------------------------------------------------------------------
-- profiles
------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  username     text not null,
  display_name text,
  bio          text,
  website      text,
  created_at   timestamptz not null default now()
);

------------------------------------------------------------------
-- projects
------------------------------------------------------------------
-- user_id points at profiles, not auth.users, so we can select the author
-- inline: .select('*, profiles(username, display_name)')
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles on delete cascade,
  title       text not null,
  slug        text not null unique,
  tagline     text,
  description text,
  status      text not null default 'building',
  repo_url    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index projects_user_id_idx on public.projects (user_id);
create index projects_created_at_idx on public.projects (created_at desc);

------------------------------------------------------------------
-- updates (the daily log entries under a project)
------------------------------------------------------------------
create table public.updates (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  day_number int,
  body       text not null,
  created_at timestamptz not null default now()
);

create index updates_project_id_idx on public.updates (project_id);

------------------------------------------------------------------
-- give every new signup a profile row
------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

------------------------------------------------------------------
-- profiles are public, but you can only edit your own
------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);
