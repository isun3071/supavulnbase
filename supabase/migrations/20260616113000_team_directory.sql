-- Team area: a member directory and a recent-activity feed for the workspace.
--
-- The activity feed reads GoTrue's audit log, which lives in the `auth` schema
-- and is not exposed through PostgREST. A security definer function is the
-- normal Supabase way to surface it.
--
-- FIXTURE NOTE: execute is granted to service_role ONLY, and revoked from anon
-- and authenticated. That is deliberate — it keeps PostgREST from being a
-- second route to this data, so the finding behind /team/audit is reachable
-- only by carrying a session into the crawl (authed-discovery) and not via
-- baas-direct. A finding reachable two ways teaches half as much.

-- Columns are exactly what GoTrue actually records here. There is deliberately
-- no ip_address: auth.audit_log_entries.ip_address is empty in this
-- configuration and the payload carries no remote_addr, so surfacing an IP
-- column would have put a claim in the manifest that the fixture cannot back.
create or replace function public.recent_auth_events(limit_count int default 25)
returns table (
  occurred_at timestamptz,
  action      text,
  actor       text,
  target      text,
  provider    text
)
language sql
security definer
set search_path = auth, public
as $$
  select
    created_at,
    payload ->> 'action',
    payload ->> 'actor_username',
    payload -> 'traits' ->> 'user_email',
    payload -> 'traits' ->> 'provider'
  from auth.audit_log_entries
  order by created_at desc
  limit limit_count
$$;

revoke all on function public.recent_auth_events(int) from public;
revoke all on function public.recent_auth_events(int) from anon;
revoke all on function public.recent_auth_events(int) from authenticated;
grant execute on function public.recent_auth_events(int) to service_role;
