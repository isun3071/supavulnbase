import { NextResponse } from 'next/server'

// DIAGNOSTIC. Same cookie shape as ../secure-flag WITHOUT the Secure attribute,
// so it is storable and transmittable over plain http. The difference between
// which of the two comes back at ../echo tells you how the client handles the
// Secure attribute.
export async function POST() {
  const res = NextResponse.json({ set: 'bl_plain', attributes: 'HttpOnly; SameSite=Lax' })
  res.cookies.set('bl_plain', 'plain-flag-value', {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })
  return res
}
