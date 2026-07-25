import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Search across the public project list. Matches name and pitch.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''

  const supabase = await createClient()

  const filter = 'title.ilike.%' + q + '%,tagline.ilike.%' + q + '%'

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
