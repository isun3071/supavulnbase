import Link from 'next/link'
import BackBehaviour from '@/components/qa/BackBehaviour'
import { hardened } from '@/lib/harden'
export default function BackTrapPage() {
  return (
    <div>
      {/* HARDENED(qa): stop hijacking history. */}
      <BackBehaviour trap={!hardened('qa')} />
      <h1 className="text-2xl font-bold">Onboarding step 2 (trap)</h1>
      <p className="mb-6 mt-1 text-sm text-[#8b949e]">
        This page re-pushes itself onto the history stack, so browser Back never leaves it.
      </p>
      <Link href="/qa" className="text-[#58a6ff] hover:underline">
        Back to QA index (in-app link still works)
      </Link>
    </div>
  )
}
