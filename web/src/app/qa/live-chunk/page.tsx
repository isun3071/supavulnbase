const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
export default function LiveChunkPage() {
  return (
    <div>
      <script src={`${BASE}/qa/present.js`} async />
      <h1 className="text-2xl font-bold">Insights (correct)</h1>
      <p className="mt-2 text-sm text-[#8b949e]">
        CONTROL. Same shape; the referenced script exists and returns 200.
      </p>
    </div>
  )
}
