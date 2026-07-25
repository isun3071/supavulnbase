'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // slugs are unique, tack on a few random chars so two "todo app"s can coexist
  return `${base || 'project'}-${Math.random().toString(36).slice(2, 6)}`
}

export default function NewProjectForm() {
  const router = useRouter()
  const supabase = createClient()

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase.from('projects').insert({
      user_id: user?.id,
      title,
      slug: slugify(title),
      tagline,
      description,
      repo_url: repoUrl || null,
    })

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setTitle('')
    setTagline('')
    setDescription('')
    setRepoUrl('')
    setSaving(false)
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        New project
      </button>
    )
  }

  return (
    <form onSubmit={create} className="card flex flex-col gap-3 p-4">
      <input
        className="input"
        placeholder="Project name"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <input
        className="input"
        placeholder="One-line pitch"
        value={tagline}
        onChange={(e) => setTagline(e.target.value)}
      />
      <textarea
        className="input"
        rows={3}
        placeholder="What is it, and why?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <input
        className="input"
        placeholder="Repo URL (optional)"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
      />

      {error && <p className="text-sm text-[#f85149]">{error}</p>}

      <div className="flex gap-2">
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Creating…' : 'Create'}
        </button>
        <button className="btn-secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
