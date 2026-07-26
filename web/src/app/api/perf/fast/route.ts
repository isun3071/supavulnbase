import { createHash } from 'crypto'
import { gzipSync } from 'zlib'

// CONTROL ctl-perf-001 + ctl-perf-002: correct on every axis the perf fixtures
// get wrong. Small, compressible and actually compressed, strongly validated
// with an ETag, cached immutably, and served with no artificial delay.
//
// This is the most important entry in the perf set. A probe that reports a
// finding here is producing a false positive on a route that is correct by
// construction, and web-vitals scoring currently has no precision evidence of
// any kind — so this control, not the findings, is what closes that exposure.

// Deliberately the SAME size and shape as the perf-001 body. A tiny payload
// would fall under the compression threshold and never be compressed at all,
// which would make this a broken control rather than a correct one — the first
// build of it did exactly that and served the control uncompressed.
const BODY = Array.from(
  { length: 900 },
  (_, i) =>
    `${i}\tBuildLog changelog line ${i}: routine entry, highly repetitive text that would compress extremely well if anything were compressing it.`,
).join('\n')

const ETAG = `"${createHash('sha1').update(BODY).digest('hex').slice(0, 16)}"`

// Compressed here explicitly rather than left to the framework. Next gzips page
// responses but NOT route-handler responses, so relying on it produced a
// "compression control" that was itself served uncompressed. Doing it in the
// handler makes the property deterministic and independent of framework
// behaviour, which is what a control has to be.
const GZIPPED = gzipSync(Buffer.from(BODY))

export async function GET(request: Request) {
  if (request.headers.get('if-none-match') === ETAG) {
    return new Response(null, { status: 304, headers: { ETag: ETAG } })
  }

  const wantsGzip = (request.headers.get('accept-encoding') ?? '').includes('gzip')

  const headers: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    ETag: ETAG,
    'Cache-Control': 'public, max-age=31536000, immutable',
    Vary: 'Accept-Encoding',
  }

  if (!wantsGzip) return new Response(BODY, { status: 200, headers })

  return new Response(GZIPPED, {
    status: 200,
    headers: { ...headers, 'Content-Encoding': 'gzip' },
  })
}
