import { NextResponse } from 'next/server'

// Machine-readable ground truth, served at {basePath}/__manifest.
// The prose version with detection steps and verification notes is MANIFEST.md
// in the repository root. verify.sh asserts the id sets match.

// Bump on any change to the finding or control set, or to what an entry
// asserts. Any published score against this fixture must cite this version AND
// both dial settings, or it is not reproducible.
const MANIFEST_VERSION = '0.7.0'

const RLS_MODE = process.env.RLS_MODE ?? 'off'
const DISCOVERY_MODE = process.env.NEXT_PUBLIC_DISCOVERY_MODE ?? 'linked'
const PERF_MODE = process.env.PERF_MODE ?? 'off'
const SIGNUP_MODE = process.env.NEXT_PUBLIC_SIGNUP_MODE ?? 'normal'
const CANONICAL = { rls: 'off', discovery: 'linked', perf: 'off', signup: 'normal' }

type Entry = {
  id: string
  name: string
  category: string
  cwe?: string
  owasp_2025?: string
  discovery_mechanism: string
  reachable_by_other_means?: boolean
  location: string
  severity?: string
  is_control: boolean
  paired_control?: string | null
  occurred?: 'naturally' | 'planted'
  // Which dial settings this entry exists in. Absent means "all modes".
  modes?: { rls?: string[]; discovery?: string[]; perf?: string[]; signup?: string[] }
  // Entries a consumer may legitimately collapse into one finding. Two ids with
  // the same variant_group are the same underlying disclosure seen twice; a
  // count of 1 against them is not a miss.
  variant_group?: string
  // Timing entries assert a FLOOR guaranteed by construction, never a measured
  // value: a latency number would depend on the machine and cannot be ground
  // truth. Structural entries are deterministic properties of the response.
  claim_type?: 'structural' | 'timing-floor'
  note?: string
}

// An entry is present in the current build only if every dial it names includes
// the current setting.
function presentNow(e: Entry) {
  if (e.modes?.rls && !e.modes.rls.includes(RLS_MODE)) return false
  if (e.modes?.discovery && !e.modes.discovery.includes(DISCOVERY_MODE)) return false
  if (e.modes?.perf && !e.modes.perf.includes(PERF_MODE)) return false
  if (e.modes?.signup && !e.modes.signup.includes(SIGNUP_MODE)) return false
  return true
}

