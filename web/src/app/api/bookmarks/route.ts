import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// The bookmarks collection for the signed-in user. Correctly scoped: it reads
// through the anon client with the caller's session, so whatever the RLS dial
// is set to is what governs the result.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ bookmarks: [] }, { status: 401 })

  const { data } = await supabase
    .from('bookmarks')
    .select('id, note, created_at, projects(title, slug)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ bookmarks: data })
}

// Used by the "developer tools" disclosure on the bookmarks page.
//
// FIXTURE NOTE: in DISCOVERY_MODE=interaction this is the only place the
// export path is ever emitted. It is returned solely in response to a POST the
// UI sends when the user clicks, so a crawler that never interacts never sees
// the path, and the path appears in no markup and no bundle string.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))

  if (body?.action === 'tools' && process.env.NEXT_PUBLIC_DISCOVERY_MODE === 'interaction') {
    return NextResponse.json({
      tools: [{ label: 'Export all bookmarks', href: '/api/bookmarks/all' }],
    })
  }

  return NextResponse.json({ tools: [] })
}
