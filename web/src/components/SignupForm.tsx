'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SIGNUP_MODE } from '@/lib/signup'

// The registration form, shared by /signup and by the interaction-revealed
// variant on the homepage, so every mode exercises the SAME submit path.
export default function SignupForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, display_name: username } },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // CONTROL (confirm mode): the account is created but no session is issued
    // because the deployment requires email confirmation. Saying so plainly is
    // the correct behaviour — everything past this point is legitimately
    // unreachable, and a grader should record N/A rather than a failure.
    if (!data.session) {
      setNotice('Account created. Check your email to confirm before signing in.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input
        className="input"
        placeholder="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
      <input
        className="input"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        className="input"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={6}
        required
      />

      {SIGNUP_MODE === 'unlabeled' && (
        // The caption is a sibling <span>, deliberately NOT associated with the
        // input: no htmlFor, and the input carries no name, id, placeholder or
        // aria-label. It is `required`, so leaving it empty makes the browser
        // block submit before any request is dispatched. A filler that locates
        // fields by accessible name cannot see this one, so the form appears to
        // do nothing at all when submitted.
        <div>
          <span className="mb-1 block text-xs text-[#8b949e]">Display name</span>
          <input className="input" required />
        </div>
      )}

      {error && <p className="text-sm text-[#f85149]">{error}</p>}
      {notice && <p className="text-sm text-[#3fb950]">{notice}</p>}

      <button className="btn" type="submit" disabled={loading}>
        {loading ? 'Creating…' : compact ? 'Create account' : 'Create account'}
      </button>
    </form>
  )
}
