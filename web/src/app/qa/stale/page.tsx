import CreateList from '@/components/qa/CreateList'
export const dynamic = 'force-dynamic'
export default function StalePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Checklist (stale)</h1>
      <p className="mb-6 mt-1 text-sm text-[#8b949e]">
        Adding an item succeeds server-side, but this list never reflects it until you reload
        manually.
      </p>
      <CreateList invalidate={false} initial={['Draft the README', 'Wire up the feed', 'Fix the slug collision']} />
    </div>
  )
}
