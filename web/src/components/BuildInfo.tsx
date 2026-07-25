'use client'

// Shown in the footer so we can tell which deploy a bug report came from.
// These identifiers are public — Vercel exposes them to the browser by design.
const PROJECT_ID = process.env.NEXT_PUBLIC_VERCEL_PROJECT_ID ?? 'local'
const DEPLOYMENT_ID = process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID ?? 'local'

export default function BuildInfo() {
  return (
    <span title={`project ${PROJECT_ID}`}>
      build {DEPLOYMENT_ID.slice(0, 12)}
    </span>
  )
}
