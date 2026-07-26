// PERF FIXTURE perf-003: excessive resource requests on the critical path.
//
// One 68-byte image, requested 60 times with a distinct cache-busting query
// string each time, so nothing can be reused. Deterministic: the count is a
// property of the served markup, not of the environment.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const N = 60

export default function ManyRequestsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Contributor wall</h1>
      <p className="mb-6 mt-1 text-sm text-[#8b949e]">
        {N} avatars, each cache-busted so the browser cannot reuse a single one.
      </p>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: N }, (_, i) => (
          <img
            key={i}
            src={`${BASE}/perf/dot.png?v=${i}`}
            alt=""
            width={16}
            height={16}
            className="rounded"
          />
        ))}
      </div>
    </div>
  )
}
