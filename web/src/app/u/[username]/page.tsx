import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()

  if (!profile) notFound()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, title, slug, tagline, status')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{profile.display_name ?? profile.username}</h1>
        <p className="text-sm text-[#484f58]">@{profile.username}</p>
        {profile.bio && <p className="mt-3 text-sm text-[#8b949e]">{profile.bio}</p>}
        {profile.website && (
          <a href={profile.website} className="mt-2 block text-sm text-[#58a6ff] hover:underline">
            {profile.website}
          </a>
        )}
      </div>

      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#8b949e]">Projects</h2>

      <div className="flex flex-col gap-3">
        {projects?.map((p) => (
          <Link key={p.id} href={`/p/${p.slug}`} className="card block p-4 hover:border-[#30363d]">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="font-semibold">{p.title}</h3>
              <span className="pill shrink-0">{p.status}</span>
            </div>
            <p className="mt-1.5 text-sm text-[#8b949e]">{p.tagline}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
