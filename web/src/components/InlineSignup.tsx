'use client'

import { useState } from 'react'
import SignupForm from '@/components/SignupForm'

// SIGNUP_MODE=interaction (27.5% of the measured corpus).
//
// There is no /signup route in this mode — it 404s — and no link to
// registration anywhere in the served HTML. The form materialises only after a
// client-side state change, so a crawler that does not click never discovers
// that the app can be registered with at all.
//
// The button text deliberately does not say "sign up": in the field these are
// labelled "Get started", "Try it", "Join the beta". Matching on the word
// "signup" would find this too easily and would not reflect what is actually
// out there.
export default function InlineSignup() {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        Get started
      </button>
    )
  }

  return (
    <div className="card max-w-sm p-4">
      <h2 className="mb-1 font-semibold">Start a log</h2>
      <p className="mb-4 text-xs text-[#8b949e]">Takes about ten seconds.</p>
      <SignupForm compact />
    </div>
  )
}
