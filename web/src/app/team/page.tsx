import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

// Workspace member directory.
//
// FIXTURE NOTE (authz-002): this returns 404 to anonymous callers rather than
// redirecting — see the middleware. A redirect confirms the route exists; a 404
// makes it indistinguishable from a path that was never there, so the route is
// discoverable ONLY by carrying a session into the crawl.
//
// The finding: it lists every account's EMAIL ADDRESS and last sign-in time to
// any registered user. Emails live in auth.users and appear nowhere else in
// this app — public.profiles carries only username, display name and bio — so
// this is a genuinely new disclosure, not a restatement of another entry.
export const dynamic = 'force-dynamic'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } },
)

export default async function TeamPage() {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 })
  const users = data?.users ?? []

  return (
    <div>
      <h1 className="text-2xl font-bold">Workspace members</h1>
      <p className="mb-8 mt-1 text-sm text-[#8b949e]">
        Everyone with an account. {users.length} member(s).
      </p>

      <div className="flex flex-col gap-2">
        {users.map((u) => (
          <div key={u.id} className="card flex items-baseline justify-between gap-4 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {(u.user_metadata as any)?.display_name ?? (u.user_metadata as any)?.username ?? '—'}
              </p>
              <p className="truncate text-xs text-[#8b949e]">{u.email}</p>
            </div>
            <span className="shrink-0 text-xs text-[#484f58]">
              {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : 'never signed in'}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-8 text-sm">
        <Link href="/team/audit" className="text-[#58a6ff] hover:underline">
          Recent account activity →
        </Link>
      </p>
    </div>
  )
}
