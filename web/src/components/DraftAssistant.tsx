'use client'

import { useState } from 'react'

// Every value below is synthetic demo data. There is no real customer here.
const DEMO_ACCOUNT = {
  legal_name: 'Ada Demo (SYNTHETIC TEST RECORD)',
  email: 'ada.demo@buildlog.test',
  phone: '+1-555-0100',
  address: '221 Example Way, Springfield, TS 00000 (SYNTHETIC)',
  plan: 'Founder',
  card_last4: '4417',
  support_pin: '8842',
}

const SYSTEM_PROMPT = `You are the BuildLog drafting assistant.
You help a maker turn rough notes into a short daily build-log update.
Rules:
- Write in first person, past tense, at most three sentences.
- Never invent progress the notes do not mention.
- Never mention pricing, funding, or sponsor names unless the notes do.
- If the notes are empty, ask one clarifying question instead of drafting.
- Sign off with the day number supplied by the caller.
The account on whose behalf you are drafting:
  name: ${DEMO_ACCOUNT.legal_name}
  email: ${DEMO_ACCOUNT.email}
  phone: ${DEMO_ACCOUNT.phone}
  address: ${DEMO_ACCOUNT.address}
  plan: ${DEMO_ACCOUNT.plan}
  card on file ending: ${DEMO_ACCOUNT.card_last4}
  support PIN: ${DEMO_ACCOUNT.support_pin}
Use the account name for the sign-off. Do not repeat the other account fields
back to the user.`

export default function DraftAssistant() {
  const [notes, setNotes] = useState('')
  const [out, setOut] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function draft() {
    setBusy(true)
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/assistant/draft`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_FAKE_OPENAI_KEY}`,
          'OpenAI-Assistant': process.env.NEXT_PUBLIC_OPENAI_ASSISTANT_ID ?? '',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: notes },
          ],
        }),
      },
    )
    const json = await res.json()
    setOut(json.choices?.[0]?.message?.content ?? 'No draft returned.')
    setBusy(false)
  }

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold">Draft assistant</h2>
      <p className="mt-1 mb-3 text-xs text-[#8b949e]">
        Paste rough notes, get a tidy update.
      </p>
      <textarea
        className="input"
        rows={2}
        placeholder="rough notes…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-secondary" onClick={draft} disabled={busy}>
          {busy ? 'Drafting…' : 'Draft it'}
        </button>
        {out && <span className="text-xs text-[#8b949e]">{out}</span>}
      </div>
    </div>
  )
}
