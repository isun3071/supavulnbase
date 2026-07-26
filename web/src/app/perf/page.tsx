import Link from 'next/link'

// Perf fixtures live under /perf so a three-second sleep never lands in the
// main application flow, where it would slow the crawler, trip timeouts and
// possibly gate off the security and QA probes entirely. The whole group is
// also mode-gated: with PERF_MODE=off these routes 404 (see middleware).
export default function PerfIndex() {
  const routes = [
    ['/perf/slow', 'TTFB floor: at least 3s by construction', 'perf-005'],
    ['/perf/requests', '60 cache-busted requests on the critical path', 'perf-003'],
    ['/perf/image', '4MB hero image above the fold', 'perf-004'],
    ['/perf/fast', 'CONTROL: fast, light, cached — must not fire', 'ctl-perf-003'],
  ]
  return (
    <div>
      <h1 className="text-2xl font-bold">Performance fixtures</h1>
      <p className="mb-8 mt-1 text-sm text-[#8b949e]">
        Deliberate performance defects, isolated from the rest of the app.
      </p>
      <div className="flex flex-col gap-3">
        {routes.map(([href, label, id]) => (
          <Link key={href} href={href} className="card block p-4 hover:border-[#30363d]">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-semibold">{label}</span>
              <span className="pill shrink-0">{id}</span>
            </div>
            <p className="mt-1 text-xs text-[#484f58]">{href}</p>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-xs text-[#484f58]">
        Also: <code>/api/perf/uncompressed</code> (perf-001),{' '}
        <code>/api/perf/no-validator</code> (perf-002),{' '}
        <code>/api/perf/fast</code> (control).
      </p>
    </div>
  )
}