const FINDINGS: Entry[] = [
  { id: 'rls-001', name: 'RLS never enabled on projects — anonymous full CRUD', category: 'broken-access-control', cwe: 'CWE-306', owasp_2025: 'A01', discovery_mechanism: 'baas-direct', reachable_by_other_means: true, location: 'table public.projects via PostgREST', severity: 'critical', is_control: false, paired_control: 'ctl-002', occurred: 'naturally' },
  { id: 'rls-002', name: 'RLS never enabled on updates — anonymous insert with forged author', category: 'broken-access-control', cwe: 'CWE-306', owasp_2025: 'A01', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'table public.updates via PostgREST', severity: 'critical', is_control: false, paired_control: 'ctl-002', occurred: 'naturally' },
  { id: 'rls-003', name: 'Permissive RLS policy lets any signed-in user read every sponsor lead', category: 'broken-access-control', cwe: 'CWE-639', owasp_2025: 'A01', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'table public.sponsor_leads via PostgREST', severity: 'critical', is_control: false, paired_control: 'ctl-009', occurred: 'planted', note: 'requires a registered account; not reachable anonymously' },
  { id: 'rls-004', name: 'Unpoliced INSERT on drafts allows forging rows for any user', category: 'broken-access-control', cwe: 'CWE-284', owasp_2025: 'A01', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'table public.drafts via PostgREST', severity: 'high', is_control: false, paired_control: 'ctl-013', occurred: 'planted', note: 'INSERT only; UPDATE/DELETE are gated by the SELECT policy' },
  { id: 'storage-001', name: 'Public storage bucket serves files anonymously', category: 'security-misconfiguration', cwe: 'CWE-732', owasp_2025: 'A01', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'bucket project-media, GET /storage/v1/object/public/project-media/...', severity: 'medium', is_control: false, paired_control: 'ctl-010', occurred: 'planted', note: 'Enumerate with GET /storage/v1/bucket. Previously shipped declared-but-absent on stacks upgraded without down -v; the seed now asserts the bucket exists before completing.' },
  { id: 'authz-001', name: 'Any authenticated user can open and edit any project', category: 'broken-access-control', cwe: 'CWE-639', owasp_2025: 'A01', discovery_mechanism: 'authed-discovery', reachable_by_other_means: true, location: 'GET {basePath}/dashboard/{project_id}', severity: 'high', is_control: false, paired_control: null, occurred: 'naturally' },
  { id: 'key-001', name: 'service_role key shipped in the client bundle', category: 'sensitive-data-exposure', cwe: 'CWE-522', owasp_2025: 'A02', discovery_mechanism: 'bundle-mining', reachable_by_other_means: false, location: 'NEXT_PUBLIC_SUPABASE_SERVICE_KEY in the compiled JS', severity: 'critical', is_control: false, paired_control: 'ctl-001', occurred: 'planted' },
  { id: 'key-002', name: 'OpenAI-shaped API key in the client bundle', category: 'sensitive-data-exposure', cwe: 'CWE-522', owasp_2025: 'A02', discovery_mechanism: 'bundle-mining', reachable_by_other_means: false, location: 'NEXT_PUBLIC_FAKE_OPENAI_KEY in the compiled JS', severity: 'high', is_control: false, paired_control: 'ctl-011', occurred: 'planted' },
  { id: 'admin-001', name: 'Unlinked admin export dumps the workspace with no authorization', category: 'broken-access-control', cwe: 'CWE-306', owasp_2025: 'A01', discovery_mechanism: 'bundle-mining', reachable_by_other_means: false, location: 'GET {basePath}/api/admin/export', severity: 'critical', is_control: false, paired_control: null, occurred: 'planted' },
  { id: 'llm-001', name: 'Full system prompt embedded as a bundle string literal', category: 'information-disclosure', cwe: 'CWE-200', owasp_2025: 'A05', discovery_mechanism: 'bundle-mining', reachable_by_other_means: false, location: 'SYSTEM_PROMPT in the compiled JS', severity: 'low', is_control: false, paired_control: null, occurred: 'planted' },
  { id: 'llm-002', name: 'Synthetic personal data interpolated into the client-side prompt', category: 'sensitive-data-exposure', cwe: 'CWE-359', owasp_2025: 'A02', discovery_mechanism: 'bundle-mining', reachable_by_other_means: false, location: 'DEMO_ACCOUNT in the compiled JS', severity: 'medium', is_control: false, paired_control: null, occurred: 'planted', note: 'all values synthetic and labelled as such' },
  { id: 'inj-001', name: 'PostgREST filter injection in project search', category: 'injection', cwe: 'CWE-943', owasp_2025: 'A03', discovery_mechanism: 'suffix-convention', reachable_by_other_means: false, location: 'GET {basePath}/api/projects/search?q=', severity: 'high', is_control: false, paired_control: 'ctl-012', occurred: 'planted' },
  { id: 'tmpl-001', name: 'Server-side template injection via a body-only field', category: 'injection', cwe: 'CWE-1336', owasp_2025: 'A03', discovery_mechanism: 'schema-error', reachable_by_other_means: false, location: 'POST {basePath}/api/feedback, field renderTemplate', severity: 'high', is_control: false, paired_control: null, occurred: 'planted', note: 'Templates are evaluated: {{7*7}} -> 49. SCOPE: arithmetic and named context vars only — no eval, no property access, no host objects. {{constructor.constructor}} does not resolve. Reporting SSTI is correct; reporting RCE overclaims.' },
  { id: 'probe-001', name: 'Deployment .env served under the app root', category: 'sensitive-data-exposure', cwe: 'CWE-538', owasp_2025: 'A05', discovery_mechanism: 'path-probe', reachable_by_other_means: false, location: 'GET {basePath}/.env', severity: 'critical', is_control: false, paired_control: null, occurred: 'planted', note: 'resolves against the APP root, not the origin; JWT_SECRET and service_role key inside' },
  { id: 'probe-002', name: 'Git config with embedded token served under the app root', category: 'sensitive-data-exposure', cwe: 'CWE-538', owasp_2025: 'A05', discovery_mechanism: 'path-probe', reachable_by_other_means: false, location: 'GET {basePath}/.git/config', severity: 'high', is_control: false, paired_control: null, occurred: 'planted', note: 'resolves against the APP root, not the origin' },
  { id: 'rls-005', name: 'Anonymous attribution forgery — content posted as another user', category: 'improper-authentication', cwe: 'CWE-345', owasp_2025: 'A07', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'table public.updates via PostgREST', severity: 'critical', is_control: false, paired_control: 'ctl-002', occurred: 'naturally', note: 'Split from rls-002. Author is taken from the request body and never checked against the session, so an anonymous caller publishes content under any user\'s name. Distinct from unauthorized write: this is impersonation, and it renders on the public project page as that user\'s words.' },
  { id: 'dial-rls-001', name: 'RLS dial: bookmarks readable across users', category: 'broken-access-control', cwe: 'CWE-639', owasp_2025: 'A01', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'table public.bookmarks via PostgREST', severity: 'critical', is_control: false, paired_control: 'ctl-016', occurred: 'planted', modes: { rls: ['off', 'permissive'] }, note: 'RLS_MODE=off: world readable AND writable with the anon key. RLS_MODE=permissive: RLS is on and policies exist, but SELECT is auth.role()=authenticated, so any registered user reads every row while writes stay owner-scoped. Same table, columns and seed data in all modes.' },
  { id: 'dial-disc-001', name: 'Bookmark export route has no authorization', category: 'broken-access-control', cwe: 'CWE-306', owasp_2025: 'A01', discovery_mechanism: 'varies-by-dial', reachable_by_other_means: false, location: 'GET {basePath}/api/bookmarks/all', severity: 'high', is_control: false, paired_control: null, occurred: 'planted', note: 'The finding is identical in all four discovery modes and is independent of the RLS dial: the route holds a service-role client and checks no session, so it leaks every user\'s private notes even when RLS_MODE=correct. Only reachability changes: linked=static-crawl, bundle=bundle-mining, interaction=interaction, concatenated=suffix-convention. Being a Next route, the PostgREST OpenAPI root cannot reveal it.' },
  { id: 'sum-001', name: 'Body-only parameter discoverable solely from a validation error', category: 'information-disclosure', cwe: 'CWE-200', owasp_2025: 'A05', discovery_mechanism: 'schema-error', reachable_by_other_means: false, location: 'POST {basePath}/api/summarize, field toneProfile', severity: 'low', is_control: false, paired_control: 'ctl-017', occurred: 'planted', note: 'POST {} returns Zod issues naming projectSlug, maxSentences and toneProfile. None is a column on any table, so info-001 cannot short-circuit it. An unknown toneProfile is reflected in the response. Severity is low on purpose: the value is the discovery path, not the blast radius.' },
  { id: 'authz-002', name: 'Member directory exposes every account email to any registered user', category: 'information-disclosure', cwe: 'CWE-359', owasp_2025: 'A01', discovery_mechanism: 'authed-discovery', reachable_by_other_means: false, location: 'GET {basePath}/team', severity: 'high', is_control: false, paired_control: null, occurred: 'planted', note: 'Returns 404 when anonymous rather than redirecting, so the route is indistinguishable from one that never existed unless a session is carried into the crawl. Emails live in auth.users and appear nowhere else in this app — public.profiles carries only username, display name and bio.' },
  { id: 'authz-003', name: 'Activity feed exposes account authentication history', category: 'information-disclosure', cwe: 'CWE-200', owasp_2025: 'A01', discovery_mechanism: 'authed-discovery', reachable_by_other_means: false, location: 'GET {basePath}/team/audit', severity: 'medium', is_control: false, paired_control: null, occurred: 'planted', note: 'Second anon-404 route. Exposes sign-ins, signups and password-recovery requests keyed by email, revealing who is active and when. NO IP ADDRESSES: GoTrue records none in this configuration, and the fixture deliberately does not claim any. The backing function is granted to service_role only, so PostgREST is not a second path.' },
  { id: 'xss-001', name: 'Stored XSS via unescaped project description', category: 'injection', cwe: 'CWE-79', owasp_2025: 'A03', discovery_mechanism: 'static-crawl', reachable_by_other_means: false, location: 'GET {basePath}/p/{slug}/rich', severity: 'high', is_control: false, paired_control: 'ctl-xss-001', occurred: 'planted', note: 'The stored description is interpolated as raw HTML via dangerouslySetInnerHTML. Chains with rls-001: public.projects has no RLS, so an anonymous PATCH stores the payload and it then executes for every visitor. Verified end to end — anon PATCH -> 204, payload present unescaped in the served HTML. The seeded description carries an inert <span data-html-probe> so the sink is observable without writing.' },

  { id: 'signup-001', name: 'Registration reachable only via a client-side interaction', category: 'auth-reachability', cwe: 'CWE-1110', discovery_mechanism: 'interaction', reachable_by_other_means: false, location: '{basePath}/ — "Get started" button', severity: 'n/a-fixture', is_control: false, paired_control: null, occurred: 'planted', modes: { signup: ['interaction'] }, note: '27.5% of the measured corpus. /signup returns 404 and the string "signup" appears 0 times in the served HTML. Verified: no click -> 0 forms and 0 auth requests; after the click -> registration completes and a session is granted. Button text is deliberately "Get started", not "Sign up".' },
  { id: 'signup-002', name: 'Submit blocked by an unlabelled required input — no request is sent', category: 'auth-reachability', cwe: 'CWE-1110', discovery_mechanism: 'static-crawl', reachable_by_other_means: false, location: '{basePath}/signup', severity: 'n/a-fixture', is_control: false, paired_control: null, occurred: 'planted', modes: { signup: ['unlabeled'] }, note: '26.7% of the measured corpus. One required input has no name, id, placeholder or aria-label, and its caption is an unassociated sibling. A filler that locates fields by accessible name leaves it empty and HTML5 validation blocks submit. VERIFIED: 0 requests to /auth/v1/* — the failure is silent on both sides.' },
  { id: 'signup-003', name: 'Login-only homepage with registration linked from nowhere', category: 'auth-reachability', cwe: 'CWE-1110', discovery_mechanism: 'suffix-convention', reachable_by_other_means: false, location: '{basePath}/ is login; {basePath}/signup is unlinked', severity: 'n/a-fixture', is_control: false, paired_control: null, occurred: 'planted', modes: { signup: ['login-only'] }, note: 'The first form on the homepage is LOGIN. A grader that fills the first form it sees submits credentials there and never walks to the registration route, which is reachable at /signup but linked from nowhere.' },

  // ---- UI-state honesty. Intent-independent, invisible to security scanners.
  { id: 'ui-002', name: 'Create succeeds but the list never updates', category: 'ui-state-honesty', cwe: 'CWE-1188', discovery_mechanism: 'interaction', reachable_by_other_means: false, location: '{basePath}/qa/stale', severity: 'medium', is_control: false, paired_control: 'ctl-qa-001', occurred: 'planted', claim_type: 'structural', note: 'CONSTRUCTED, NOT NATURAL. Next 15 treats dynamic routes as immediately stale and refetches on client navigation, so this does not occur on its own — the audit found writes propagating correctly everywhere (ctl-007). Presenting it required holding the list in client state and omitting router.refresh() on purpose. The write really lands; a manual reload shows it.' },
  { id: 'ui-003', name: 'Save reports success when the request returned 500', category: 'ui-state-honesty', cwe: 'CWE-393', discovery_mechanism: 'interaction', reachable_by_other_means: false, location: '{basePath}/qa/silent-save', severity: 'medium', is_control: false, paired_control: 'ctl-qa-002', occurred: 'planted', claim_type: 'structural', note: 'The endpoint returns 500 every time. The component never inspects the response, which is what `await fetch(...)` with no check produces.' },
  { id: 'ui-004', name: 'Deep link renders an empty shell', category: 'ui-state-honesty', cwe: 'CWE-1188', discovery_mechanism: 'interaction', reachable_by_other_means: false, location: '{basePath}/qa/deep-link', severity: 'medium', is_control: false, paired_control: 'ctl-qa-003', occurred: 'planted', claim_type: 'structural', note: 'Data is fetched only in response to an in-app navigation, so a cold GET returns markup with an empty container that never fills. A crawler following a link sees content; one requesting the URL directly sees a shell.' },
  { id: 'ui-005', name: 'Browser back does not return to the previous view', category: 'ui-state-honesty', cwe: 'CWE-1021', discovery_mechanism: 'interaction', reachable_by_other_means: false, location: '{basePath}/qa/back-trap', severity: 'low', is_control: false, paired_control: 'ctl-qa-004', occurred: 'planted', claim_type: 'structural', note: 'The page re-pushes itself onto the history stack on popstate. Requires driving a real browser; no static analysis or HTTP probe can see it.' },
  { id: 'ui-006', name: 'Served HTML references a JS chunk that 404s', category: 'ui-state-honesty', cwe: 'CWE-1104', discovery_mechanism: 'static-crawl', reachable_by_other_means: false, location: '{basePath}/qa/dead-chunk', severity: 'medium', is_control: false, paired_control: 'ctl-qa-005', occurred: 'planted', claim_type: 'structural', note: 'The script reference is real and the request is really made; the file is not on the server. What a stale deploy or a bad cache-bust leaves behind.' },

  // ---- Performance. Structural entries are deterministic; the timing entry
  // ---- asserts a floor guaranteed by construction, never a measured value.
  { id: 'perf-001', name: 'Text response served without compression', category: 'performance', cwe: 'CWE-405', discovery_mechanism: 'static-crawl', reachable_by_other_means: false, location: 'GET {basePath}/api/perf/uncompressed', severity: 'medium', is_control: false, paired_control: 'ctl-perf-001', occurred: 'planted', modes: { perf: ['on'] }, claim_type: 'structural', note: 'Highly repetitive text served with Content-Encoding: identity. Whether a response is compressed is a property of the response, so ground truth is unambiguous.' },
  { id: 'perf-002', name: 'Cacheable asset served with no validator and no cache headers', category: 'performance', cwe: 'CWE-405', discovery_mechanism: 'static-crawl', reachable_by_other_means: false, location: 'GET {basePath}/api/perf/no-validator', severity: 'medium', is_control: false, paired_control: 'ctl-perf-002', occurred: 'planted', modes: { perf: ['on'] }, claim_type: 'structural', note: 'Body never changes, yet there is no Cache-Control, no ETag and no Last-Modified, so no conditional request is possible and every visit re-downloads.' },
  { id: 'perf-003', name: 'Excessive resource requests on the critical path', category: 'performance', cwe: 'CWE-405', discovery_mechanism: 'static-crawl', reachable_by_other_means: false, location: '{basePath}/perf/requests', severity: 'medium', is_control: false, paired_control: 'ctl-perf-003', occurred: 'planted', modes: { perf: ['on'] }, claim_type: 'structural', note: '60 requests for one 68-byte image, each cache-busted with a distinct query string so none can be reused. The count is a property of the served markup.' },
  { id: 'perf-004', name: 'Oversized image on the critical path', category: 'performance', cwe: 'CWE-405', discovery_mechanism: 'static-crawl', reachable_by_other_means: false, location: '{basePath}/perf/image', severity: 'high', is_control: false, paired_control: 'ctl-perf-003', occurred: 'planted', modes: { perf: ['on'] }, claim_type: 'structural', note: 'A 4.2MB PNG rendered above the fold at 320px wide, eagerly loaded, with no responsive sources. Byte count and position are both deterministic.' },
  { id: 'perf-005', name: 'TTFB exceeds 3s by construction', category: 'performance', cwe: 'CWE-405', discovery_mechanism: 'static-crawl', reachable_by_other_means: false, location: '{basePath}/perf/slow', severity: 'high', is_control: false, paired_control: 'ctl-perf-003', occurred: 'planted', modes: { perf: ['on'] }, claim_type: 'timing-floor', note: 'ASSERTS A FLOOR, NOT A VALUE. The route sleeps 3000ms server-side before rendering, so first byte cannot arrive sooner than that on any machine. A claim like "LCP is 4.2s" would not be ground truth because it depends on the environment; "at least 3s" is true everywhere.' },

  { id: 'auth-001', name: 'No rate limiting on the password grant — unlimited credential stuffing', category: 'broken-authentication', cwe: 'CWE-307', owasp_2025: 'A07', discovery_mechanism: 'static-crawl', reachable_by_other_means: true, location: 'POST /auth/v1/token?grant_type=password', severity: 'high', is_control: false, paired_control: 'ctl-014', occurred: 'naturally', note: '45 failed logins produced zero 429s and no lockout. Found after the planting pass; a natural omission, not a plant.' },
  { id: 'auth-002', name: 'Weak password policy — six characters, no complexity, no breach check', category: 'broken-authentication', cwe: 'CWE-521', owasp_2025: 'A07', discovery_mechanism: 'static-crawl', reachable_by_other_means: true, location: 'POST /auth/v1/signup', severity: 'low', is_control: false, paired_control: null, occurred: 'naturally', note: '"aaaaaa" is accepted; only a length>=6 rule exists.' },
  { id: 'info-001', name: 'PostgREST OpenAPI root discloses the full schema', category: 'information-disclosure', cwe: 'CWE-200', owasp_2025: 'A05', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'GET /rest/v1/ on the Supabase gateway', severity: 'medium', is_control: false, paired_control: null, occurred: 'naturally', variant_group: 'backend-disclosure' },
  { id: 'info-002', name: 'Verbose SQL errors leak column names and SQLSTATE', category: 'information-disclosure', cwe: 'CWE-209', owasp_2025: 'A05', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'PostgREST error responses', severity: 'low', is_control: false, paired_control: null, occurred: 'naturally', variant_group: 'backend-disclosure', note: 'Same variant_group as info-001: both are backend disclosure through the data API. A consumer that counts these as ONE finding is not missing anything.' },
  { id: 'cookie-001', name: 'Session cookie is not HttpOnly, not Secure, and lives 400 days', category: 'session-management', cwe: 'CWE-1004', owasp_2025: 'A05', discovery_mechanism: 'authed-discovery', reachable_by_other_means: false, location: 'Set-Cookie sb-localhost-auth-token', severity: 'medium', is_control: false, paired_control: null, occurred: 'naturally' },
  { id: 'ui-001', name: 'Settings save reports success when the write changed nothing', category: 'ui-state-honesty', cwe: 'CWE-393', discovery_mechanism: 'interaction', reachable_by_other_means: false, location: '{basePath}/settings', severity: 'medium', is_control: false, paired_control: null, occurred: 'naturally' },
  { id: 'err-001', name: 'Supabase errors discarded across 13 call sites', category: 'error-handling', cwe: 'CWE-390', discovery_mechanism: 'source-review', reachable_by_other_means: false, location: 'web/src — 9 read paths, 4 write paths', severity: 'low', is_control: false, paired_control: null, occurred: 'naturally' },
  { id: 'hdr-001', name: 'No security response headers on any app route', category: 'security-misconfiguration', cwe: 'CWE-693', owasp_2025: 'A05', discovery_mechanism: 'static-crawl', reachable_by_other_means: false, location: 'all {basePath}/* responses', severity: 'medium', is_control: false, paired_control: null, occurred: 'naturally' },
  { id: 'hdr-002', name: 'X-Powered-By discloses the framework', category: 'security-misconfiguration', cwe: 'CWE-200', owasp_2025: 'A05', discovery_mechanism: 'static-crawl', reachable_by_other_means: false, location: 'all {basePath}/* responses', severity: 'info', is_control: false, paired_control: null, occurred: 'naturally' },
  { id: 'hdr-003', name: 'PostgREST version banner on the data API', category: 'security-misconfiguration', cwe: 'CWE-200', owasp_2025: 'A05', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'all /rest/v1/* responses', severity: 'info', is_control: false, paired_control: null, occurred: 'naturally' },
]

