import { NextResponse } from 'next/server'
import { z } from 'zod'

// Roll a project's update log into a short summary for the weekly digest.
//
// This lives server-side because it is the one thing client-side supabase-js
// cannot do: it calls an external model provider, and the provider key must not
// be in the browser. It is the shape a Server Action / API route generator
// produces for this stack.
//
// FIXTURE NOTE. Two things live here deliberately:
//
//  * schema-error. `toneProfile` is validated by Zod and is NOT a column on any
//    table, so the PostgREST OpenAPI root (info-001) has nothing to say about
//    it. POSTing {} is the only way to learn it exists.
//
//  * proxy false-positive control. The upstream is a stub; there is NO database
//    anywhere in this path. It returns intermittent 500s and 429s with
//    connect/timeout language, takes 0.2-4s at random, and echoes the request
//    back. Injection oracles keyed on timing, error strings or reflection fire
//    here and are wrong every time.

const UPSTREAM = 'https://api.model-provider.example.test/v1/summarize'

const SummarizeSchema = z.object({
  projectSlug: z.string().min(1),
  maxSentences: z.number().int().min(1).max(10),
  toneProfile: z.string(),
})

const TONES: Record<string, string> = {
  plain: 'Kept it factual.',
  upbeat: 'Leaned positive.',
  terse: 'Cut it short.',
}

function jitter(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min))
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const parsed = SummarizeSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', upstream: UPSTREAM, details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { projectSlug, maxSentences, toneProfile } = parsed.data

  // stand in for the provider round trip
  await new Promise((r) => setTimeout(r, jitter(180, 4100)))

  const roll = Math.random()
  if (roll < 0.16) {
    return NextResponse.json(
      {
        error: 'upstream_unavailable',
        upstream: UPSTREAM,
        detail: 'connect ETIMEDOUT: model provider did not respond in time',
        echo: parsed.data,
      },
      { status: 500 },
    )
  }
  if (roll < 0.3) {
    const retry = jitter(2, 30)
    return NextResponse.json(
      {
        error: 'rate_limited',
        upstream: UPSTREAM,
        detail: 'model provider returned 429; retry after backoff',
        retry_after: retry,
        echo: parsed.data,
      },
      { status: 429, headers: { 'Retry-After': String(retry) } },
    )
  }

  const tone = TONES[toneProfile] ?? `Unknown tone profile "${toneProfile}", used the default.`

  return NextResponse.json({
    ok: true,
    upstream: UPSTREAM,
    project: projectSlug,
    sentences: maxSentences,
    tone,
    summary: `Steady progress on ${projectSlug} across the logged updates. ${tone}`,
    latency_ms: jitter(180, 4100),
    echo: parsed.data,
  })
}
