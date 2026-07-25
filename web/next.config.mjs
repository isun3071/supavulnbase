/** @type {import('next').NextConfig} */
const nextConfig = {
  // we deploy under /app on the demo box
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  output: 'standalone',
}

export default nextConfig
