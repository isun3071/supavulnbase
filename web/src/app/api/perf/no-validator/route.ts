import { createHash } from 'crypto'
import { hardened } from '@/lib/harden'
// PERF FIXTURE perf-002: static-shaped asset with no validator and no caching.
//
// The body never changes, so it is perfectly cacheable, but the response
// carries no Cache-Control, no ETag and no Last-Modified. Every visit is a full
// re-download and no conditional request is possible.
//
// Paired with ctl-perf-002, which serves the same shape with an ETag and a
// long immutable max-age.

const BODY = JSON.stringify({
  palette: ['#0d1117', '#161b22', '#21262d', '#30363d', '#58a6ff', '#3fb950'],
  radii: [4, 6, 10, 999],
  note: 'design tokens, unchanged since the first commit',
})

const ETAG = `"${createHash('sha1').update(BODY).digest('hex').slice(0, 16)}"`

export async function GET(request: Request) {
  // HARDENED(perf): give it a validator and a cache policy.
  if (hardened('perf')) {
    if (request.headers.get('if-none-match') === ETAG) {
      return new Response(null, { status: 304, headers: { ETag: ETAG } })
    }
    return new Response(BODY, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ETag: ETAG,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }
  return new Response(BODY, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // deliberately: no Cache-Control, no ETag, no Last-Modified
    },
  })
}