const CONTROLS: Entry[] = [
  { id: 'ctl-001', name: 'Supabase anon key in the client bundle', category: 'not-a-finding', discovery_mechanism: 'bundle-mining', location: 'compiled JS', is_control: true, occurred: 'naturally', note: 'Public by design. Same eyJ shape as key-001; only the decoded role claim differs. Reporting this is a false positive.' },
  { id: 'ctl-002', name: 'profiles has correct owner-scoped RLS and denies writes silently', category: 'not-a-finding', discovery_mechanism: 'baas-direct', location: 'table public.profiles', is_control: true, occurred: 'naturally', note: 'Anonymous UPDATE/DELETE return 204 while changing zero rows. Treating 2xx as a write primitive is a false positive; re-read to confirm.' },
  { id: 'ctl-003', name: 'No service_role key in the client bundle', category: 'not-a-finding', discovery_mechanism: 'bundle-mining', location: 'n/a', is_control: true, occurred: 'naturally', note: 'Superseded by key-001, which deliberately leaks one. Retained for history.' },
  { id: 'ctl-004', name: 'No source maps in production', category: 'not-a-finding', discovery_mechanism: 'bundle-mining', location: 'compiled output', is_control: true, occurred: 'naturally' },
  { id: 'ctl-005', name: 'Config paths are not served at the ORIGIN root', category: 'not-a-finding', discovery_mechanism: 'path-probe', location: 'GET /.env, /.git/config at the origin', is_control: true, occurred: 'planted', note: 'These 404 at the origin but 200 under the app root. A probe that resolves against the origin reports clean and is wrong. Pairs with probe-001/probe-002.' },
  { id: 'ctl-006', name: 'Unknown routes return a real 404, not a soft 404', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: 'any unknown path', is_control: true, occurred: 'naturally' },
  { id: 'ctl-007', name: 'Cache invalidation after writes is correct', category: 'not-a-finding', discovery_mechanism: 'interaction', location: 'dashboard, feed, project pages', is_control: true, occurred: 'naturally' },
  { id: 'ctl-008', name: 'User-controlled content is escaped on the main pages', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: 'feed, /p/{slug}, /u/{username}, dashboard', is_control: true, occurred: 'naturally', note: 'NARROWED when xss-001 was planted. The main application pages still render every user-controlled field through JSX and escape correctly; the single unescaped sink is the dedicated /p/{slug}/rich route. Reporting XSS against the feed or the standard project page remains a false positive.' },
  { id: 'ctl-009', name: 'payout_accounts has correct owner-scoped RLS on all four verbs', category: 'not-a-finding', discovery_mechanism: 'baas-direct', location: 'table public.payout_accounts', is_control: true, occurred: 'planted', note: 'Pair for rls-003. Same migration, more sensitive data, correctly scoped.' },
  { id: 'ctl-010', name: 'payout-documents is a correctly private bucket', category: 'not-a-finding', discovery_mechanism: 'baas-direct', location: 'bucket payout-documents', is_control: true, occurred: 'planted' },
  { id: 'ctl-011', name: 'Four public client identifiers that must not be reported', category: 'not-a-finding', discovery_mechanism: 'bundle-mining', location: 'compiled JS', is_control: true, occurred: 'planted', note: 'pk_test_ (Stripe publishable), asst_ (assistant id), prj_ and dpl_ (Vercel build metadata). All designed for the browser.' },
  { id: 'ctl-012', name: 'Integration proxy route with no database in the path', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: 'GET/POST {basePath}/api/integrations/ping', is_control: true, occurred: 'planted', note: 'Random 0.2-4s latency, intermittent 500/429, and payload reflection. Trips timing, error-string and reflection injection oracles at once. No injection is possible.' },
  { id: 'ctl-013', name: 'drafts UPDATE/DELETE policies read as open but are inert', category: 'not-a-finding', discovery_mechanism: 'source-review', location: 'policies on public.drafts', is_control: true, occurred: 'planted', note: 'using (true) looks like a write gap. PostgreSQL gates the UPDATE/DELETE row lookup on the SELECT policy, so it is unreachable. Verified as UPDATE 0.' },
  { id: 'ctl-014', name: 'Other auth endpoints ARE rate limited', category: 'not-a-finding', discovery_mechanism: 'baas-direct', location: 'POST /auth/v1/recover and /auth/v1/otp', is_control: true, occurred: 'naturally', note: 'Both 429 after a single request. Pair for auth-001: the correct finding is per-endpoint ("the password grant is unlimited"), not per-service ("auth is unlimited").' },
  { id: 'ctl-016', name: 'RLS dial at correct: bookmarks is owner-scoped on all four verbs', category: 'not-a-finding', discovery_mechanism: 'baas-direct', location: 'table public.bookmarks', is_control: true, occurred: 'planted', modes: { rls: ['correct'] }, note: 'Byte-identical table, columns and seed data to the broken modes; only the policies differ. A finding reported against public.bookmarks in this mode is a false positive. Note dial-disc-001 still leaks the same data through the app route in this mode — that is an app-layer failure, not an RLS one, and conflating them is the mistake this pair catches.' },
  { id: 'ctl-017', name: 'Summarize route proxies an external model provider with no database in the path', category: 'not-a-finding', discovery_mechanism: 'schema-error', location: 'POST {basePath}/api/summarize', is_control: true, occurred: 'planted', note: 'Second proxy control, alongside ctl-012. Random 0.18-4.1s latency, intermittent 500/429 with connect/timeout language, and the request echoed back. No database anywhere in the path, so injection is impossible. Timing, error-string and reflection oracles all fire here and are all wrong.' },
  { id: 'ctl-xss-001', name: 'Sibling route renders the same stored field escaped', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: 'GET {basePath}/p/{slug}/plain', is_control: true, occurred: 'planted', note: 'Reads the SAME description from the SAME row and renders it through JSX, which escapes. Verified with a live payload: /rich served <img src=x onerror=...> raw while /plain served &lt;img .... A grader reporting XSS here has flagged the presence of attacker-controlled content rather than an injection sink — the content is identical, only the sink differs.' },
  { id: 'ctl-cookie-001', name: 'Secure and non-Secure cookie pair (client diagnostic)', category: 'not-a-finding', discovery_mechanism: 'authed-discovery', location: 'POST {basePath}/api/session/secure-flag and /plain-flag, read at /echo', is_control: true, occurred: 'planted', note: 'DIAGNOSTIC, NOT A VULNERABILITY, and it measures the CLIENT rather than the target. Over plain http a correct browser-equivalent client returns bl_plain and not bl_secure. Returning BOTH means the client transmits Secure cookies over an insecure channel; returning NEITHER means it drops cookies entirely, which invalidates every authed-discovery result it produces. The missing Secure attribute is already recorded as cookie-001 and is required for the fixture to work over http, so flagging these endpoints as a finding is wrong.' },

  { id: 'ctl-signup-001', name: 'Registration succeeds but grants no session (email confirmation)', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: '{basePath}/signup', is_control: true, occurred: 'planted', modes: { signup: ['confirm'] }, note: '15.0% of the measured corpus. THE ACCOUNT IS GENUINELY CREATED — verified: 1 request to /auth/v1/signup, no session returned, and the UI says to check email. Everything behind authentication is then CORRECTLY unreachable. A grader must record N/A, not a registration failure. Without this control there is no way to distinguish "our crawler is broken" from "this target is legitimately untestable".' },
  { id: 'ctl-signup-002', name: 'SSO-only: self-registration is not offered', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: '{basePath}/signup', is_control: true, occurred: 'planted', modes: { signup: ['sso'] }, note: '7.5% of the measured corpus. No registration form is rendered and the API refuses: POST /auth/v1/signup -> 422 signup_disabled. Correctly untestable, exactly like ctl-signup-001. Reporting a registration defect here is a false positive.' },

  // ---- UI-state controls. Each is the same component as its defect, with the
  // ---- one wrong behaviour corrected and nothing else changed.
  { id: 'ctl-qa-001', name: 'Create invalidates and the list updates', category: 'not-a-finding', discovery_mechanism: 'interaction', location: '{basePath}/qa/fresh', is_control: true, occurred: 'planted', note: 'Same component and endpoint as ui-002 with router.refresh() restored. Reporting stale UI here is a false positive.' },
  { id: 'ctl-qa-002', name: 'Failed save is surfaced to the user', category: 'not-a-finding', discovery_mechanism: 'interaction', location: '{basePath}/qa/honest-save', is_control: true, occurred: 'planted', note: 'Posts to the SAME always-500 endpoint as ui-003 and reports the failure. A probe that flags "save endpoint returns 500" without checking whether the UI admits it will fire here wrongly — the 500 is identical, the honesty is not.' },
  { id: 'ctl-qa-003', name: 'Deep link renders content on a cold load', category: 'not-a-finding', discovery_mechanism: 'interaction', location: '{basePath}/qa/deep-link-ok', is_control: true, occurred: 'planted', note: 'Same component as ui-004, fetching on mount. A direct GET renders content.' },
  { id: 'ctl-qa-004', name: 'Browser back behaves normally', category: 'not-a-finding', discovery_mechanism: 'interaction', location: '{basePath}/qa/back-ok', is_control: true, occurred: 'planted', note: 'Same page as ui-005 without the history re-push.' },
  { id: 'ctl-qa-005', name: 'Referenced script resolves', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: '{basePath}/qa/live-chunk', is_control: true, occurred: 'planted', note: 'Same markup shape as ui-006; the script exists and returns 200.' },

  // ---- Performance controls. THE MOST VALUABLE ENTRIES IN THE PERF SET.
  { id: 'ctl-perf-001', name: 'Comparable text response IS compressed', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: 'GET {basePath}/api/perf/fast', is_control: true, occurred: 'planted', modes: { perf: ['on'] }, note: 'Pair for perf-001.' },
  { id: 'ctl-perf-002', name: 'Cacheable asset has an ETag and an immutable max-age', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: 'GET {basePath}/api/perf/fast', is_control: true, occurred: 'planted', modes: { perf: ['on'] }, note: 'Pair for perf-002. Serves the identical body to /api/perf/no-validator with ETag and Cache-Control: public, max-age=31536000, immutable, and answers If-None-Match with 304.' },
  { id: 'ctl-perf-003', name: 'A page that is fast, light and cached', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: '{basePath}/perf/fast', is_control: true, occurred: 'planted', modes: { perf: ['on'] }, note: 'Sits in the SAME route group as the defects, so a probe cannot pass by treating /perf/* as uniformly bad. No blocking work, no oversized asset, two small requests. Web-vitals scoring carries substantial penalty weight with no external precision evidence, so this control — not the findings beside it — is what closes that exposure. Any finding reported here is a false positive.' },

  { id: 'ctl-015', name: 'Login errors do not permit account enumeration', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: 'POST /auth/v1/token?grant_type=password', is_control: true, occurred: 'naturally', note: 'Byte-identical invalid_credentials response for real and nonexistent accounts. Same endpoint as auth-001: one real weakness, one correctly handled.' },
]

