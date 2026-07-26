import Link from 'next/link'

// UI-state honesty fixtures. Every one is intent-independent and invisible to a
// security scanner: nothing here is a vulnerability, and every defect has a
// byte-adjacent control that must not fire.
export default function QaIndex() {
  const pairs = [
    ['Stale UI after create', '/qa/stale', 'ui-002', '/qa/fresh', 'ctl-qa-001'],
    ['Silent failure on save', '/qa/silent-save', 'ui-003', '/qa/honest-save', 'ctl-qa-002'],
    ['Deep-link renders a shell', '/qa/deep-link', 'ui-004', '/qa/deep-link-ok', 'ctl-qa-003'],
    ['Back button does not go back', '/qa/back-trap', 'ui-005', '/qa/back-ok', 'ctl-qa-004'],
    ['Referenced chunk 404s', '/qa/dead-chunk', 'ui-006', '/qa/live-chunk', 'ctl-qa-005'],
  ]
  return (
    <div>
      <h1 className="text-2xl font-bold">UI-state fixtures</h1>
      <p className="mb-8 mt-1 text-sm text-[#8b949e]">
        Each row is a defect and its control. The control must not produce a finding.
      </p>
      <div className="flex flex-col gap-3">
        {pairs.map(([label, bad, badId, good, goodId]) => (
          <div key={bad} className="card p-4">
            <p className="font-semibold">{label}</p>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <Link href={bad} className="text-[#f85149] hover:underline">
                {bad} <span className="text-[#484f58]">({badId})</span>
              </Link>
              <Link href={good} className="text-[#3fb950] hover:underline">
                {good} <span className="text-[#484f58]">({goodId})</span>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
