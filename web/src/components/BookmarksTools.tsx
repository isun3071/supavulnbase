'use client'

import { useEffect, useState } from 'react'

// DISCOVERY DIAL. The finding at the export route is identical in all four
// modes; only how a grader can learn the path changes.
//
//   linked        anchor in the server HTML                  -> static-crawl
//   bundle        literal in this chunk, never rendered       -> bundle-mining
//   interaction   returned by the server only after a click   -> interaction
//   concatenated  assembled from fragments at click time      -> suffix-convention
//
// IMPLEMENTATION NOTE. Each branch tests `process.env.NEXT_PUBLIC_DISCOVERY_MODE`
// DIRECTLY rather than through a local constant. Next inlines that expression at
// build time, so the comparison folds to a literal false and the minifier drops
// the dead branch along with any path string inside it. Reading the value into a
// `const MODE` first defeats this: the folding does not happen, every branch
// survives, and the path ends up in the bundle in all four modes — which is
// exactly what dial-sweep.sh caught. The sweep asserts the absence, so this
// cannot regress silently.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export default function BookmarksTools() {
  const [tools, setTools] = useState<{ label: string; href: string }[]>([])
  const [busy, setBusy] = useState(false)

  // Hook stays above the conditional returns so the rules of hooks hold. The
  // mode test folds at build time, so this whole body — and the path literal
  // with it — exists only in the `bundle` build.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DISCOVERY_MODE === 'bundle') {
      // handy from the console when we need the numbers
      ;(window as any).exportAllBookmarks = () =>
        fetch(`${BASE}/api/bookmarks/all`).then((r) => r.json())
    }
  }, [])

  if (process.env.NEXT_PUBLIC_DISCOVERY_MODE === 'bundle') {
    // Not surfaced in the UI yet.
    return null
  }

  if (process.env.NEXT_PUBLIC_DISCOVERY_MODE === 'interaction') {
    return (
      <div className="mt-6">
        <button
          className="btn-secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const res = await fetch(`${BASE}/api/bookmarks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'tools' }),
            })
            const json = await res.json()
            setTools(json.tools ?? [])
            setBusy(false)
          }}
        >
          Developer tools
        </button>
        {tools.map((t) => (
          <p key={t.href} className="mt-2 text-xs">
            <a href={`${BASE}${t.href}`} className="text-[#58a6ff] hover:underline">
              {t.label}
            </a>
          </p>
        ))}
      </div>
    )
  }

  if (process.env.NEXT_PUBLIC_DISCOVERY_MODE === 'concatenated') {
    const seg = ['api', 'bookmarks', 'all']
    return (
      <div className="mt-6">
        <button
          className="btn-secondary"
          onClick={() => setTools([{ label: 'Export all bookmarks', href: '/' + seg.join('/') }])}
        >
          Developer tools
        </button>
        {tools.map((t) => (
          <p key={t.href} className="mt-2 text-xs">
            <a href={`${BASE}${t.href}`} className="text-[#58a6ff] hover:underline">
              {t.label}
            </a>
          </p>
        ))}
      </div>
    )
  }

  // linked (default)
  return (
    <p className="mt-6 text-xs text-[#484f58]">
      Admin:{' '}
      <a href={`${BASE}/api/bookmarks/all`} className="text-[#58a6ff] hover:underline">
        export all bookmarks
      </a>
    </p>
  )
}
