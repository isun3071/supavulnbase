/** @type {import('next').NextConfig} */
const HARDEN = process.env.NEXT_PUBLIC_HARDEN_CLASS ?? 'none'
const hardened = (c) => HARDEN === 'all' || HARDEN === c

// HARDENED(secrets): the deployment-file rewrites are what expose /.env and
// /.git/config under the app root. Dropping them is the whole fix.
const deployRewrites = hardened('secrets')
  ? []
  : [
      { source: '/.env', destination: '/api/deploy-env' },
      { source: '/.git/config', destination: '/api/deploy-git-config' },
    ]

// The Supabase API is a DIFFERENT ORIGIN from the app: the app is on :8092 and
// its API on :8093 (and :8090 / :8055 for the vulnerable pair). A CSP without an
// explicit connect-src falls back to default-src 'self', which blocks every
// supabase-js call before it is dispatched — the browser shows "failed to
// fetch" and NOTHING in the network tab, because no request is ever made.
//
// That is how the first hardened build shipped, and it made the reference
// unusable: a target that cannot log in or load data cannot be crawled, so the
// differential is meaningless. Hardening must not break the app.
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin
  } catch {
    return ''
  }
})()

// HARDENED(headers): hdr-002 is one flag; hdr-001 is the header set.
const SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `connect-src 'self' ${SUPABASE_ORIGIN}`.trim(),
      `img-src 'self' data: ${SUPABASE_ORIGIN}`.trim(),
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  output: 'standalone',
  poweredByHeader: !hardened('headers'),

  async rewrites() {
    return [{ source: '/__manifest', destination: '/api/manifest' }, ...deployRewrites]
  },

  async headers() {
    if (!hardened('headers')) return []
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
}

export default nextConfig
