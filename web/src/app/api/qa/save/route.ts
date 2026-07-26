import { NextResponse } from 'next/server'

// Always fails. Both ui-003 and ctl-qa-002 post here; the only thing that
// differs between them is whether the client checks the response before
// reporting success.
export async function POST() {
  return NextResponse.json(
    { error: 'Upstream rejected the write. Nothing was saved.' },
    { status: 500 },
  )
}
