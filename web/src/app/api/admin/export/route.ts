import { NextResponse } from 'next/server'
import { hardened } from '@/lib/harden'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/admin'

// Internal: dumps the workspace for the weekly investor update. Not linked from
// the UI, we just hit it from the browser console when we need the numbers.

export async function GET() {
  // HARDENED(authz): the route required no credential at all.
  if (hardened('authz')) {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = adminClient()
  const [leads, payouts, drafts, profiles] = await Promise.all([
    admin.from('sponsor_leads').select('*'),
    admin.from('payout_accounts').select('*'),
    admin.from('drafts').select('*'),
    admin.from('profiles').select('*'),
  ])

  return NextResponse.json({
    generated: 'weekly-export',
    sponsor_leads: leads.data,
    payout_accounts: payouts.data,
    drafts: drafts.data,
    profiles: profiles.data,
  })
}
