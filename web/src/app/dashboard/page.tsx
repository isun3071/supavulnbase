import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import NewProjectForm from '@/components/NewProjectForm'
import SponsorSync from '@/components/SponsorSync'
import DraftAssistant from '@/components/DraftAssistant'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, title, slug, tagline, status, updated_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your projects</h1>
          <p className="mt-1 text-sm text-[#8b949e]">{user!.email}</p>
        </div>
        <NewProjectForm />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <SponsorSync />
        <DraftAssistant />
      </div>

      <div className="flex flex-col gap-3">
        {projects?.map((p) => (
          <div key={p.id} className="card flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <h2 className="truncate font-semibold">{p.title}</h2>
              <p className="mt-1 truncate text-sm text-[#8b949e]">{p.tagline}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-sm">
              <span className="pill">{p.status}</span>
              <Link href={`/p/${p.slug}`} className="text-[#58a6ff] hover:underline">
                View
              </Link>
              <Link href={`/dashboard/${p.id}`} className="text-[#58a6ff] hover:underline">
                Edit
              </Link>
            </div>
          </div>
        ))}

        {projects?.length === 0 && (
          <p className="text-sm text-[#484f58]">
            Nothing here yet. Start a project and log day one.
          </p>
        )}
      </div>
    </div>
  )
}
