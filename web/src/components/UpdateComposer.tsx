'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function UpdateComposer({
  projectId,
  nextDay,
}: {
  projectId: string
  nextDay: number
}) {
  const router = useRouter()
  const supabase = createClient()

  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  async function post(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSaving(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    await supabase.from('updates').insert({
      project_id: projectId,
      user_id: user?.id,
      day_number: nextDay,
      body,
    })

    setBody('')
    setSaving(false)
    router.refresh()
  }

  return (
    <form onSubmit={post} className="card mb-6 p-4">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
        Day {nextDay}
      </label>
      <textarea
        className="input"
        rows={3}
        placeholder="What did you get done?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-3 flex justify-end">
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Posting…' : 'Post update'}
        </button>
      </div>
    </form>
  )
}
