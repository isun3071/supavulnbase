import CreateList from '@/components/qa/CreateList'
import { listItems } from '@/lib/qa-store'
import { hardened } from '@/lib/harden'

// Rendered fresh on every request, so the server ALWAYS reflects the store.
// The staleness is purely client-side, which is what makes it a UI-state
// defect rather than a broken write.
export const dynamic = 'force-dynamic'

export default async function StalePage() {
  const items = listItems()
  return (
    <div>
      <h1 className="text-2xl font-bold">Checklist (stale)</h1>
      <p className="mb-6 mt-1 text-sm text-[#8b949e]">
        Adding an item succeeds server-side, but this list does not reflect it until you reload
        the page manually. Currently {items.length} item(s) stored.
      </p>
      <CreateList invalidate={hardened('qa')} initial={items} />
    </div>
  )
}
