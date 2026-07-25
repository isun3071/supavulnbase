import { NextResponse } from 'next/server'

// Health probe for the outbound webhook integration. There is no database
// anywhere in this path — it emulates a flaky third-party endpoint so the
// status widget has something to display. Latency and failures are random.

const UPSTREAM = 'https://hooks.partner.example.test/v1/ping'

function jitter(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min))
}

async function handle(request: Request, payload: unknown) {
  await new Promise((r) => setTimeout(r, jitter(120, 4200)))

  const roll = Math.random()

  if (roll < 0.18) {
    return NextResponse.json(
      {
        error: 'upstream_unavailable',
        upstream: UPSTREAM,
        detail: 'connect ETIMEDOUT: partner gateway did not respond in time',
        echo: payload,
      },
      { status: 500 },
    )
  }

  if (roll < 0.32) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        upstream: UPSTREAM,
        detail: 'partner gateway returned 429; retry after backoff',
        retry_after: jitter(2, 30),
        echo: payload,
      },
      { status: 429, headers: { 'Retry-After': String(jitter(2, 30)) } },
    )
  }

  return NextResponse.json({
    ok: true,
    upstream: UPSTREAM,
    latency_ms: jitter(120, 4200),
    echo: payload,
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  return handle(request, Object.fromEntries(searchParams))
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}))
  return handle(request, payload)
}
