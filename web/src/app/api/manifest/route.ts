import { NextResponse } from 'next/server'

// Machine-readable ground truth, served at {basePath}/__manifest.
// The prose version with detection steps and verification notes is MANIFEST.md
// in the repository root. verify.sh asserts the id sets match.

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
  note?: string
}

const FINDINGS: Entry[] = [
  { id: 'rls-001', name: 'RLS never enabled on projects — anonymous full CRUD', category: 'broken-access-control', cwe: 'CWE-306', owasp_2025: 'A01', discovery_mechanism: 'baas-direct', reachable_by_other_means: true, location: 'table public.projects via PostgREST', severity: 'critical', is_control: false, paired_control: 'ctl-002', occurred: 'naturally' },
  { id: 'rls-002', name: 'RLS never enabled on updates — anonymous insert with forged author', category: 'broken-access-control', cwe: 'CWE-306', owasp_2025: 'A01', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'table public.updates via PostgREST', severity: 'critical', is_control: false, paired_control: 'ctl-002', occurred: 'naturally' },
  { id: 'rls-003', name: 'Permissive RLS policy lets any signed-in user read every sponsor lead', category: 'broken-access-control', cwe: 'CWE-639', owasp_2025: 'A01', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'table public.sponsor_leads via PostgREST', severity: 'critical', is_control: false, paired_control: 'ctl-009', occurred: 'planted', note: 'requires a registered account; not reachable anonymously' },
  { id: 'rls-004', name: 'Unpoliced INSERT on drafts allows forging rows for any user', category: 'broken-access-control', cwe: 'CWE-284', owasp_2025: 'A01', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'table public.drafts via PostgREST', severity: 'high', is_control: false, paired_control: 'ctl-013', occurred: 'planted', note: 'INSERT only; UPDATE/DELETE are gated by the SELECT policy' },
  { id: 'storage-001', name: 'Public storage bucket serves files anonymously', category: 'security-misconfiguration', cwe: 'CWE-732', owasp_2025: 'A01', discovery_mechanism: 'baas-direct', reachable_by_other_means: false, location: 'bucket project-media', severity: 'medium', is_control: false, paired_control: 'ctl-010', occurred: 'planted' },
  { id: 'authz-001', name: 'Any authenticated user can open and edit any project', category: 'broken-access-control', cwe: 'CWE-639', owasp_2025: 'A01', discovery_mechanism: 'authed-discovery', reachable_by_other_means: true, location: 'GET {basePath}/dashboard/{project_id}', severity: 'high', is_control: false, paired_control: null, occurred: 'naturally' },
  { id: 'key-001', name: 'service_role key shipped in the client bundle', category: 'sensitive-data-exposure', cwe: 'CWE-522', owasp_2025: 'A02', discovery_mechanism: 'bundle-mining', reachable_by_other_means: false, location: 'NEXT_PUBLIC_SUPABASE_SERVICE_KEY in the compiled JS', severity: 'critical', is_control: false, paired_control: 'ctl-001', occurred: 'planted' },
  { id: 'key-002', name: 'OpenAI-shaped API key in the client bundle', category: 'sensitive-data-exposure', cwe: 'CWE-522', owasp_2025: 'A02', discovery_mechanism: 'bundle-mining', reachable_by_other_means: false, location: 'NEXT_PUBLIC_FAKE_OPENAI_KEY in the compiled JS', severity: 'high', is_control: false, paired_control: 'ctl-011', occurred: 'planted' },
  { id: 'admin-001', name: 'Unlinked admin export dumps the workspace with no authorization', category: 'broken-access-control', cwe: 'CWE-306', owasp_2025: 'A01', discovery_mechanism: 'bundle-mining', reachable_by_other_means: false, location: 'GET {basePath}/api/admin/export', severity: 'critical', is_control: false, paired_control: null, occurred: 'planted' },
  { id: 'llm-001', name: 'Full system prompt embedded as a bundle string literal', category: 'information-disclosure', cwe: 'CWE-200', owasp_2025: 'A05', discovery_mechanism: 'bundle-mining', reachable_by_other_means: false, location: 'SYSTEM_PROMPT in the compiled JS', severity: 'low', is_control: false, paired_control: null, occurred: 'planted' },
  { id: 'llm-002', name: 'Synthetic personal data interpolated into the client-side prompt', category: 'sensitive-data-exposure', cwe: 'CWE-359', owasp_2025: 'A02', discovery_mechanism: 'bundle-mining', reachable_by_other_means: false, location: 'DEMO_ACCOUNT in the compiled JS', severity: 'medium', is_control: false, paired_control: null, occurred: 'planted', note: 'all values synthetic and labelled as such' },
  { id: 'inj-001', name: 'PostgREST filter injection in project search', category: 'injection', cwe: 'CWE-943', owasp_2025: 'A03', discovery_mechanism: 'suffix-convention', reachable_by_other_means: false, location: 'GET {basePath}/api/projects/search?q=', severity: 'high', is_control: false, paired_control: 'ctl-012', occurred: 'planted' },
  { id: 'tmpl-001', name: 'Attacker-controlled render template from the request body', category: 'injection', cwe: 'CWE-1236', owasp_2025: 'A03', discovery_mechanism: 'schema-error', reachable_by_other_means: false, location: 'POST {basePath}/api/feedback, field renderTemplate', severity: 'low', is_control: false, paired_control: null, occurred: 'planted' },
  { id: 'probe-001', name: 'Deployment .env served under the app root', category: 'sensitive-data-exposure', cwe: 'CWE-538', owasp_2025: 'A05', discovery_mechanism: 'path-probe', reachable_by_other_means: false, location: 'GET {basePath}/.env', severity: 'critical', is_control: false, paired_control: null, occurred: 'planted', note: 'resolves against the APP root, not the origin; JWT_SECRET and service_role key inside' },
  { id: 'probe-002', name: 'Git config with embedded token served under the app root', category: 'sensitive-data-exposure', cwe: 'CWE-538', owasp_2025: 'A05', discovery_mechanism: 'path-probe', reachable_by_other_means: false, location: 'GET {basePath}/.git/config', severity: 'high', is_control: false, paired_control: null, occurred: 'planted', note: 'resolves against the APP root, not the origin' },
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
  { id: 'ctl-015', name: 'Login errors do not permit account enumeration', category: 'not-a-finding', discovery_mechanism: 'static-crawl', location: 'POST /auth/v1/token?grant_type=password', is_control: true, occurred: 'naturally', note: 'Byte-identical invalid_credentials response for real and nonexistent accounts. Same endpoint as auth-001: one real weakness, one correctly handled.' },
]

function coverage() {
  const by: Record<string, { total: number; exclusive: number }> = {}
  for (const f of FINDINGS) {
    const m = f.discovery_mechanism
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
      warning:
        'Intentionally vulnerable fixture. Never deploy to a public network. All data and credentials are synthetic.',
      base_path: process.env.NEXT_PUBLIC_BASE_PATH || '/',
      variant: process.env.NEXT_PUBLIC_BASE_PATH ? 'subpath-served (primary)' : 'root-served (comparison)',
      counts: { findings: FINDINGS.length, controls: CONTROLS.length },
      discovery_coverage: coverage(),
      findings: FINDINGS,
      controls: CONTROLS,
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
