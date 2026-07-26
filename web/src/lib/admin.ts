import { createClient } from '@supabase/supabase-js'

// Server-side elevated client.
//
// The key is read from a SERVER-ONLY variable first and falls back to the
// NEXT_PUBLIC_ one. That fallback is the vulnerability (key-001): a
// NEXT_PUBLIC_ variable is inlined into the browser bundle, so the same value
// that authorises these routes also ships to every visitor.
//
// HARDENED(secrets) supplies only SUPABASE_SERVICE_ROLE_KEY and withholds the
// NEXT_PUBLIC_ one at build time, so the key still authorises the server while
// no longer being inlined. That is the actual fix for the class — move the
// secret server-side — rather than deleting the feature that uses it, which
// would change behaviour beyond the flaw and break the differential.
//
// Constructed lazily, per request. At module scope an empty key throws during
// Next's build-time page-data collection, which is exactly how the first
// hardened build failed.
export function adminClient() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||
    ''
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  })
}
