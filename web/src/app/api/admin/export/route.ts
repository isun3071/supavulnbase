import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Internal: dumps the workspace for the weekly investor update. Not linked from
// the UI, we just hit it from the browser console when we need the numbers.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } },
)

export async function GET() {
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
