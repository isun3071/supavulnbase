import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Reports which of the two diagnostic cookies actually arrived.
//
// Over plain http the expected result for a correct browser-equivalent client
// is bl_plain present and bl_secure absent. A client that returns BOTH is
// transmitting a Secure cookie over an insecure channel. A client that returns
// NEITHER is dropping cookies entirely, which is worth knowing before trusting
// any authed-discovery result from it.
export async function GET() {
  const jar = await cookies()
  return NextResponse.json(
    {
      bl_secure: jar.get('bl_secure')?.value ?? null,
      bl_plain: jar.get('bl_plain')?.value ?? null,
      note: 'over http, expect bl_plain present and bl_secure absent',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
