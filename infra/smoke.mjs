// Browser smoke test: does the target actually WORK?
//
//   node infra/smoke.mjs http://localhost:8092/app
//
// Exists because verify.sh and harden.sh both check that flaws are ABSENT or
// PRESENT, and neither notices when the app has stopped functioning. Two real
// defects shipped that way: a CSP with no connect-src blocked every API call
// before dispatch, and a 5/minute gateway rate limit locked out ordinary
// logins. Both left every existing check green while the target was unusable,
// and NEITHER is visible to curl — a CSP only takes effect in a browser, and a
// rate limit only bites across a session.
//
// A hardened reference that cannot be logged into or crawled produces no
// differential at all, so "still works" is part of the hardening contract.
//
// Exit 0 = usable, 1 = broken, 2 = could not run (no browser available).

const APP = process.argv[2]
if (!APP) {
  console.error('usage: node infra/smoke.mjs <base-url>   e.g. http://localhost:8092/app')
  process.exit(2)
}

const EMAIL = process.env.SMOKE_EMAIL ?? 'ada.demo@buildlog.test'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'demo-password-123'

// Playwright and Chrome live in different places on different machines. Try the
// obvious ones and exit 2 (skip) rather than 1 (fail) if none work, so a machine
// without a browser does not report the target as broken.
let chromium
for (const spec of ['playwright', '/usr/share/nodejs/playwright/index.js', 'playwright-core']) {
  try {
    const mod = await import(spec)
    chromium = mod.chromium ?? mod.default?.chromium
    if (chromium) break
  } catch {
    /* try the next one */
  }
}
if (!chromium) {
  console.log('SKIP  playwright not available; cannot smoke test')
  process.exit(2)
}

const CHROME_PATHS = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
async function launch() {
  for (const executablePath of CHROME_PATHS) {
    try {
      return await chromium.launch({ executablePath })
    } catch {
      /* next */
    }
  }
  try {
    return await chromium.launch() // bundled browser, if one was downloaded
  } catch {
    return null
  }
}

const browser = await launch()
if (!browser) {
  console.log('SKIP  no usable Chrome/Chromium binary; cannot smoke test')
  process.exit(2)
}

const problems = []
const csp = []
const failed = []

const ctx = await browser.newContext()
const page = await ctx.newPage()

page.on('console', (m) => {
  const t = m.text()
  if (/Content Security Policy|Refused to (connect|load|execute)/i.test(t)) csp.push(t.slice(0, 140))
})
page.on('requestfailed', (r) => {
  // Next.js cancels its own RSC prefetches routinely; those aborts appear on a
  // perfectly healthy target and must not be counted.
  const url = r.url()
  const err = r.failure()?.errorText ?? ''
  if (url.includes('_rsc=') && err.includes('ERR_ABORTED')) return
  failed.push(`${url.slice(0, 90)} :: ${err}`)
})

const step = async (label, fn) => {
  try {
    await fn()
    console.log(`  ok    ${label}`)
  } catch (e) {
    console.log(`  FAIL  ${label} — ${String(e).split('\n')[0].slice(0, 120)}`)
    problems.push(label)
  }
}

await step('public feed renders', async () => {
  await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('h1', { timeout: 15000 })
})

await step('public project page renders', async () => {
  await page.goto(`${APP}/p/lampshade`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('h1', { timeout: 15000 })
})

await step('login through the UI reaches the dashboard', async () => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.fill('input[type=email]', EMAIL)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    try {
      await page.waitForURL('**/dashboard', { timeout: 20000 })
      return
    } catch (e) {
      const shown = await page.locator('p.text-sm').allTextContents().catch(() => [])
      const rateLimited = shown.some((s) => /rate limit/i.test(s))
      // A hardened build rate-limits auth. One retry after the window, so the
      // smoke test does not fail merely because a probe ran just before it.
      if (rateLimited && attempt === 1) {
        console.log('        (rate limited; waiting 62s and retrying once)')
        await page.waitForTimeout(62000)
        continue
      }
      throw new Error(shown.find((s) => s.trim()) ?? String(e))
    }
  }
})

await step('dashboard shows the signed-in account', async () => {
  await page.waitForSelector(`text=${EMAIL}`, { timeout: 15000 })
})

// Sustained navigation, not one hop. @supabase/ssr validates the session on
// EVERY request, and the middleware matcher covers nearly every route, so a
// handful of clicks makes a lot of /auth/v1/user calls. A gateway rate limit
// applied to the whole /auth/v1/ prefix throttles those, getUser() starts
// failing, the user reads as signed out, and the app bounces to /login after
// about two clicks. The first version of this test did two hops and missed it.
await step('session survives sustained navigation (12 hops)', async () => {
  const route = ['/bookmarks', '/settings', '/dashboard', '/', '/p/lampshade', '/dashboard']
  for (let lap = 0; lap < 2; lap++) {
    for (const path of route) {
      await page.goto(`${APP}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      if (page.url().includes('/login')) {
        throw new Error(`bounced to /login at ${path} on lap ${lap + 1} — session did not survive`)
      }
    }
  }
})

await step('still signed in at the end of the walk', async () => {
  await page.goto(`${APP}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector(`text=${EMAIL}`, { timeout: 15000 })
})

if (csp.length) {
  console.log(`  FAIL  ${csp.length} content-security-policy violation(s)`)
  csp.slice(0, 4).forEach((c) => console.log(`        ! ${c}`))
  problems.push('csp')
}
if (failed.length) {
  console.log(`  FAIL  ${failed.length} request(s) failed`)
  failed.slice(0, 4).forEach((f) => console.log(`        ! ${f}`))
  problems.push('requests')
}

await browser.close()

if (problems.length) {
  console.log(`  SMOKE FAILED: ${problems.join(', ')}`)
  process.exit(1)
}
console.log('  smoke passed: target is usable')
