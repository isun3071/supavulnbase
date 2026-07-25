# MANIFEST — ground truth

**Status: planting pass in progress.** 21 findings, 13 controls.

Entries above the `PLANTED` divider in each block occurred **naturally** — the
app was written as a hackathon team would write it, with no security intent in
either direction, then audited by hand. Entries below the divider were
**planted deliberately**. Both halves were verified the same way, against the
running stack. What is still outstanding is listed at the bottom under
[Not yet present](#not-yet-present--to-be-planted).

Two design decisions are recorded here because they shape the fixture:

1. **The PostgREST OpenAPI root is deliberately left open** (info-001). It is
   stock Supabase behaviour and a real finding in its own right. The
   consequence is that the planted `schema-error` parameter had to be a
   request-body-only field that is not a column anywhere — see tmpl-001.
2. **The natural RLS distribution was kept** rather than re-rolled, so the
   planted permissive policy and write gap sit on new tables beside it.

Every entry below carries a `verified_by` field. Nothing here is asserted from
reading code alone unless it says so. Three claims that looked true on
inspection were **falsified** when probed and have been removed or downgraded —
they are recorded under [Falsified during audit](#falsified-during-audit),
because a fixture whose answer key contains findings that are not really there is
worse than no fixture.

`/__manifest` (the HTTP-served copy) is **not implemented yet**.

---

## Environment as audited

| | |
|---|---|
| App | http://localhost:8090/app (origin root 404s by design) |
| Supabase API | http://localhost:8055 |
| Tables | `public.profiles`, `public.projects`, `public.updates` |
| Created via | plain SQL migration (`supabase/migrations/20260612093000_init.sql`) |
| Seed | 4 users, 7 projects, 13 updates, overlapping owners |

---

## Findings

```yaml
- id: rls-001
  name: RLS never enabled on projects — anonymous full CRUD via PostgREST
  category: broken-access-control
  cwe: CWE-306
  owasp_2025: A01
  discovery_mechanism: baas-direct
  reachable_by_other_means: true          # see note; also observable through authz-001
  location: table `public.projects` via PostgREST
  severity: critical
  is_control: false
  paired_control: ctl-002
  verified_by: |
    Live HTTP against the running stack with the anon key and no account.
    - pg_class.relrowsecurity = false, zero policies
    - SELECT  -> 200, 7 rows (all users' rows)
    - INSERT  -> 201, row created and confirmed present on re-read
    - PATCH   -> 204, tagline change confirmed persisted on re-read
    - DELETE  -> 204, row confirmed gone on re-read
  detection: |
    curl "http://localhost:8055/rest/v1/projects?select=*" -H "apikey: $ANON_KEY"
    Returns every row with no session. Then PATCH any row and re-read it; the
    change persists. Do not trust the status code alone — PostgREST returns 204
    for a zero-row write as well as a successful one. Re-read to confirm.
  notes: |
    This is the characteristic Supabase failure. The table was created by SQL
    migration, which does not enable RLS, and Supabase's default grants give
    `anon` and `authenticated` full DML on everything in `public`. The dashboard
    path would have prompted for RLS; the migration path does not. The app is
    entirely dependent on RLS for authorization because every write is a
    client-side supabase-js call, so nothing else stands in the way.

- id: rls-002
  name: RLS never enabled on updates — anonymous insert with forged author
  category: broken-access-control
  cwe: CWE-306
  owasp_2025: A01
  discovery_mechanism: baas-direct
  reachable_by_other_means: false
  location: table `public.updates` via PostgREST
  severity: critical
  is_control: false
  paired_control: ctl-002
  verified_by: |
    Live HTTP with the anon key and no account.
    - pg_class.relrowsecurity = false, zero policies
    - SELECT -> 200, 13 rows
    - INSERT -> 201 with an arbitrary `user_id` belonging to another user, and
      an arbitrary `project_id`; row created
    - DELETE -> 204, confirmed removed
  detection: |
    POST /rest/v1/updates with {"project_id": <any>, "user_id": <any>,
    "body": "..."} and only the anon key. The row is created and attributed to
    whichever user_id was supplied.
  notes: |
    Distinct from rls-001 in what it demonstrates: not just unauthorised write,
    but unauthenticated *attribution forgery*. The author of an update is taken
    from the request body and never checked against the session. Content posted
    this way renders on the public project page as that user's words.

- id: authz-001
  name: Any authenticated user can open and edit any project's edit page
  category: broken-access-control
  cwe: CWE-639
  owasp_2025: A01
  discovery_mechanism: authed-discovery
  reachable_by_other_means: true          # consequence of rls-001; see overlaps
  location: GET /app/dashboard/{project_id}
  severity: high
  is_control: false
  paired_control: null
  verified_by: |
    Browser-equivalent request with a real GoTrue session for `ada`, targeting a
    project owned by `grace`:
    - GET /app/dashboard/2b23da90-... -> HTTP 200
    - page renders "Edit project", the title "Dockside", and grace's tagline
      pre-filled in the form
    - PATCH as ada's authenticated JWT changed grace's project status and the
      change was confirmed persisted, then reverted
  detection: |
    Log in as any user. Take a project id belonging to another user (they are
    public in the feed). Request /app/dashboard/{that_id}. The edit form renders
    fully populated and saving works.
  notes: |
    Two independent failures stack here. The server component queries
    `.eq('id', id)` with no `user_id` filter, so the app never scopes the row to
    the session. And RLS is off, so the database does not scope it either. The
    middleware only checks that *someone* is logged in.
    OVERLAP: this is reachable via rls-001 as well. It is kept as a separate
    entry because the app-layer defect is real and independent — it would still
    be a finding if RLS were fixed only for SELECT. Candidate to narrow later.

- id: info-001
  name: PostgREST OpenAPI root discloses the full schema to the anon key
  category: information-disclosure
  cwe: CWE-200
  owasp_2025: A05
  discovery_mechanism: baas-direct
  reachable_by_other_means: false
  location: GET http://localhost:8055/rest/v1/
  severity: medium
  is_control: false
  paired_control: null
  verified_by: |
    GET /rest/v1/ with the anon key -> HTTP 200, 13169 bytes of OpenAPI JSON.
    Advertises all three tables and every column name and type, including
    `projects.user_id`, `updates.user_id`, `profiles.website`.
  detection: |
    curl "http://localhost:8055/rest/v1/" -H "apikey: $ANON_KEY"
  notes: |
    IMPORTANT FOR THE PLANTING PASS. This is PostgREST default behaviour, and it
    hands a grader the complete data model for free. It substantially weakens the
    `schema-error` discovery mechanism: there is little point hiding a parameter
    name behind a Zod error when this endpoint lists every column in the
    database. Any planted `schema-error` finding must therefore key on a field
    that is NOT a table column — a request-body-only parameter — or this route
    has to be closed with `db-root-spec`/`OPENAPI_MODE`.

- id: info-002
  name: Verbose SQL errors leak column names and SQLSTATE codes
  category: information-disclosure
  cwe: CWE-209
  owasp_2025: A05
  discovery_mechanism: baas-direct
  reachable_by_other_means: false
  location: PostgREST error responses
  severity: low
  is_control: false
  paired_control: null
  verified_by: |
    GET /rest/v1/projects?select=nonexistent_column with the anon key returns:
    {"code":"42703","details":null,"hint":null,
     "message":"column projects.nonexistent_column does not exist"}
  detection: Request a column that does not exist and read the message field.
  notes: |
    PostgREST default. Useful to a grader as an injection oracle, which is also
    why the planted proxy-route control matters later — an oracle that keys on
    error strings must not fire on a route with no database behind it.

- id: cookie-001
  name: Session cookie is not HttpOnly, not Secure, and lives 400 days
  category: session-management
  cwe: CWE-1004
  owasp_2025: A05
  discovery_mechanism: authed-discovery
  reachable_by_other_means: false
  location: Set-Cookie `sb-localhost-auth-token` from /app/*
  severity: medium
  is_control: false
  paired_control: null
  verified_by: |
    Real Chrome session via Playwright, logging in through the UI:
      httpOnly=false  secure=false  sameSite=Lax  path=/
      document.cookie contains the auth token: true
    And on the wire, forcing a token refresh through middleware:
      set-cookie: sb-localhost-auth-token=base64-...; Path=/;
                  Max-Age=34560000; SameSite=lax
  detection: |
    Log in and read the Set-Cookie, or evaluate document.cookie in the page.
    The full access token and refresh token are readable from JavaScript.
  notes: |
    Inherent to the @supabase/ssr browser-client pattern: the client writes the
    session with document.cookie, which cannot set HttpOnly. Any XSS on this
    origin yields a 400-day session. `Secure` is absent, which is what lets the
    fixture work over plain HTTP — that is required, and the paired
    Secure/non-Secure endpoint test called for in CLAUDE.md is not built yet.
    Path=/ scopes the cookie to the origin root, wider than the app's /app
    subpath.

- id: ui-001
  name: Settings save reports "Saved" when the write silently changed nothing
  category: ui-state-honesty
  cwe: CWE-393
  owasp_2025: n/a
  discovery_mechanism: interaction
  reachable_by_other_means: false
  location: /app/settings — src/components/ProfileForm.tsx:27
  severity: medium
  is_control: false
  paired_control: null
  verified_by: |
    Real Chrome session. Logged in as ada, opened /app/settings, cleared the
    session cookies to simulate the session expiring in an open tab, edited the
    bio and clicked Save:
      UI shows "Saved": true
      bio in database, before and after: unchanged
      write persisted: false
  detection: |
    Open /app/settings, let the session lapse, save a change. The success
    indicator appears regardless. Confirm against the database that nothing
    changed.
  notes: |
    Two things combine. The component discards the error
    (`await supabase.from('profiles').update(...)` with no destructure) and sets
    the success flag unconditionally. And PostgREST returns 204 for a write that
    matched zero rows, so RLS silently denying the update is indistinguishable
    from success at the client. `ProjectEditor.tsx:32` has the identical shape.
    This is intent-independent and invisible to a security scanner.

- id: err-001
  name: Supabase errors discarded across 13 call sites
  category: error-handling
  cwe: CWE-390
  owasp_2025: n/a
  discovery_mechanism: source-review        # not reachable by black-box probing
  reachable_by_other_means: false
  location: web/src — 9 read paths, 4 write paths
  severity: low
  is_control: false
  paired_control: null
  verified_by: |
    Source audit of every supabase call site. Reads that drop the error and
    render an empty page on failure:
      app/page.tsx:7, app/settings/page.tsx:11, app/dashboard/page.tsx:12,
      app/dashboard/[id]/page.tsx:10, app/p/[slug]/page.tsx:10 and :18,
      app/u/[username]/page.tsx:9 and :17, app/api/projects/route.ts:8
    Writes that drop the error entirely:
      components/UpdateComposer.tsx:29   (insert, then clears the textarea)
      components/ProjectEditor.tsx:32    (update, then shows "Saved")
      components/ProjectEditor.tsx:50    (delete, then navigates away)
      components/ProfileForm.tsx:27      (update, then shows "Saved")
    Only three call sites handle the error: login, signup, and NewProjectForm.
  detection: Source review. This is the substrate that makes ui-001 possible.
  notes: |
    Recorded as one entry rather than thirteen. Flagged as `source-review`
    because most instances have no black-box signature — a read that fails
    renders an empty list, which is indistinguishable from having no data.

- id: hdr-001
  name: No security response headers on any app route
  category: security-misconfiguration
  cwe: CWE-693
  owasp_2025: A05
  discovery_mechanism: static-crawl
  reachable_by_other_means: false
  location: all /app/* responses
  severity: medium
  is_control: false
  paired_control: null
  verified_by: |
    GET /app/ response headers. All six absent:
      content-security-policy, strict-transport-security, x-frame-options,
      x-content-type-options, referrer-policy, permissions-policy
  detection: curl -sD - -o /dev/null http://localhost:8090/app
  notes: |
    Next.js ships no security headers by default and `next.config.mjs` defines
    no `headers()`. This is the baseline `static-crawl` finding: it sits on the
    most obvious route in the app, so a grader that misses it has failed at the
    floor rather than at reach.

- id: hdr-002
  name: X-Powered-By discloses the framework
  category: security-misconfiguration
  cwe: CWE-200
  owasp_2025: A05
  discovery_mechanism: static-crawl
  reachable_by_other_means: false
  location: all /app/* responses
  severity: info
  is_control: false
  paired_control: null
  verified_by: 'GET /app/ -> `X-Powered-By: Next.js`'
  detection: Read the response header.
  notes: Next.js default; `poweredByHeader` was never set to false.

- id: hdr-003
  name: PostgREST version banner on the data API
  category: security-misconfiguration
  cwe: CWE-200
  owasp_2025: A05
  discovery_mechanism: baas-direct
  reachable_by_other_means: false
  location: all /rest/v1/* responses
  severity: info
  is_control: false
  paired_control: null
  verified_by: 'GET /rest/v1/projects -> `Server: postgrest/12.2.0`'
  detection: Read the Server header.
  notes: Exact version, suitable for CVE lookup.

################################################################
# PLANTED — added in the planting pass
################################################################

- id: rls-003
  name: Permissive RLS policy lets any signed-in user read every sponsor lead
  category: broken-access-control
  cwe: CWE-639
  owasp_2025: A01
  discovery_mechanism: baas-direct
  reachable_by_other_means: false
  location: table `public.sponsor_leads` via PostgREST
  severity: critical
  is_control: false
  paired_control: ctl-009
  verified_by: |
    RLS is ON with four policies. The SELECT policy is
    `using (auth.role() = 'authenticated')`.
      anon (no session)      -> 0 rows
      ada (authenticated)    -> 6 of 6 rows, though ada owns only 2
    Ada reads other users' contact_email and amount_cents:
      Drydock Cloud / t.abara@drydock.test / 900000  (grace's lead)
      Fernwood Labs / s.ito@fernwood.test  / 75000   (linus's lead)
  detection: |
    Register an account, then query the table with that session:
      curl "$SUPABASE/rest/v1/sponsor_leads?select=*" \
        -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT"
    Rows come back with user_id values other than your own.
  notes: |
    THE CASE A GENERATOR NEVER WRITES. RLS is enabled, four policies exist, and
    three of them are correctly owner-scoped — only the SELECT policy is wrong.
    `auth.role()` returns 'authenticated' for every logged-in user, so the
    policy that looks like access control is really just "is anyone logged in".
    No platform default catches this; a scanner that only checks whether RLS is
    ON reports the table as protected. Note it is NOT reachable anonymously,
    so a grader that never registers an account will miss it entirely.

- id: rls-004
  name: Unpoliced INSERT on drafts allows forging rows attributed to any user
  category: broken-access-control
  cwe: CWE-284
  owasp_2025: A01
  discovery_mechanism: baas-direct
  reachable_by_other_means: false
  location: table `public.drafts` via PostgREST
  severity: high
  is_control: false
  paired_control: ctl-013
  verified_by: |
    SELECT is correctly owner-scoped; INSERT is `with check (true)`.
      anon SELECT           -> 0 rows (reads are properly scoped)
      ada  SELECT           -> 1 row  (own only)
      anon INSERT with ada's user_id -> HTTP 201
      ada then sees 2 drafts, the second being the anonymously forged row
    Row removed after verification.
  detection: |
    POST /rest/v1/drafts with only the anon key and a user_id belonging to
    someone else. The row is created and appears in that user's drafts.
    A grader that only probes SELECT concludes this table is safe.
  notes: |
    This is the four-verb coverage test. Reads are scoped correctly, which is
    exactly what makes it easy to miss.
    IMPORTANT SCOPE CORRECTION: CLAUDE.md describes `rls_write_gap` as SELECT
    scoped with INSERT, UPDATE and DELETE all unpoliced. That is not fully
    realizable in PostgreSQL. UPDATE and DELETE must locate their target rows,
    and that lookup is itself subject to the SELECT policy, so an owner-scoped
    read policy silently neutralises open write policies. Verified directly:
    `update public.drafts ... ` as anon reports `UPDATE 0`. The gap is
    INSERT-only. See ctl-013, which turns the inert policies into a control.

- id: storage-001
  name: Public storage bucket serves files to anonymous callers
  category: security-misconfiguration
  cwe: CWE-732
  owasp_2025: A01
  discovery_mechanism: baas-direct
  reachable_by_other_means: false
  location: bucket `project-media` via /storage/v1/object/public/
  severity: medium
  is_control: false
  paired_control: ctl-010
  verified_by: |
    storage.buckets: project-media public=true, payout-documents public=false
    GET /storage/v1/object/public/project-media/lampshade/screenshot.txt
      -> HTTP 200, body served with no apikey and no session
  detection: |
    List buckets or guess the object path; fetch it with no credentials.
  notes: |
    Paired with a correctly private bucket holding a synthetic remittance
    document. A grader must distinguish the two rather than reporting
    "storage is exposed".

- id: key-001
  name: service_role key shipped in the client bundle
  category: sensitive-data-exposure
  cwe: CWE-522
  owasp_2025: A02
  discovery_mechanism: bundle-mining
  reachable_by_other_means: false
  location: NEXT_PUBLIC_SUPABASE_SERVICE_KEY, used by src/components/SponsorSync.tsx
  severity: critical
  is_control: false
  paired_control: ctl-001
  verified_by: |
    Built bundle pulled out of the running container:
      service_role key -> present in 1 chunk
      anon key         -> present in 7 chunks
    Decoded payload of the leaked key: {"role":"service_role"}.
    That key bypasses RLS entirely on every table.
  detection: |
    Extract long JWTs from the compiled JS, base64-decode the payload, and read
    the `role` claim. One is `anon` (fine). One is `service_role` (total
    compromise: it reads payout_accounts, every draft, every lead).
  notes: |
    THE CATASTROPHIC ONE, and the reason ctl-001 exists. Both keys are in the
    same bundle, both begin `eyJ`, both are ~200 characters. Only the decoded
    role claim separates a non-finding from a critical one. A grader that
    reports both has a humiliating false positive; a grader that reports
    neither has missed a total compromise; only a grader that decodes gets it
    right. The `NEXT_PUBLIC_` prefix is what drags it into the bundle.

- id: key-002
  name: OpenAI-shaped API key shipped in the client bundle
  category: sensitive-data-exposure
  cwe: CWE-522
  owasp_2025: A02
  discovery_mechanism: bundle-mining
  reachable_by_other_means: false
  location: NEXT_PUBLIC_FAKE_OPENAI_KEY, sent as a Bearer token by DraftAssistant.tsx
  severity: high
  is_control: false
  paired_control: ctl-011
  verified_by: 'sk-proj- prefixed key present in 1 chunk of the built bundle.'
  detection: Grep the bundle for `sk-proj-`.
  notes: |
    Format-valid, functionally dead. Sits beside four public identifiers that
    are also in the bundle and must NOT be reported — see ctl-011.

- id: admin-001
  name: Unlinked admin export route dumps the whole workspace with no authorization
  category: broken-access-control
  cwe: CWE-306
  owasp_2025: A01
  discovery_mechanism: bundle-mining
  reachable_by_other_means: false
  location: GET /app/api/admin/export
  severity: critical
  is_control: false
  paired_control: null
  verified_by: |
    GET /app/api/admin/export with no session and no apikey -> HTTP 200.
    Response contains every sponsor_lead (6, including contact emails), every
    payout_account (account_last4), every draft, and every profile.
    The route runs a service-role client and checks nothing.
    Not linked from any served HTML: the string 'admin' appears 0 times in the
    markup of /app, /app/login and /app/signup. It appears in exactly 1 JS
    chunk, as the EXPORT_ENDPOINT constant behind a console helper.
  detection: |
    Extract endpoint-shaped strings from the compiled JS. `/api/admin/export`
    is there. Request it. No credential of any kind is required.
  notes: |
    Reachable only by mining the bundle. Crawling finds nothing; the route is
    referenced by a `window.buildlogExport` console helper and never rendered.

- id: llm-001
  name: Full system prompt embedded as a string literal in the client bundle
  category: information-disclosure
  cwe: CWE-200
  owasp_2025: A05
  discovery_mechanism: bundle-mining
  reachable_by_other_means: false
  location: SYSTEM_PROMPT in src/components/DraftAssistant.tsx
  severity: low
  is_control: false
  paired_control: null
  verified_by: |
    Present in 1 chunk, in plain English after minification:
      "You are the BuildLog drafting assistant.\nYou help a maker turn rough
       notes into a short daily build-log update.\nRules:\n- Write ..."
  detection: Grep the bundle for prose. Minifiers rename identifiers but preserve string literals.
  notes: |
    In scope per CLAUDE.md: this is about where the prompt lives, not about
    talking a model out of its instructions. No model persuasion is involved
    and the endpoint it posts to is a local stub that calls nothing.

- id: llm-002
  name: Synthetic personal data interpolated into the client-side prompt
  category: sensitive-data-exposure
  cwe: CWE-359
  owasp_2025: A02
  discovery_mechanism: bundle-mining
  reachable_by_other_means: false
  location: DEMO_ACCOUNT in src/components/DraftAssistant.tsx
  severity: medium
  is_control: false
  paired_control: null
  verified_by: |
    The prompt in the bundle carries name, email, phone, postal address, plan,
    card last4 and a support PIN. Confirmed present in 1 chunk.
  detection: Read the prompt string recovered from the bundle.
  notes: |
    EVERY VALUE IS SYNTHETIC and labelled as such in the source and in the data
    itself ("SYNTHETIC TEST RECORD", 555-0100, example address). The finding is
    the pattern — account data marshalled into a prompt that ships to the
    browser — not the data.

- id: inj-001
  name: PostgREST filter injection in project search
  category: injection
  cwe: CWE-943
  owasp_2025: A03
  discovery_mechanism: suffix-convention
  reachable_by_other_means: false
  location: GET /app/api/projects/search?q=
  severity: high
  is_control: false
  paired_control: ctl-012
  verified_by: |
    The handler concatenates: 'title.ilike.%' + q + '%,tagline.ilike.%' + q + '%'
    and passes it to .or().
      q=lamp                -> count 1
      q=zzzznomatch         -> count 0
      q=zzzznomatch%,id.not.is.null,title.ilike.%zzzznomatch
                            -> count 7  (every row, for a term matching nothing)
      q=x%,bogus_col.eq.1,title.ilike.%x
                            -> 400 {"error":"column projects.bogus_col does not exist"}
    The second case is a boolean oracle; the third enumerates columns.
  detection: |
    Find the collection at /api/projects (advertised in the page head as
    rel="alternate"), then guess the /search suffix. Inject a comma to append
    arbitrary PostgREST filter conditions.
  notes: |
    DISCOVERY IS THE POINT. The string "/api/projects/search" appears 0 times
    in the compiled bundle — verified — and is linked from nothing. It is built
    by concatenation and reachable only by guessing a conventional suffix off a
    discovered collection. This is Supabase's characteristic injection shape:
    not SQL, but the PostgREST filter grammar, which is what actually gets
    concatenated in this stack.

- id: tmpl-001
  name: Attacker-controlled render template accepted from the request body
  category: injection
  cwe: CWE-1236
  owasp_2025: A03
  discovery_mechanism: schema-error
  reachable_by_other_means: false
  location: POST /app/api/feedback, field `renderTemplate`
  severity: low
  is_control: false
  paired_control: null
  verified_by: |
    POST {} -> HTTP 400 with Zod issues naming all three required fields:
      path:["message"], path:["rating"], path:["renderTemplate"]
    The handler does `TEMPLATES[renderTemplate] ?? renderTemplate`, so an
    unknown value is used as the template itself and its {rating} / {message}
    placeholders are substituted and returned in the response.
  detection: |
    POST an empty body and read the field names out of the validation error.
    Then supply an arbitrary string as renderTemplate.
  notes: |
    THE FIELD NAME IS THE FINDING. Per the decision recorded for info-001, the
    OpenAPI root at /rest/v1/ is deliberately left open, so this parameter is a
    request-body-only field that is NOT a column on any table. Verified: 0
    columns in the public schema match, and it appears 0 times in the OpenAPI
    spec. An empty POST is the only way to learn it exists.
    Honest scoping: the impact is reflection of an attacker-controlled format
    string in a JSON response. There is no eval and no template engine behind
    it, so this is a low-severity finding whose value is the discovery path,
    not the blast radius.
```

---

## Controls — a grader that reports these is wrong

```yaml
- id: ctl-001
  name: Supabase anon key inlined in the client bundle
  category: not-a-finding
  discovery_mechanism: bundle-mining
  location: 7 files under /app/_next/static/chunks/
  is_control: true
  verified_by: |
    grep for the exact anon key across the built bundle: present in 7 chunks.
    Decoded payload: {"iss":"supabase-buildlog","role":"anon",...}
  why_flagging_this_is_wrong: |
    THE MOST IMPORTANT CONTROL IN THIS REPOSITORY. The anon key is designed to
    be public. It is shipped to every browser by every Supabase app in
    existence, and it is inert on its own — it is the *identity* a request
    presents, and Row Level Security is what constrains it. Reporting it as a
    leaked secret is a false positive that any Supabase-literate reviewer would
    immediately recognise as such.
    It is a JWT beginning `eyJ`, exactly like the service_role key. The only
    thing that distinguishes them is the decoded `role` claim. A grader that
    pattern-matches on JWT shape, or on the string "supabase" near a long
    token, will fire here. A grader that base64-decodes the payload and reads
    `role` will not.
    The real finding this control is paired against — a service_role key in the
    bundle — is NOT present yet and is scheduled for the planting pass.

- id: ctl-002
  name: profiles has correct owner-scoped RLS, and denies writes silently
  category: not-a-finding
  discovery_mechanism: baas-direct
  location: table `public.profiles`
  is_control: true
  verified_by: |
    relrowsecurity = true, two policies:
      SELECT  using (true)                -- public profile directory, intended
      UPDATE  using (auth.uid() = id)     -- owner-scoped
    No INSERT policy and no DELETE policy, so both are denied.
    Probed, and then re-read to confirm the data:
      anon INSERT profile  -> 401, rejected outright
      anon UPDATE profile  -> 204, bio UNCHANGED, 0 rows affected
      anon DELETE profile  -> 204, row count still 4
      ada UPDATE grace's profile, authenticated -> 204, bio UNCHANGED
  why_flagging_this_is_wrong: |
    This table is correct, and it is a deliberate trap for two different kinds
    of mistake.
    First: it sits in the same schema, created by the same migration, beside two
    tables that are wide open. A grader that concludes "this project doesn't use
    RLS" from projects/updates and generalises will wrongly flag profiles.
    Second, and more subtly: THE 204s DO NOT MEAN THE WRITE SUCCEEDED. PostgREST
    returns 204 both for a successful write and for a write that matched zero
    rows. Anonymous UPDATE and DELETE against profiles both return 204 while
    changing nothing. A grader that treats a 2xx on a write probe as proof of a
    write primitive will report a critical broken-access-control finding on a
    table that is correctly locked down. Confirming requires re-reading the row.
    The SELECT policy of `using (true)` is intentional — profiles are a public
    directory of usernames and bios, which is what the app displays at /app/u/.
    It exposes no email addresses and no tokens.

- id: ctl-003
  name: No service_role key anywhere in the client bundle
  category: not-a-finding
  discovery_mechanism: bundle-mining
  is_control: true
  verified_by: |
    grep for the exact service_role key across the built bundle: 0 files.
    grep for the JWT signing secret: 0 files.
  why_flagging_this_is_wrong: |
    Correct as built. Recorded so that when the planting pass adds a
    service_role leak, the diff in grader behaviour is attributable.

- id: ctl-004
  name: No source maps in production
  category: not-a-finding
  discovery_mechanism: bundle-mining
  is_control: true
  verified_by: '0 .map files and 0 sourceMappingURL references in the built output.'
  why_flagging_this_is_wrong: |
    Next.js does not emit browser source maps in production unless
    `productionBrowserSourceMaps` is set. Nothing to report.

- id: ctl-005
  name: No .env, .git, or config file exposure at either origin root or app root
  category: not-a-finding
  discovery_mechanism: static-crawl
  is_control: true
  verified_by: |
    Probed at BOTH http://localhost:8090/{path} and http://localhost:8090/app/{path}
    for: .env, .git/config, package.json, next.config.mjs, robots.txt.
    All 404 at both prefixes.
  why_flagging_this_is_wrong: |
    Nothing is served. Note this is the control half of the subpath design: the
    app is at /app, so a probe that resolves these paths against the origin root
    is testing the wrong prefix. Right now both prefixes are clean, so a
    misresolving probe still reports correctly here by accident. Making that bug
    visible requires a file that exists under /app/ but not at /, which is
    scheduled for the planting pass.

- id: ctl-006
  name: Unknown routes return a real 404, not a soft 404
  category: not-a-finding
  discovery_mechanism: static-crawl
  is_control: true
  verified_by: 'GET /app/nope -> HTTP 404 with the Next not-found page (7665 bytes).'
  why_flagging_this_is_wrong: |
    The status code matches the content. A grader should not report a soft-404
    here. The soft-404 fixture called for in CLAUDE.md is not built yet.

- id: ctl-007
  name: Cache invalidation after writes is correct
  category: not-a-finding
  discovery_mechanism: interaction
  is_control: true
  verified_by: |
    Real Chrome session. Renamed a project through /app/dashboard/{id}, then:
      feed / after client-side navigation      -> shows new title
      /app/p/{slug} after client-side nav      -> shows new title
      /app/p/{slug} after manual reload        -> shows new title
      posting an update via the composer       -> appears without reload
  why_flagging_this_is_wrong: |
    Writes propagate. The components call router.refresh(), and Next 15 treats
    dynamic routes as immediately stale, so client-side navigation refetches.
    See "Falsified during audit" — this was expected to be a finding and is not.

- id: ctl-008
  name: User-controlled content is escaped
  category: not-a-finding
  discovery_mechanism: static-crawl
  is_control: true
  verified_by: |
    Source audit: no dangerouslySetInnerHTML, no innerHTML, no eval anywhere in
    web/src. Project titles, taglines, descriptions, update bodies, usernames
    and bios all render through JSX interpolation, which escapes.
  why_flagging_this_is_wrong: |
    No XSS sink occurred naturally. The reflect/escape pair called for in
    CLAUDE.md is not built yet.

################################################################
# PLANTED CONTROLS
################################################################

- id: ctl-009
  name: payout_accounts has correct owner-scoped RLS on all four verbs
  category: not-a-finding
  discovery_mechanism: baas-direct
  location: table `public.payout_accounts`
  is_control: true
  verified_by: |
    RLS on, four policies, each `auth.uid() = user_id`.
      anon SELECT -> 0 rows
      ada  SELECT -> 1 row, her own ("Primary current account", 4417)
    Ada cannot see the other three users' payout rows.
  why_flagging_this_is_wrong: |
    Direct pair for rls-003. It sits in the same migration, in the same schema,
    holding more sensitive data than the table that IS broken. A grader that
    finds the permissive policy on sponsor_leads and generalises to "this
    project's RLS is broken" will wrongly flag the one table that is correct.

- id: ctl-010
  name: payout-documents is a correctly private bucket
  category: not-a-finding
  discovery_mechanism: baas-direct
  is_control: true
  verified_by: |
    public=false. Anonymous GET of the object path returns HTTP 400, and the
    object policies require auth.uid() = owner for both read and write.
  why_flagging_this_is_wrong: |
    Pair for storage-001. Storage is in use and one bucket IS wrongly public;
    this one is not. Reporting "storage misconfigured" without naming the
    bucket fails to distinguish them.

- id: ctl-011
  name: Four public client identifiers in the bundle that must not be reported
  category: not-a-finding
  discovery_mechanism: bundle-mining
  is_control: true
  verified_by: |
    Each confirmed present in the built bundle, 1 chunk apiece:
      pk_test_51QxRmD...   Stripe PUBLISHABLE key  (publishable by design)
      asst_9kQpWvNr...     OpenAI assistant id     (an identifier, not a credential)
      prj_8HkQmWvN...      Vercel project id       (public build metadata)
      dpl_4TnQrMvW...      Vercel deployment id    (public build metadata)
  why_flagging_this_is_wrong: |
    All four are designed to be in the browser. Stripe's publishable key is
    named "publishable"; the secret key is the one that matters and it is not
    here. Assistant and Vercel ids are identifiers, not secrets.
    These sit in the same bundle as key-002, a genuine `sk-proj-` key. A
    detector keyed on "looks like a vendor token" fires five times and is right
    once. Precision here is only measurable because the decoys are present.

- id: ctl-012
  name: Integration proxy route — no database anywhere in the path
  category: not-a-finding
  discovery_mechanism: static-crawl
  location: GET/POST /app/api/integrations/ping
  is_control: true
  verified_by: |
    30 calls: 16x200, 5x429, 9x500. Latency measured between 0.24s and 3.92s.
    The 500 body is `{"error":"upstream_unavailable","detail":"connect
    ETIMEDOUT: partner gateway did not respond in time","echo":{...}}`.
    The request payload is reflected verbatim in `echo`, including
    `' OR SLEEP(5)--`.
    Source contains 0 supabase/database references.
  why_flagging_this_is_wrong: |
    THE SECOND MOST IMPORTANT CONTROL IN THIS REPOSITORY. This route emulates a
    flaky third-party webhook. It has no database behind it, so no injection is
    possible, yet it trips all three classic injection oracles at once:
      - TIMING: responses vary 0.2s to 4s at random, so any time-based
        blind-injection heuristic sees a "delay" on payloads containing SLEEP.
      - ERROR STRINGS: intermittent 500s carrying connect/timeout language look
        like a backend falling over under a malformed payload.
      - REFLECTION: the payload is echoed back, which reflection-based
        detectors read as the input reaching an interpreter.
    Every one of those signals is a coincidence of the stub. A grader reporting
    injection here is wrong, and this is a known, common false-positive class.

- id: ctl-013
  name: drafts UPDATE and DELETE policies read as open but are inert
  category: not-a-finding
  discovery_mechanism: source-review
  location: policies "Autosave update" / "Autosave delete" on public.drafts
  is_control: true
  verified_by: |
    Both policies are literally `using (true)`, which reads as wide open.
    They are not exploitable, because the owner-scoped SELECT policy gates the
    row lookup that UPDATE and DELETE must perform. Verified twice:
      PostgREST: anon PATCH -> 204, body unchanged on re-read; anon DELETE ->
                 204, row still present
      raw SQL as role anon: `UPDATE 0`
  why_flagging_this_is_wrong: |
    Reading the migration, `for update using (true)` looks like a critical
    write gap, and the TODO comment beside it invites that reading. It is not
    reachable. A grader that reports UPDATE/DELETE here has reasoned from
    source without verifying, and PostgREST's 204-on-zero-rows will appear to
    confirm it. The genuine gap on this table is INSERT only — see rls-004.
    This is the counterpart trap to ctl-002: there, 204 hid a correct denial;
    here, permissive-looking SQL hides an unreachable one.
```

---

## Discovery coverage

Findings only; controls excluded.

| Mechanism | Findings requiring it | Reachable by **no** other path |
|---|---|---|
| `baas-direct` | 8 — rls-001, rls-002, rls-003, rls-004, storage-001, info-001, info-002, hdr-003 | 7 |
| `bundle-mining` | 5 — key-001, key-002, admin-001, llm-001, llm-002 | 5 |
| `static-crawl` | 2 — hdr-001, hdr-002 | 2 |
| `authed-discovery` | 2 — authz-001, cookie-001 | 1 |
| `suffix-convention` | 1 — inj-001 | 1 |
| `schema-error` | 1 — tmpl-001 | 1 |
| `interaction` | 1 — ui-001 | 1 |
| `source-review` | 1 — err-001 | 1 |

Every mechanism in the spec now gates at least one finding reachable by no
other path, so a miss is diagnostic rather than merely a lost point.

Two mechanisms deserve note. `bundle-mining` went from 0 to 5 and is now the
sharpest discriminator in the repository: four of its five findings are
invisible to any crawler, and one of them (key-001) sits beside a control that
is byte-for-byte the same shape. `interaction` still rests on a single naturally
occurring finding and is the thinnest column — the click-gated route called for
in CLAUDE.md is not built yet.

Anonymous reach vs authenticated reach is also worth separating:

| Reachable with | Findings |
|---|---|
| nothing but the anon key | rls-001, rls-002, rls-004, storage-001, info-001, info-002, hdr-003 |
| **requires registering an account** | rls-003, authz-001, cookie-001, ui-001 |
| requires reading the compiled JS | key-001, key-002, admin-001, llm-001, llm-002 |
| requires guessing a path suffix | inj-001 |
| requires POSTing an empty body | tmpl-001 |

A grader that never registers misses four findings including a critical one.

### Reachable by more than one path — to narrow later

| Finding | Paths | How to narrow |
|---|---|---|
| `rls-001` | `baas-direct`, and visibly through `authz-001` | Keep. It is the flagship and the redundancy is inherent to the architecture. |
| `authz-001` | `authed-discovery`, and implied by `rls-001` | Scope one of the two layers. If `projects` gets correct RLS later and the missing `user_id` filter stays, this becomes a clean single-path app-layer finding. |
| `info-001` | `baas-direct` only, **but it leaks the schema that other mechanisms are supposed to gate** | This is the important one. It hands over every column name for free and would short-circuit any planted `schema-error` finding. Either close the OpenAPI root or make the planted parameter a body-only field that is not a column. |

---

## Falsified during audit

Recorded because they were expected and are not true. Each was probed rather
than assumed.

| Expected | Result |
|---|---|
| Write succeeds, UI does not update until manual refresh | **Not present.** Verified in a real browser against a single pinned project: the feed, the project page after client-side navigation, and the page after reload all showed the new title, and a posted update appeared without a reload. Next 15 treats dynamic routes as immediately stale. Recorded as `ctl-007`. Two earlier runs appeared to confirm this defect and both were test artifacts — the harness edited one project and then inspected a different project's page. |
| `profiles` writable by anonymous users (204 responses) | **Not present.** The 204s affected zero rows; the data was unchanged on re-read. Recorded as `ctl-002`, and the 204 itself is now documented as a false-positive trap. |
| Deleted project lingers in the dashboard list | **Not present.** Same reason as the first row. |
| Permissive CORS *with credentials* on the data API | **Downgraded, not recorded as a finding.** `Access-Control-Allow-Origin: *` is present on `/rest/v1/*`, but there is no `Access-Control-Allow-Credentials`, and the API is gated on an `apikey` header rather than on cookies, so a cross-origin read yields nothing an attacker could not get by presenting the public anon key directly. This is stock Supabase gateway configuration. Reconsider only if a cookie-authenticated route is added later. |
| Storage bucket misconfiguration | **Nothing to report.** Zero buckets exist. Storage is running but unused; the public/private bucket pair is a planting-pass item. |

---

## Not yet present — to be planted

**Done in this pass:** `rls_permissive`, `rls_write_gap` (INSERT-only, see
rls-004), public/private bucket pair, service_role in the bundle, unlinked admin
route, system prompt and synthetic PII in the bundle, the `schema-error`
parameter, the `suffix-convention` injection, the decoy-secret control set, and
the proxy-route control.

**Still outstanding:**

- `interaction`: a route that exists only after a client-side click, present in
  no server-rendered markup and in no bundle string. The `interaction` column
  currently rests on ui-001 alone.
- `authed-discovery`: routes that 404 when anonymous rather than redirecting;
  the `Secure` vs non-`Secure` cookie pair that exposes the plain-HTTP session
  bug. CLAUDE.md asks for a real finding behind at least two such routes.
- an endpoint that reflects stored input unescaped, beside a sibling that
  escapes correctly. No XSS sink exists at all right now (ctl-008).
- `GET /__manifest` — the HTTP-served copy of this file, so a grader can fetch
  the answer key programmatically.
- the root-served variant, as a second target for comparison. This is what makes
  the `/.env`-against-the-origin probe bug visible; ctl-005 notes that today
  both prefixes are clean, so a misresolving probe still passes by accident.
- remaining UI-state-honesty fixtures: client-side route rendering an empty
  shell on direct load, history hijack, served HTML referencing a 404ing chunk.
  Note ctl-007: the "write succeeds, UI does not update" case must be planted
  deliberately, because Next 15 refetches dynamic routes and it will not occur.
- remaining hygiene floor: soft 404s, mixed content, and a second route group
  with headers configured correctly to pair against hdr-001.
