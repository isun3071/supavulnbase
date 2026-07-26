import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// "Rich" project description — lets makers use a bit of markup in their write-up.
//
// FIXTURE NOTE (xss-001): the stored description is interpolated into the page
// as raw HTML. This is STORED cross-site scripting, and the write path is
// already open: public.projects has no RLS (rls-001), so an anonymous caller
// can PATCH any project's description and the payload then executes for every
// visitor to this page.
//
// Its control is ../plain, which renders the SAME stored field through JSX so
// React escapes it. Same data, same route group, one difference.
export default async function RichProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('title, slug, tagline, description')
    .eq('slug', slug)
    .single()

  if (!project) notFound()

  return (
    <div>
      <h1 className="text-2xl font-bold">{project.title}</h1>
      <p className="mt-2 text-[#8b949e]">{project.tagline}</p>

      <div
        className="card mt-6 p-4 text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: project.description ?? '' }}
      />

      <p className="mt-6 text-sm">
        <Link href={`/p/${slug}/plain`} className="text-[#58a6ff] hover:underline">
          View the escaped version →
        </Link>
      </p>
    </div>
  )
}
