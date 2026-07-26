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

// HARDENED(headers): hdr-002 is one flag; hdr-001 is the header set.
const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'" },
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
