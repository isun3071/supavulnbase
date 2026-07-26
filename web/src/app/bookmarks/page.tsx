import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import BookmarksTools from '@/components/BookmarksTools'

export default async function BookmarksPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Whatever the RLS dial is set to is what decides how much comes back here.
  const { data: bookmarks } = await supabase
    .from('bookmarks')
    .select('id, note, created_at, profiles(username), projects(title, slug)')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="text-2xl font-bold">Saved</h1>
      <p className="mb-8 mt-1 text-sm text-[#8b949e]">
        Projects you kept an eye on, with a private note to yourself.
      </p>

      {!user && (
        <p className="mb-6 text-sm text-[#8b949e]">
          <Link href="/login" className="text-[#58a6ff] hover:underline">
            Log in
          </Link>{' '}
          to save projects.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {bookmarks?.map((b: any) => (
          <div key={b.id} className="card p-4">
            <div className="flex items-baseline justify-between gap-4">
              <Link href={`/p/${b.projects?.slug}`} className="font-semibold hover:underline">
                {b.projects?.title}
              </Link>
              <span className="shrink-0 text-xs text-[#484f58]">@{b.profiles?.username}</span>
            </div>
            {b.note && <p className="mt-2 text-sm text-[#8b949e]">{b.note}</p>}
          </div>
        ))}

        {bookmarks?.length === 0 && (
          <p className="text-sm text-[#484f58]">Nothing saved yet.</p>
        )}
      </div>

      <BookmarksTools />
    </div>
  )
}
