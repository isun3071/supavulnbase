import SaveForm from '@/components/qa/SaveForm'
export default function HonestSavePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Preferences (correct)</h1>
      <p className="mb-6 mt-1 text-sm text-[#8b949e]">
        CONTROL. Same failing endpoint; this form checks the response and says so.
      </p>
      <SaveForm honest />
    </div>
  )
}
