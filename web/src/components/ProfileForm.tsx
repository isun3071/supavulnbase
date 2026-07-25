'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Profile = {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  website: string | null
}

export default function ProfileForm({ profile }: { profile: Profile }) {
  const supabase = createClient()

  const [displayName, setDisplayName] = useState(profile.display_name ?? '')
  const [bio, setBio] = useState(profile.bio ?? '')
  const [website, setWebsite] = useState(profile.website ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    await supabase
      .from('profiles')
      .update({ display_name: displayName, bio, website: website || null })
      .eq('id', profile.id)

    setSaving(false)
    setSaved(true)
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
        Username
      </label>
      <input className="input opacity-60" value={profile.username} disabled />

      <label className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
        Display name
      </label>
      <input
        className="input"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      <label className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Bio</label>
      <textarea className="input" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />

      <label className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Website</label>
      <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} />

      <div className="mt-2 flex items-center gap-3">
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-sm text-[#3fb950]">Saved</span>}
      </div>
    </form>
  )
}
