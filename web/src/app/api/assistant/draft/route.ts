import { NextResponse } from 'next/server'

// Stub that mimics the chat-completions response shape. No model is called and
// no network request leaves the box.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const notes: string = body?.messages?.find((m: any) => m.role === 'user')?.content ?? ''

  const content = notes.trim()
    ? `Spent the day on it: ${notes.trim().slice(0, 140)}. Slower than hoped, but it works now.`
    : 'What did you actually get working today?'

  return NextResponse.json({
    id: 'chatcmpl-demo',
    object: 'chat.completion',
    model: body?.model ?? 'gpt-4o-mini',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  })
}
