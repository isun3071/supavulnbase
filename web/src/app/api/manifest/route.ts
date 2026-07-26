import { NextResponse } from 'next/server'

// Machine-readable ground truth, served at {basePath}/__manifest.
// The prose version with detection steps and verification notes is MANIFEST.md
// in the repository root. verify.sh asserts the id sets match.

// Bump on any change to the finding or control set, or to what an entry
// asserts. Any published score against this fixture must cite this version AND
// both dial settings, or it is not reproducible.
const MANIFEST_VERSION = '0.4.0'

const RLS_MODE = process.env.RLS_MODE ?? 'off'
const DISCOVERY_MODE = process.env.NEXT_PUBLIC_DISCOVERY_MODE ?? 'linked'
const CANONICAL = { rls: 'off', discovery: 'linked' }

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
  modes?: { rls?: string[]; discovery?: string[] }
  note?: string
}

// An entry is present in the current build only if every dial it names includes
// the current setting.
function presentNow(e: Entry) {
  if (e.modes?.rls && !e.modes.rls.includes(RLS_MODE)) return false
  if (e.modes?.discovery && !e.modes.discovery.includes(DISCOVERY_MODE)) return false
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
  { id: 'auth-001', name: 'No rate limiting on the password grant — unlimited credential stuffing', category: 'broken-authentication', cwe: 'CWE-307', owasp_2025: 'A07', discovery_mechanism: 'static-crawl', reachable_by_other_means: true, location: 'POST /auth/v1/token?grant_type=password', severity: 'high', is_control: false, paired_control: 'ctl-014', occurred: 'naturally', note: '45 failed logins produced zero 429s and no lockout. Found after the planting pass; a natural omission, not a plant.' },
  { id: 'auth-002', name: 'Weak password policy — six characters, no complexity, no breach check', category: 'broken-authentication', cwe: 'CWE-521', owasp_2025: 'A07', discovery_mechanism: 'static-crawl', reachable_by_other_means: true, location: 'POST /auth/v1/signup', severity: 'low', is_control: false, paired_control: null, occurred: 'naturally', note: '"aaaaaa" is accepted; only a length>=6 rule exists.' },
  { id: 'info-001', name: 'PostgREST OpenAPI root discloses the full schema', category: 'information-disclosure', cwe: 'CWE-200', owasp_2025: 'A05', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'GET /rest/v1/ on the Supabase gateway', severity: 'medium', is_control: false, paired_control: null, occurred: 'naturally' },
  { id: 'info-002', name: 'Verbose SQL errors leak column names and SQLSTATE', category: 'information-disclosure', cwe: 'CWE-209', owasp_2025: 'A05', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'PostgREST error responses', severity: 'low', is_control: false, paired_control: null, occurred: 'naturally' },
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
  { id: 'ctl-008', name: 'User-controlled content is escaped', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: 'all rendered user content', is_control: true, occurred: 'naturally' },
  { id: 'ctl-009', name: 'payout_accounts has correct owner-scoped RLS on all four verbs', category: 'not-a-finding', discovery_mechanism: 'baas-direct', location: 'table public.payout_accounts', is_control: true, occurred: 'planted', note: 'Pair for rls-003. Same migration, more sensitive data, correctly scoped.' },
  { id: 'ctl-010', name: 'payout-documents is a correctly private bucket', category: 'not-a-finding', discovery_mechanism: 'baas-direct', location: 'bucket payout-documents', is_control: true, occurred: 'planted' },
  { id: 'ctl-011', name: 'Four public client identifiers that must not be reported', category: 'not-a-finding', discovery_mechanism: 'bundle-mining', location: 'compiled JS', is_control: true, occurred: 'planted', note: 'pk_test_ (Stripe publishable), asst_ (assistant id), prj_ and dpl_ (Vercel build metadata). All designed for the browser.' },
  { id: 'ctl-012', name: 'Integration proxy route with no database in the path', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: 'GET/POST {basePath}/api/integrations/ping', is_control: true, occurred: 'planted', note: 'Random 0.2-4s latency, intermittent 500/429, and payload reflection. Trips timing, error-string and reflection injection oracles at once. No injection is possible.' },
  { id: 'ctl-013', name: 'drafts UPDATE/DELETE policies read as open but are inert', category: 'not-a-finding', discovery_mechanism: 'source-review', location: 'policies on public.drafts', is_control: true, occurred: 'planted', note: 'using (true) looks like a write gap. PostgreSQL gates the UPDATE/DELETE row lookup on the SELECT policy, so it is unreachable. Verified as UPDATE 0.' },
  { id: 'ctl-014', name: 'Other auth endpoints ARE rate limited', category: 'not-a-finding', discovery_mechanism: 'baas-direct', location: 'POST /auth/v1/recover and /auth/v1/otp', is_control: true, occurred: 'naturally', note: 'Both 429 after a single request. Pair for auth-001: the correct finding is per-endpoint ("the password grant is unlimited"), not per-service ("auth is unlimited").' },
  { id: 'ctl-016', name: 'RLS dial at correct: bookmarks is owner-scoped on all four verbs', category: 'not-a-finding', discovery_mechanism: 'baas-direct', location: 'table public.bookmarks', is_control: true, occurred: 'planted', modes: { rls: ['correct'] }, note: 'Byte-identical table, columns and seed data to the broken modes; only the policies differ. A finding reported against public.bookmarks in this mode is a false positive. Note dial-disc-001 still leaks the same data through the app route in this mode — that is an app-layer failure, not an RLS one, and conflating them is the mistake this pair catches.' },
  { id: 'ctl-017', name: 'Summarize route proxies an external model provider with no database in the path', category: 'not-a-finding', discovery_mechanism: 'schema-error', location: 'POST {basePath}/api/summarize', is_control: true, occurred: 'planted', note: 'Second proxy control, alongside ctl-012. Random 0.18-4.1s latency, intermittent 500/429 with connect/timeout language, and the request echoed back. No database anywhere in the path, so injection is impossible. Timing, error-string and reflection oracles all fire here and are all wrong.' },
  { id: 'ctl-015', name: 'Login errors do not permit account enumeration', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: 'POST /auth/v1/token?grant_type=password', is_control: true, occurred: 'naturally', note: 'Byte-identical invalid_credentials response for real and nonexistent accounts. Same endpoint as auth-001: one real weakness, one correctly handled.' },
]

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
        canonical: CANONICAL,
        is_canonical: RLS_MODE === CANONICAL.rls && DISCOVERY_MODE === CANONICAL.discovery,
        note:
          'Cite manifest_version AND both dial settings with any published score. ' +
          'The RLS dial changes only the policies on public.bookmarks; the table, its ' +
          'columns and its seed data are identical in all three. The discovery dial ' +
          'changes only how /api/bookmarks/all can be found, never what it does.',
      },
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
