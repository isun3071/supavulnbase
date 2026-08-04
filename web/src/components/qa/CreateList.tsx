'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// UI-STATE FIXTURES ui-002 (stale) and ctl-qa-001 (fresh).
//
// IMPORTANT CONTEXT FOR ANYONE READING THIS FIXTURE: staleness after a write
// does NOT occur naturally on this stack. Next 15 treats dynamic routes as
// immediately stale and refetches them on client-side navigation, so the audit
// of the generated app found writes propagating correctly everywhere (ctl-007).
// To present the defect at all it has to be CONSTRUCTED, by defeating the
// framework on purpose: hold the list in client state seeded once, and omit the
// router.refresh() that would reconcile it. That is what `invalidate={false}`
// does below. The control is the identical component with the refresh restored.
export default function CreateList({
  invalidate,
  initial,
}: {
  invalidate: boolean
  initial: string[]
}) {
  const router = useRouter()
  // Seeded once from props and never reconciled. When invalidate is true the
  // router refresh re-renders the server component with a new `initial`, and
  // syncing to it is what makes the correct variant correct. When false, this
  // state is the only source the list ever reads, so the write is invisible
  // until a full page load replaces the component entirely.
  const [items, setItems] = useState(initial)
  if (invalidate && initial.join('\u0000') !== items.join('\u0000')) {
    setItems(initial)
  }
  const [title, setTitle] = useState('')
  const [saved, setSaved] = useState(0)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    // The write really happens: it is recorded server-side and a reload shows it.
    await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/qa/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    setSaved((n) => n + 1)
    setTitle('')
    if (invalidate) router.refresh()
  }

  return (
    <div>
      <form onSubmit={create} className="mb-6 flex gap-2">
        <input
          className="input"
          placeholder="New item"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn" type="submit">
          Add
        </button>
      </form>
      {saved > 0 && (
        <p className="mb-4 text-sm text-[#3fb950]">Added {saved} item(s).</p>
      )}
      <ul className="flex flex-col gap-2">
        {items.map((t) => (
          <li key={t} className="card p-3 text-sm">
            {t}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-[#484f58]">{items.length} item(s) listed.</p>
    </div>
  )
}
