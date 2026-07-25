/** @type {import('next').NextConfig} */
const nextConfig = {
  // we deploy under /app on the demo box
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  output: 'standalone',

  async rewrites() {
    return [
      // Machine-readable ground truth. Served relative to basePath, so it is
      // /app/__manifest on the subpath target and /__manifest on the root one.
      { source: '/__manifest', destination: '/api/manifest' },

      // Deployment-shape emulation: on the demo box the webserver's document
      // root is the project directory, so these sit beside the build and are
      // served as static text. Both resolve against the APP root, not the
      // origin. See MANIFEST.md (probe-001 / probe-002).
      { source: '/.env', destination: '/api/deploy-env' },
      { source: '/.git/config', destination: '/api/deploy-git-config' },
    ]
  },
}

export default nextConfig
