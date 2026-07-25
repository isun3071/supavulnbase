# MANIFEST — ground truth

**Status: DRAFT — generate-and-audit pass only.**

This file documents **only the defects that occurred naturally.** The app was
written as a hackathon team would write it, with no security intent in either
direction, and then audited by hand against the running stack. Nothing has been
planted yet. The deliberate discovery obstacles and the vulnerability/control
pairs described in `CLAUDE.md` are listed at the bottom under
[Not yet present](#not-yet-present--to-be-planted).

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
```

---

## Discovery coverage

Findings only; controls excluded.

| Mechanism | Findings requiring it | Reachable by **no** other path |
|---|---|---|
| `baas-direct` | 5 — rls-001, rls-002, info-001, info-002, hdr-003 | 4 |
| `static-crawl` | 2 — hdr-001, hdr-002 | 2 |
| `authed-discovery` | 2 — authz-001, cookie-001 | 1 |
| `interaction` | 1 — ui-001 | 1 |
| `source-review` | 1 — err-001 | 1 |
| `bundle-mining` | 0 | 0 |
| `schema-error` | 0 | 0 |
| `suffix-convention` | 0 | 0 |

**The distribution is badly lopsided, which is the main structural result of
this pass.** Half of everything sits behind `baas-direct`, and three of the seven
mechanisms in the spec gate nothing at all. That is expected — those mechanisms
exist to be *built*, not to occur — but it means the fixture currently cannot
distinguish a grader that only knows how to hit PostgREST from a good one.

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

None of the following occurred naturally, which is consistent with the premise
in `CLAUDE.md`: a generator writes no policy rather than a bad one, and writes no
paired controls or discovery obstacles at all.

**Discovery obstacles — none exist yet.** Every finding above sits on a route
that is either linked, guessable, or part of the standard Supabase API surface.

- `bundle-mining`: service_role key in the bundle (pairs with `ctl-001`);
  unlinked `/api/admin/*` route; client-side system prompt as a string literal;
  synthetic PII interpolated into that prompt
- `schema-error`: a parameter discoverable only from a Zod validation error —
  **must not be a table column**, see `info-001`
- `suffix-convention`: `/api/products/search?q=` style SQL injection built by
  string concatenation, off a discovered collection
- `interaction`: a route that exists only after a client-side click
- `authed-discovery`: routes that 404 when anonymous; the `Secure` vs non-`Secure`
  cookie pair that exposes the plain-HTTP session bug
- `baas-direct`: `rls_permissive` (`using (auth.role() = 'authenticated')`);
  `rls_write_gap` (SELECT scoped, INSERT/UPDATE/DELETE unpoliced); a public
  storage bucket beside a correctly private one

**Missing controls:**

- the proxy route with no database in the path — intermittent 500s, 429s, and
  multi-second latency, to catch injection oracles keying on timing or error
  strings. Second most important control in the spec and entirely absent.
- decoy secrets that must not fire: Stripe `pk_test_`, assistant `asst_`,
  Vercel `prj_`/`dpl_`, beside a real-shaped `sk-proj-` that must
- an endpoint that escapes correctly, beside one that does not

**Missing infrastructure:**

- `GET /__manifest` — the HTTP-served copy of this file
- the root-served variant, as a second target for comparison
- remaining UI-state-honesty fixtures: client-side route rendering an empty
  shell on direct load, history hijack, served HTML referencing a 404ing chunk
- remaining hygiene floor: soft 404s, mixed content, a second route group with
  headers configured correctly to pair against `hdr-001`
