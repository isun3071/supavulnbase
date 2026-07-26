import Link from 'next/link'
import BackBehaviour from '@/components/qa/BackBehaviour'
export default function BackOkPage() {
  return (
    <div>
      <BackBehaviour trap={false} />
      <h1 className="text-2xl font-bold">Onboarding step 2 (correct)</h1>
      <p className="mb-6 mt-1 text-sm text-[#8b949e]">
        CONTROL. Normal history behaviour; Back returns to the previous view.
      </p>
      <Link href="/qa" className="text-[#58a6ff] hover:underline">
        Back to QA index
      </Link>
    </div>
  )
}
