import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, title, slug, tagline, status, created_at, profiles!inner(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(25)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Recently started</h1>
        <p className="mt-1 text-sm text-[#8b949e]">
          People shipping things in public. Follow along, or start your own log.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {projects?.map((p: any) => (
          <Link key={p.id} href={`/p/${p.slug}`} className="card block p-4 hover:border-[#30363d]">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-semibold">{p.title}</h2>
              <span className="pill shrink-0">{p.status}</span>
            </div>
            <p className="mt-1.5 text-sm text-[#8b949e]">{p.tagline}</p>
            <p className="mt-3 text-xs text-[#484f58]">
              by {p.profiles.display_name ?? p.profiles.username}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
