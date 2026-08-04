import { NextResponse } from 'next/server'
import { listItems, addItem, resetItems } from '@/lib/qa-store'

export async function GET() {
  return NextResponse.json({ items: listItems() }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (body?.reset) {
    resetItems()
    return NextResponse.json({ ok: true, reset: true, count: listItems().length })
  }
  const count = addItem(typeof body?.title === 'string' ? body.title : '')
  return NextResponse.json({ ok: true, count })
}
