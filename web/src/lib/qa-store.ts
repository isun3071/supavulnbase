// Shared in-memory store for the UI-state fixtures.
//
// It lives here, rather than inside the route handler, so the PAGES can read it
// too. That is the whole point: ui-002 is "the write succeeded but the list did
// not update until a manual refresh", and demonstrating that requires the
// server render to reflect the write while the client state does not.
//
// The first build passed a hardcoded array into the component instead. The
// write really landed, but no render ever read the store — so a manual reload
// did not update the list either, and /qa/stale and /qa/fresh were
// indistinguishable. That broke the control as badly as the defect: ctl-qa-001
// claimed "create invalidates and the list updates" and it never did.
//
// In-memory on purpose: putting a database in the path would add a confound
// that has nothing to do with the UI-state behaviour being measured. It resets
// when the web container restarts, which is fine — the seed below is the
// starting state.
const SEED = ['Draft the README', 'Wire up the feed', 'Fix the slug collision']

const items: string[] = [...SEED]

export function listItems(): string[] {
  return [...items]
}

export function addItem(title: string): number {
  const t = title.trim()
  if (t) items.push(t)
  return items.length
}

export function resetItems(): void {
  items.length = 0
  items.push(...SEED)
}
