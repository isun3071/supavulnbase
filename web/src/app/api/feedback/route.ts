import { NextResponse } from 'next/server'
import { z } from 'zod'
import { render } from '@/lib/template'
import { hardened } from '@/lib/harden'

// Feedback form used by the beta banner. `renderTemplate` lets us reuse the
// same endpoint for the in-app toast and the email digest.
const FeedbackSchema = z.object({
  message: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  renderTemplate: z.string(),
})

const TEMPLATES: Record<string, string> = {
  toast: 'Thanks! ({{rating}}/5, {{rating * 20}}% happy)',
  digest: 'New feedback, rated {{rating}}/5:\n{{message}}',
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const parsed = FeedbackSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { message, rating, renderTemplate } = parsed.data

  // pick a known template, or treat the value as the template itself
  // HARDENED(injection): only named templates are accepted, so a
  // caller-supplied string is never evaluated.
  const template = hardened('injection')
    ? (TEMPLATES[renderTemplate] ?? TEMPLATES.toast)
    : (TEMPLATES[renderTemplate] ?? renderTemplate)

  const rendered = render(template, { rating }, { message })

  return NextResponse.json({ ok: true, rendered })
}
