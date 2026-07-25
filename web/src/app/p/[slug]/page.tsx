import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import UpdateComposer from '@/components/UpdateComposer'

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('*, profiles!inner(username, display_name)')
    .eq('slug', slug)
    .single()

  if (!project) notFound()

  const { data: updates } = await supabase
    .from('updates')
    .select('*')
    .eq('project_id', project.id)
    .order('day_number', { ascending: false })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isOwner = user?.id === project.user_id
  const nextDay = (updates?.[0]?.day_number ?? 0) + 1

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-bold">{project.title}</h1>
          <span className="pill shrink-0">{project.status}</span>
        </div>
        <p className="mt-2 text-[#8b949e]">{project.tagline}</p>
        <p className="mt-3 text-sm text-[#484f58]">
          by{' '}
          <Link href={`/u/${project.profiles.username}`} className="text-[#58a6ff] hover:underline">
            {project.profiles.display_name ?? project.profiles.username}
          </Link>
          {project.repo_url && (
            <>
              {' · '}
              <a href={project.repo_url} className="text-[#58a6ff] hover:underline">
                repo
              </a>
            </>
          )}
        </p>
      </div>

      {project.description && (
        <p className="card mb-8 whitespace-pre-wrap p-4 text-sm leading-relaxed">
          {project.description}
        </p>
      )}

      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#8b949e]">Log</h2>

      {isOwner && <UpdateComposer projectId={project.id} nextDay={nextDay} />}

      <div className="flex flex-col gap-3">
        {updates?.map((u: any) => (
          <div key={u.id} className="card p-4">
            <div className="mb-2 flex items-baseline gap-3">
              <span className="text-xs font-semibold text-[#3fb950]">Day {u.day_number}</span>
              <span className="text-xs text-[#484f58]">
                {new Date(u.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{u.body}</p>
          </div>
        ))}

        {updates?.length === 0 && (
          <p className="text-sm text-[#484f58]">No updates yet.</p>
        )}
      </div>
    </div>
  )
}
