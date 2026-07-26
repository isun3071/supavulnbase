import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options: CookieOptions }

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Perf fixtures are mode-gated. With PERF_MODE=off the whole /perf group 404s,
  // so a three-second sleep never lands in a normal crawl and cannot gate off
  // the security or QA probes.
  if (request.nextUrl.pathname.startsWith('/perf') && process.env.PERF_MODE !== 'on') {
    return new NextResponse(null, { status: 404 })
  }

  // authz-002 / authz-003: the team area 404s when anonymous instead of
  // redirecting. A redirect confirms a route exists; a 404 does not, so these
  // are crawlable only with a session carried into the crawl.
  if (request.nextUrl.pathname.startsWith('/team') && !user) {
    return new NextResponse(null, { status: 404 })
  }

  const needsAuth =
    request.nextUrl.pathname.startsWith('/dashboard') ||
    request.nextUrl.pathname.startsWith('/settings')

  if (!user && needsAuth) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