// Which findings each hardening class actually closes. Deliberately NOT
// "everything that sounds related": `secrets` removes the two inlined keys and
// the deployment-file rewrites, but the system prompt and the synthetic account
// data are still bundle literals, so llm-001 and llm-002 survive it.
const HARDEN_FIXES: Record<string, string[]> = {
  rls: ['rls-001', 'rls-002', 'rls-003', 'rls-004', 'rls-005', 'storage-001', 'dial-rls-001'],
  secrets: ['key-001', 'key-002', 'probe-001', 'probe-002'],
  authz: ['authz-001', 'authz-002', 'authz-003', 'admin-001', 'dial-disc-001'],
  injection: ['inj-001', 'tmpl-001', 'xss-001'],
  headers: ['hdr-001', 'hdr-002'],
  auth: ['auth-001', 'auth-002'],
  qa: ['ui-002', 'ui-003', 'ui-004', 'ui-005', 'ui-006'],
  perf: ['perf-001', 'perf-002', 'perf-003', 'perf-004', 'perf-005'],
}

const HARDEN_CLASS = process.env.NEXT_PUBLIC_HARDEN_CLASS ?? 'none'

function hardening() {
  if (HARDEN_CLASS === 'none') return { class: 'none', is_hardened: false }

  const fixed =
    HARDEN_CLASS === 'all'
      ? Object.values(HARDEN_FIXES).flat()
      : (HARDEN_FIXES[HARDEN_CLASS] ?? [])

  const residual = FINDINGS.filter(presentNow)
    .filter((f) => !fixed.includes(f.id))
    .map((f) => ({ id: f.id, severity: f.severity }))

  return {
    class: HARDEN_CLASS,
    is_hardened: true,
    fixes: fixed,
    expected_residual: residual,
    expected_residual_count: residual.length,
    note:
      'A HARDENED BUILD SHOULD SCORE LOW, NOT ZERO. The ids under ' +
      'expected_residual are still genuinely present and a grader is CORRECT to ' +
      'report them; treating them as false positives penalises accuracy. They ' +
      'survive because no class in this set addresses them: the client-side ' +
      'prompt and its synthetic account data are still bundle literals, ' +
      'PostgREST still publishes its OpenAPI root and its version banner and ' +
      'still returns verbose errors, the session cookie still cannot be ' +
      'HttpOnly under the @supabase/ssr browser-client pattern nor Secure over ' +
      'plain http, and the discarded-error and settings-save defects are ' +
      'untouched. Scoring a hardened build against zero is the mistake this ' +
      'field exists to prevent.',
  }
}

