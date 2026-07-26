import SaveForm from '@/components/qa/SaveForm'
import { hardened } from '@/lib/harden'
export default function SilentSavePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Preferences (silent)</h1>
      <p className="mb-6 mt-1 text-sm text-[#8b949e]">
        The save endpoint returns 500 every time. This form reports success anyway.
      </p>
      {/* HARDENED(qa): check the response before reporting success. */}
      <SaveForm honest={hardened('qa')} />
    </div>
  )
}
