// Browser checks for the UI-state pairs that HTTP cannot see.
//
//   node infra/ui-check.mjs http://localhost:8090/app
//
// verify.sh is pure HTTP, and three of the five UI-state defects are purely
// client-side: whether a list reconciles after a write, whether a failed save
// is admitted, whether Back leaves the page. None of that appears in a
// response body, so verify.sh reported them green while ui-002 and its control
// were byte-identical and neither ever reflected a write. That is exactly the
// gap this closes.
//
// Each check asserts the DEFECT and its CONTROL behave DIFFERENTLY. Asserting
// only the defect would have passed on the broken build too, because both sides
// were equally broken.
//
// Exit 0 = pairs behave as declared, 1 = they do not, 2 = no browser.

const APP = process.argv[2]
if (!APP) {
  console.error('usage: node infra/ui-check.mjs <base-url>')
  process.exit(2)
}

let chromium
for (const spec of ['playwright', '/usr/share/nodejs/playwright/index.js', 'playwright-core']) {
  try {
    const mod = await import(spec)
    chromium = mod.chromium ?? mod.default?.chromium
    if (chromium) break
  } catch {
    /* next */
  }
}
if (!chromium) {
  console.log('  SKIP  playwright not available')
  process.exit(2)
}
let browser = null
for (const executablePath of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
  try {
    browser = await chromium.launch({ executablePath })
    break
  } catch {
    /* next */
  }
}
if (!browser) {
  console.log('  SKIP  no usable browser binary')
  process.exit(2)
}

// This tool asserts the DEFECTS ARE PRESENT, so it is a vulnerable-target
// tool. On a build where the `qa` class is hardened the defects are correctly
// absent, and reporting that as a failure would be backwards. Ask the target
// which class it has fixed and bow out cleanly.
const ctx0 = await browser.newContext()
const probe = await ctx0.newPage()
let hardenedClass = 'none'
try {
  const res = await probe.request.get(`${APP}/__manifest`)
  hardenedClass = (await res.json())?.hardening?.class ?? 'none'
} catch {
  /* older build without a hardening block */
}
await ctx0.close()
if (hardenedClass === 'qa' || hardenedClass === 'all') {
  console.log(`  SKIP  target has HARDEN_CLASS=${hardenedClass}; the qa defects are`)
  console.log('        deliberately absent here, so these pair assertions do not apply.')
  await browser.close()
  process.exit(2)
}

const problems = []
const ctx = await browser.newContext()
const page = await ctx.newPage()

const ok = (id, msg) => console.log(`  PASS  ${id.padEnd(11)} ${msg}`)
const bad = (id, msg) => {
  console.log(`  FAIL  ${id.padEnd(11)} ${msg}`)
  problems.push(id)
}

// Start from a known store so counts are meaningful.
await page.request.post(`${APP}/api/qa/items`, { data: { reset: true } })

// ---- ui-002 / ctl-qa-001 : does a create reconcile without a reload? -------
async function addItem(variant) {
  await page.goto(`${APP}/qa/${variant}`, { waitUntil: 'domcontentloaded' })
  const item = `probe-${variant}-${Math.random().toString(36).slice(2, 8)}`
  await page.fill('input[placeholder="New item"]', item)
  await page.click('button:has-text("Add")')
  await page.waitForTimeout(2500)
  const withoutReload = (await page.textContent('body')).includes(item)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const afterReload = (await page.textContent('body')).includes(item)
  return { withoutReload, afterReload }
}

const stale = await addItem('stale')
const fresh = await addItem('fresh')

if (!stale.afterReload) {
  bad('ui-002', 'the write never landed at all — this is a broken write, not stale UI')
} else if (stale.withoutReload) {
  bad('ui-002', 'stale list DID update without a reload; the defect is not present')
} else {
  ok('ui-002', 'write landed, list did not update until a manual reload')
}

if (fresh.withoutReload) ok('ctl-qa-001', 'control updates without a reload')
else bad('ctl-qa-001', 'control did NOT update without a reload; it is as broken as the defect')

if (stale.withoutReload === fresh.withoutReload) {
  bad('ui-002/ctl', 'defect and control behave identically — the pair proves nothing')
}

// ---- ui-003 / ctl-qa-002 : is a failed save admitted? ----------------------
async function save(variant) {
  await page.goto(`${APP}/qa/${variant}`, { waitUntil: 'domcontentloaded' })
  // button[type=submit], not has-text("Save"): the latter is ambiguous on this
  // page and silently failed to submit, which read as "the defect is absent"
  // when the defect was fine and the selector was not.
  await page.click('button[type=submit]')
  await page.waitForTimeout(2000)
  // Read the STATUS ELEMENT, not the page text. Matching against
  // textContent('body') was wrong twice over: it concatenates the button label
  // and the status into "SaveSaved", which destroys the \bSaved\b boundary, and
  // the honest page's own prose contains the word "failing" — so the check was
  // reading explanatory copy rather than what the form reported.
  const spans = await page.locator('span').allTextContents()
  return {
    saidSaved: spans.some((t) => t.trim() === 'Saved'),
    saidFailed: spans.some((t) => /nothing was saved|failed|could not/i.test(t)),
  }
}
const silent = await save('silent-save')
const honest = await save('honest-save')

if (silent.saidSaved && !silent.saidFailed) ok('ui-003', 'reports success on an HTTP 500')
else bad('ui-003', `did not report false success (saved=${silent.saidSaved} failed=${silent.saidFailed})`)

if (honest.saidFailed) ok('ctl-qa-002', 'control surfaces the same 500')
else bad('ctl-qa-002', 'control did not surface the failure')

// ---- ui-005 / ctl-qa-004 : does Back leave the page? ----------------------
async function backLeaves(variant) {
  await page.goto(`${APP}/qa`, { waitUntil: 'domcontentloaded' })
  await page.goto(`${APP}/qa/${variant}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(700)
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(1200)
  return !page.url().includes(variant)
}
const trapLeft = await backLeaves('back-trap')
const okLeft = await backLeaves('back-ok')

if (!trapLeft) ok('ui-005', 'Back does not leave the trapped page')
else bad('ui-005', 'Back left the page; the history trap is not present')
if (okLeft) ok('ctl-qa-004', 'control Back returns to the previous view')
else bad('ctl-qa-004', 'control Back did not return')

await browser.close()

if (problems.length) {
  console.log(`  UI-STATE PAIRS FAILED: ${problems.join(', ')}`)
  process.exit(1)
}
console.log('  ui-state pairs behave as declared')