function coverage() {
  const by: Record<string, { total: number; exclusive: number }> = {}
  for (const f of FINDINGS.filter(presentNow)) {
    const m =
      f.discovery_mechanism === 'varies-by-dial'
        ? { linked: 'static-crawl', bundle: 'bundle-mining', interaction: 'interaction', concatenated: 'suffix-convention' }[DISCOVERY_MODE] ?? 'static-crawl'
        : f.discovery_mechanism
    by[m] ??= { total: 0, exclusive: 0 }
    by[m].total++
    if (!f.reachable_by_other_means) by[m].exclusive++
  }
  return by
}

export async function GET() {
  return NextResponse.json(
    {
      target: 'supavulnbase / BuildLog',
      manifest_version: MANIFEST_VERSION,
      warning:
        'Intentionally vulnerable fixture. Never deploy to a public network. All data and credentials are synthetic.',
      base_path: process.env.NEXT_PUBLIC_BASE_PATH || '/',
      variant: process.env.NEXT_PUBLIC_BASE_PATH ? 'subpath-served (primary)' : 'root-served (comparison)',
      modes: {
        rls: RLS_MODE,
        discovery: DISCOVERY_MODE,
        perf: PERF_MODE,
        signup: SIGNUP_MODE,
        canonical: CANONICAL,
        is_canonical:
          RLS_MODE === CANONICAL.rls &&
          DISCOVERY_MODE === CANONICAL.discovery &&
          PERF_MODE === CANONICAL.perf &&
          SIGNUP_MODE === CANONICAL.signup,
        note:
          'Cite manifest_version AND both dial settings with any published score. ' +
          'The RLS dial changes only the policies on public.bookmarks; the table, its ' +
          'columns and its seed data are identical in all three. The discovery dial ' +
          'changes only how /api/bookmarks/all can be found, never what it does.',
      },
      hardening: hardening(),
      counts: {
        findings_present: FINDINGS.filter(presentNow).length,
        controls_present: CONTROLS.filter(presentNow).length,
        findings_all_modes: FINDINGS.length,
        controls_all_modes: CONTROLS.length,
      },
      discovery_coverage: coverage(),
      findings: FINDINGS.filter(presentNow),
      controls: CONTROLS.filter(presentNow),
      not_present_in_this_mode: [...FINDINGS, ...CONTROLS]
        .filter((e) => !presentNow(e))
        .map((e) => ({ id: e.id, modes: e.modes })),
      not_yet_built: [
        'interaction-gated route that exists only after a client-side click',
        'authed-discovery routes that 404 when anonymous rather than redirecting',
        'XSS reflect/escape sibling pair',
        'UI-state fixtures: empty shell on direct load, history hijack, 404ing chunk',
        'hygiene: soft 404s, mixed content, a second route group with correct headers',
      ],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
