'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Project = {
  id: string
  title: string
  tagline: string | null
  description: string | null
  status: string
  repo_url: string | null
}

export default function ProjectEditor({ project }: { project: Project }) {
  const router = useRouter()
  const supabase = createClient()

  const [title, setTitle] = useState(project.title)
  const [tagline, setTagline] = useState(project.tagline ?? '')
  const [description, setDescription] = useState(project.description ?? '')
  const [status, setStatus] = useState(project.status)
  const [repoUrl, setRepoUrl] = useState(project.repo_url ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    await supabase
      .from('projects')
      .update({
        title,
        tagline,
        description,
        status,
        repo_url: repoUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', project.id)

    setSaving(false)
    setSaved(true)
  }

  async function remove() {
    if (!confirm('Delete this project and all its updates?')) return
    await supabase.from('projects').delete().eq('id', project.id)
    router.push('/dashboard')
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Name</label>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />

      <label className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Pitch</label>
      <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} />

      <label className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">About</label>
      <textarea
        className="input"
        rows={4}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <label className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Status</label>
      <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="building">building</option>
        <option value="paused">paused</option>
        <option value="shipped">shipped</option>
      </select>

      <label className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Repo</label>
      <input className="input" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />

      <div className="mt-2 flex items-center gap-3">
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button className="btn-secondary" type="button" onClick={remove}>
          Delete
        </button>
        {saved && <span className="text-sm text-[#3fb950]">Saved</span>}
      </div>
    </form>
  )
}
