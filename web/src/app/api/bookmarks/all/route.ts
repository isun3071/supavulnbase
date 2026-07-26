import { NextResponse } from 'next/server'
import { hardened } from '@/lib/harden'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/admin'

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

export async function GET() {
  // HARDENED(authz): scope the export to the caller instead of the workspace.
  if (hardened('authz')) {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const admin = adminClient()
    const { data } = await admin
      .from('bookmarks')
      .select('id, note, created_at, profiles(username, display_name), projects(title, slug)')
      .eq('user_id', user.id)
    return NextResponse.json({ count: data?.length ?? 0, bookmarks: data })
  }

  const admin = adminClient()
  const { data } = await admin
    .from('bookmarks')
    .select('id, note, created_at, profiles(username, display_name), projects(title, slug)')
    .order('created_at', { ascending: false })

  return NextResponse.json({ count: data?.length ?? 0, bookmarks: data })
}
