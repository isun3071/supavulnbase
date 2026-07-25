import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from '@/components/SignOutButton'
import './globals.css'

export const metadata: Metadata = {
  title: 'BuildLog',
  description: 'Build in public. One update at a time.',
}

async function Nav() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <header className="border-b border-[#21262d]">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3.5">
        <Link href="/" className="text-base font-bold tracking-tight">
          Build<span className="text-[#3fb950]">Log</span>
        </Link>

        <div className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link href="/dashboard" className="text-[#8b949e] hover:text-white">
                Dashboard
              </Link>
              <Link href="/settings" className="text-[#8b949e] hover:text-white">
                Settings
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="text-[#8b949e] hover:text-white">
                Log in
              </Link>
              <Link href="/signup" className="btn">
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="mx-auto max-w-4xl px-5 py-8">{children}</main>
        <footer className="mx-auto max-w-4xl px-5 py-10 text-xs text-[#484f58]">
          BuildLog — a hackathon project. Demo data only.
        </footer>
      </body>
    </html>
  )
}
