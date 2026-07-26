import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProjectEditor from '@/components/ProjectEditor'
import { hardened } from '@/lib/harden'

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // HARDENED(authz): scope the row to the session. Unscoped before.
  const { data: { user } } = await supabase.auth.getUser()
  const q = supabase.from('projects').select('*').eq('id', id)
  const { data: project } = await (hardened('authz') ? q.eq('user_id', user!.id) : q).single()

  if (!project) notFound()

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/dashboard" className="text-sm text-[#58a6ff] hover:underline">
        ← Dashboard
      </Link>

      <h1 className="mb-6 mt-3 text-2xl font-bold">Edit project</h1>

      <ProjectEditor project={project} />
    </div>
  )
}
