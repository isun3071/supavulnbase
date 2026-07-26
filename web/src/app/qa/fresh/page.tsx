import CreateList from '@/components/qa/CreateList'
export const dynamic = 'force-dynamic'
export default function FreshPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Checklist (correct)</h1>
      <p className="mb-6 mt-1 text-sm text-[#8b949e]">
        CONTROL. Same component, same endpoint; this one invalidates after the write.
      </p>
      <CreateList invalidate initial={['Draft the README', 'Wire up the feed', 'Fix the slug collision']} />
    </div>
  )
}
