// CONTROL ctl-perf-003: a page that must NOT produce a performance finding.
//
// No blocking work, no oversized asset, two small requests, and the one asset
// it does load is cached immutably with a validator. It sits in the same route
// group as the defects so a probe cannot pass by treating /perf/* as
// uniformly bad.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export default function FastPage() {
  return (
    <div>
      <img src={`${BASE}/perf/dot.png`} alt="" width={16} height={16} />
      <h1 className="mt-4 text-2xl font-bold">Fast route</h1>
      <p className="mt-2 text-sm text-[#8b949e]">
        Light, compressed, cached, no artificial delay. A finding reported against this page is
        a false positive.
      </p>
    </div>
  )
}
