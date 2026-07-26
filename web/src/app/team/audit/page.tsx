import { createClient } from '@supabase/supabase-js'

// Recent account activity, read from GoTrue's audit log.
//
// FIXTURE NOTE (authz-003): second anon-404 route, and the second real finding
// behind the authed-discovery mechanism. It exposes every account's
// authentication history — sign-ins, signups, password-recovery requests — keyed
// by EMAIL ADDRESS, to any registered user. It reveals who is active, when, and
// which accounts have requested a password reset.
//
// It does NOT expose IP addresses: GoTrue records none in this configuration,
// and a column that is always empty would be a claim the fixture cannot back.
//
// The underlying function is granted to service_role only, so PostgREST is not
// a second path to it.
export const dynamic = 'force-dynamic'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } },
)

export default async function TeamAuditPage() {
  const { data: events } = await admin.rpc('recent_auth_events', { limit_count: 25 })

  return (
    <div>
      <h1 className="text-2xl font-bold">Recent activity</h1>
      <p className="mb-8 mt-1 text-sm text-[#8b949e]">
        Sign-ins and account events across the workspace.
      </p>

      <div className="flex flex-col gap-2">
        {(events ?? []).map((e: any, i: number) => (
          <div key={i} className="card flex items-baseline justify-between gap-4 p-3 text-sm">
            <span className="font-mono text-xs text-[#3fb950]">{e.action}</span>
            <span className="min-w-0 flex-1 truncate px-3 text-[#8b949e]">
              {e.actor}
              {e.target && e.target !== e.actor ? ` → ${e.target}` : ''}
            </span>
            <span className="shrink-0 font-mono text-xs text-[#484f58]">{e.provider ?? '—'}</span>
          </div>
        ))}
        {(events ?? []).length === 0 && (
          <p className="text-sm text-[#484f58]">No activity recorded yet.</p>
        )}
      </div>
    </div>
  )
}
