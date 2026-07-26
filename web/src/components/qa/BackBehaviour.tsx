'use client'

import { useEffect } from 'react'

// UI-STATE FIXTURES ui-005 (dead back button) and ctl-qa-004 (normal history).
//
// `trap` pushes a duplicate history entry and re-pushes it on popstate, so the
// browser Back button never returns to the previous view. This is a real
// pattern — it usually arrives via a well-meant "are you sure you want to
// leave?" guard — and it is invisible to any scanner that does not drive a
// browser.
export default function BackBehaviour({ trap }: { trap: boolean }) {
  useEffect(() => {
    if (!trap) return
    history.pushState({ __trap: true }, '', location.href)
    const onPop = () => {
      history.pushState({ __trap: true }, '', location.href)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [trap])

  return null
}
