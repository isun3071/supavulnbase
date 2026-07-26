import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Internal helper for the bookmarks migration script. Reads across all users
// so we can count how many people saved each project.
//
// FIXTURE NOTE: this is the finding the DISCOVERY dial gates. It is an
// APP-LAYER authorization failure — it checks no session at all — and is
// therefore independent of the RLS dial: it leaks every user's private
// bookmark notes in all three RLS modes, because it holds a service-role
// client. The RLS dial governs public.bookmarks via PostgREST; this route
// governs the same data via the app. Two dials, two surfaces, no overlap.
//
// It is a Next route, so the PostgREST OpenAPI root (info-001) cannot reveal
// it. That is what makes the discovery dial meaningful: the table is always
// enumerable, this route is not.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } },
)

export async function GET() {
  const { data } = await admin
    .from('bookmarks')
    .select('id, note, created_at, profiles(username, display_name), projects(title, slug)')
    .order('created_at', { ascending: false })

  return NextResponse.json({ count: data?.length ?? 0, bookmarks: data })
}
