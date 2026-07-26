import { hardened } from '@/lib/harden'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
// UI-STATE FIXTURE ui-006: served HTML references a script that 404s.
// The reference is real and the request is really made; the file does not
// exist. This is what a stale deploy or a bad cache-bust leaves behind.
export default function DeadChunkPage() {
  return (
    <div>
      {/* HARDENED(qa): reference a chunk that exists. */}
      <script
        src={`${BASE}${hardened('qa') ? '/qa/present.js' : '/_next/static/chunks/analytics.7f3a91c4.js'}`}
        async
      />
      <h1 className="text-2xl font-bold">Insights (broken deploy)</h1>
      <p className="mt-2 text-sm text-[#8b949e]">
        This page requests a JS chunk that is not on the server. Check the network panel.
      </p>
    </div>
  )
}
