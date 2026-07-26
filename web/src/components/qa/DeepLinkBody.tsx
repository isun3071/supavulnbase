'use client'

import { useEffect, useState } from 'react'

// UI-STATE FIXTURES ui-004 (deep-link shell) and ctl-qa-003 (renders on load).
//
// `fromNavigationOnly` reproduces the classic SPA defect: the data is fetched
// only in response to a client-side navigation event, so a direct GET of the
// URL returns markup with an empty container and the content never arrives.
// A crawler that follows the link from elsewhere sees content; one that
// requests the URL cold sees a shell. The control fetches on mount.
export default function DeepLinkBody({ fromNavigationOnly }: { fromNavigationOnly: boolean }) {
  const [rows, setRows] = useState<string[] | null>(null)

  useEffect(() => {
    if (fromNavigationOnly) {
      // Only populate if we arrived via an in-app navigation. A cold load has
      // no history entry to come from, so this never fires.
      const arrivedFromNav = window.history.state?.__buildlogNav === true
      if (!arrivedFromNav) return
    }
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/qa/items`)
      .then((r) => r.json())
      .then((d) => setRows(d.items ?? []))
      .catch(() => setRows([]))
  }, [fromNavigationOnly])

  if (rows === null) {
    return <div id="deep-link-content" />
  }

  return (
    <ul id="deep-link-content" className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r} className="card p-3 text-sm">
          {r}
        </li>
      ))}
    </ul>
  )
}
