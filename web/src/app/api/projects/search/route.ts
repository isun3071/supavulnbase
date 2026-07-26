import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hardened } from '@/lib/harden'

// Search across the public project list. Matches name and pitch.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''

  const supabase = await createClient()

  // HARDENED(injection): PostgREST filter grammar is comma-delimited, so any
  // comma in user input adds a condition. Stripping the delimiters is the
  // minimal fix; nothing else about the route changes.
  const safe = hardened('injection') ? q.replace(/[,()"\\]/g, '') : q
  const filter = 'title.ilike.%' + safe + '%,tagline.ilike.%' + safe + '%'

  const { data, error } = await supabase
    .from('projects')
    .select('id, title, slug, tagline, status')
    .or(filter)
    .limit(25)

  if (error) {
    return NextResponse.json({ error: error.message, filter }, { status: 400 })
  }

  return NextResponse.json({ query: q, count: data?.length ?? 0, results: data })
}
