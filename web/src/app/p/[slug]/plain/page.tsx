import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// CONTROL ctl-xss-001 for xss-001.
//
// Reads the SAME stored description from the SAME table and renders it through
// JSX interpolation, which escapes. A grader that reports XSS here has flagged
// the presence of attacker-controlled content rather than an injection: the
// content is identical to the vulnerable sibling, only the sink differs.
export default async function PlainProjectPage({ params }: { params: Promise<{ slug: string }> }) {
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

      <div className="card mt-6 whitespace-pre-wrap p-4 text-sm leading-relaxed">
        {project.description ?? ''}
      </div>

      <p className="mt-6 text-sm">
        <Link href={`/p/${slug}/rich`} className="text-[#58a6ff] hover:underline">
          View the rich version →
        </Link>
      </p>
    </div>
  )
}
