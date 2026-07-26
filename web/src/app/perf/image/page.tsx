// PERF FIXTURE perf-004: oversized image on the critical path.
//
// A 4MB PNG rendered above the fold at 320px wide, with no responsive sources
// and no lazy loading. The byte count and the position are both deterministic
// properties of the response and the markup.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export default function OversizedImagePage() {
  return (
    <div>
      <img
        src={`${BASE}/perf/hero-oversized.png`}
        alt="Project hero"
        width={320}
        height={228}
        className="rounded-lg"
      />
      <h1 className="mt-4 text-2xl font-bold">Lampshade</h1>
      <p className="mt-2 text-sm text-[#8b949e]">
        The hero above is a 4MB PNG displayed at 320px wide, eagerly loaded, above the fold.
      </p>
    </div>
  )
}
