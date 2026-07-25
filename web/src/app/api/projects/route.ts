import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// small json feed, we use it for the demo widget on the landing slide
export async function GET() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('projects')
    .select('id, title, slug, tagline, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ projects: data })
}
