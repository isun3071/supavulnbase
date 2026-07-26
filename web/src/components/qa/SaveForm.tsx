'use client'

import { useState } from 'react'

// UI-STATE FIXTURES ui-003 (silent failure) and ctl-qa-002 (honest failure).
//
// The endpoint returns HTTP 500 every time. The only difference between the two
// routes is whether the component looks at the response before declaring
// success. `honest={false}` ignores it entirely, which is the shape produced by
// `await fetch(...)` with no check — the single most common way a real save
// failure becomes invisible.
export default function SaveForm({ honest }: { honest: boolean }) {
  const [value, setValue] = useState('kept between sessions')
  const [status, setStatus] = useState<null | { ok: boolean; text: string }>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)

    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/qa/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })

    if (honest && !res.ok) {
      const body = await res.json().catch(() => ({}))
      setStatus({ ok: false, text: body.error ?? `Save failed (${res.status}). Not saved.` })
      setBusy(false)
      return
    }

    setStatus({ ok: true, text: 'Saved' })
    setBusy(false)
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <input className="input" value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="flex items-center gap-3">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {status && (
          <span className={`text-sm ${status.ok ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
            {status.text}
          </span>
        )}
      </div>
    </form>
  )
}
