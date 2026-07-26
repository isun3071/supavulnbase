import { NextResponse } from 'next/server'

// Backing store for the QA fixtures. In-memory on purpose: these routes exist
// to exercise UI-state behaviour, and putting a database in the path would add
// a confound that has nothing to do with what is being measured.
const items: string[] = ['Draft the README', 'Wire up the feed', 'Fix the slug collision']

export async function GET() {
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (typeof body?.title === 'string' && body.title.trim()) {
    items.push(body.title.trim())
  }
  return NextResponse.json({ ok: true, count: items.length })
}
