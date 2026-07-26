import DeepLinkBody from '@/components/qa/DeepLinkBody'
import { hardened } from '@/lib/harden'
export default function DeepLinkPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Saved items (deep link)</h1>
      <p className="mb-6 mt-1 text-sm text-[#8b949e]">
        Loaded directly, this renders an empty shell. The content only arrives after an in-app
        navigation.
      </p>
      {/* HARDENED(qa): fetch on mount so a cold load renders. */}
      <DeepLinkBody fromNavigationOnly={!hardened('qa')} />
    </div>
  )
}
