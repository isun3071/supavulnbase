import DeepLinkBody from '@/components/qa/DeepLinkBody'
export default function DeepLinkOkPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Saved items (correct)</h1>
      <p className="mb-6 mt-1 text-sm text-[#8b949e]">
        CONTROL. Same component; this one fetches on mount, so a cold load renders content.
      </p>
      <DeepLinkBody fromNavigationOnly={false} />
    </div>
  )
}
