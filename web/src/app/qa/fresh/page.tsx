import CreateList from '@/components/qa/CreateList'
import { listItems } from '@/lib/qa-store'

export const dynamic = 'force-dynamic'

export default async function FreshPage() {
  const items = listItems()
  return (
    <div>
      <h1 className="text-2xl font-bold">Checklist (correct)</h1>
      <p className="mb-6 mt-1 text-sm text-[#8b949e]">
        CONTROL. Same component, same endpoint; this one invalidates after the write, so the new
        item appears without a reload. Currently {items.length} item(s) stored.
      </p>
      <CreateList invalidate initial={items} />
    </div>
  )
}
