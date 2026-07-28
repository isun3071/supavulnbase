import Link from 'next/link'
import { notFound } from 'next/navigation'
import SignupForm from '@/components/SignupForm'
import { SIGNUP_MODE } from '@/lib/signup'

export default function SignupPage() {
  // SIGNUP_MODE=interaction: there is no conventional registration route at all.
  if (SIGNUP_MODE === 'interaction') notFound()

  // CONTROL, SIGNUP_MODE=sso (7.5%): self-registration is not offered. There is
  // no form to fill and no account to create, so a grader must report this as
  // N/A rather than as a failed registration.
  if (SIGNUP_MODE === 'sso') {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-1 text-xl font-bold">Sign in</h1>
        <p className="mb-6 text-sm text-[#8b949e]">
          BuildLog uses your organisation account. Self-registration is not available.
        </p>
        <button className="btn-secondary w-full" disabled>
          Continue with SSO
        </button>
        <p className="mt-4 text-xs text-[#484f58]">
          Ask your workspace admin for an invitation.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-xl font-bold">Start a log</h1>
      <p className="mb-6 text-sm text-[#8b949e]">Takes about ten seconds.</p>
      <SignupForm />
      <p className="mt-4 text-sm text-[#8b949e]">
        Already have one?{' '}
        <Link href="/login" className="text-[#58a6ff] hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}
