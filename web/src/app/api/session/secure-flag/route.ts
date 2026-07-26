import { NextResponse } from 'next/server'

// DIAGNOSTIC, not a vulnerability. Sets a cookie WITH the Secure attribute over
// plain HTTP. Paired with ../plain-flag, which sets the same cookie without it.
//
// This exists to expose a client-side bug, not a server-side one: a grader that
// stores a Secure cookie and then never transmits it over http silently loses
// whatever session that cookie carried, and every route behind it becomes
// unreachable for reasons that look like the target's fault. Real browsers
// refuse to store a Secure cookie set over http at all, which is also correct
// behaviour and also observable here.
//
// Read the result at ../echo.
export async function POST() {
  const res = NextResponse.json({ set: 'bl_secure', attributes: 'Secure; HttpOnly; SameSite=Lax' })
  res.cookies.set('bl_secure', 'secure-flag-value', {
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })
  return res
}
