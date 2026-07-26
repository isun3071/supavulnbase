// PERF FIXTURE perf-005: TTFB floor.
//
// The manifest claims "TTFB exceeds 3s by construction", NOT a measured number.
// A latency value would depend on the machine, the container runtime and the
// load, so it cannot be ground truth. A server-side sleep can be: whatever the
// environment, the first byte cannot arrive sooner than the sleep.
export const dynamic = 'force-dynamic'

export default async function SlowPage() {
  await new Promise((r) => setTimeout(r, 3000))
  return (
    <div>
      <h1 className="text-2xl font-bold">Slow route</h1>
      <p className="mt-2 text-sm text-[#8b949e]">
        This page blocks for three seconds server-side before rendering. Ground truth is the
        floor, not a measurement.
      </p>
    </div>
  )
}
