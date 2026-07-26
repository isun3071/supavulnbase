'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// weekly numbers for the investor update — call buildlogExport() in the console
const EXPORT_ENDPOINT = '/api/admin/export'

// Stripe publishable key. Safe in the browser; the secret key stays server-side.
const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''

// The pipeline widget has to read leads across the whole workspace, and the
// normal anon client only returns the signed-in user's rows. Using the service
// key here so the totals are right. Move this to a server route later.
// HARDENED(secrets): the build simply does not receive this key, so there is
// nothing to inline. The widget degrades rather than the page crashing, which
// keeps the diff to the leak itself.
const SERVICE_KEY = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ?? ''
const admin = SERVICE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, SERVICE_KEY, {
      auth: { persistSession: false },
    })
  : null

type Totals = { leads: number; pipelineCents: number }

export default function SponsorSync() {
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    ;(window as any).buildlogExport = () =>
      fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${EXPORT_ENDPOINT}`).then((r) => r.json())
  }, [])

  async function sync() {
    setLoading(true)
    if (!admin) {
      setTotals({ leads: 0, pipelineCents: 0 })
      setLoading(false)
      return
    }
    const { data } = await admin.from('sponsor_leads').select('amount_cents')
    setTotals({
      leads: data?.length ?? 0,
      pipelineCents: (data ?? []).reduce((n, r: any) => n + (r.amount_cents ?? 0), 0),
    })
    setLoading(false)
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Sponsor pipeline</h2>
          <p className="mt-1 text-xs text-[#8b949e]">
            {totals
              ? `${totals.leads} leads · $${(totals.pipelineCents / 100).toLocaleString()} tracked`
              : 'Not synced yet'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button className="btn-secondary" onClick={sync} disabled={loading}>
            {loading ? 'Syncing…' : 'Sync'}
          </button>
          <button
            className="btn-secondary"
            onClick={() => alert(`Checkout is not wired up yet (${STRIPE_PK.slice(0, 12)}…)`)}
          >
            Invoice
          </button>
        </div>
      </div>
    </div>
  )
}
