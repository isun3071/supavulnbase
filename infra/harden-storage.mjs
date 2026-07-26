// HARDENING: the storage half of the `rls` class.
//
// Runs after seeding, because storage.buckets does not gain its `public`
// column until storage-api has migrated its own schema — attempting this in
// SQL alongside the policy changes fails on a fresh database.
const URL = process.env.SUPABASE_URL
const KEY = process.env.SERVICE_ROLE_KEY
const CLASS = process.env.HARDEN_CLASS ?? 'none'
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

// The volume persists between runs, so this must set the flag in BOTH
// directions. Hardening forward only would leave storage-001 fixed after any
// earlier rls/all run, and the per-class differential would not be minimal.
const wantPublic = !(CLASS === 'rls' || CLASS === 'all')

const res = await fetch(`${URL}/storage/v1/bucket/project-media`, {
  method: 'PUT',
  headers: h,
  body: JSON.stringify({ id: 'project-media', name: 'project-media', public: wantPublic }),
})
console.log(`project-media -> public=${wantPublic}: HTTP ${res.status}`)

const check = await (await fetch(`${URL}/storage/v1/bucket`, { headers: h })).json()
const b = check.find((x) => x.id === 'project-media')
if (!b || b.public !== wantPublic) {
  console.error(`storage bucket state did not take: ${JSON.stringify(b)}`)
  process.exit(1)
}
console.log(`verified: project-media public=${wantPublic}`)
