# MANIFEST — ground truth

```
version: 0.7.0
```

**Cite this version and both dial settings with any published score, or the
number is not reproducible.** `/__manifest` returns all three.

**Status: passes A and B complete, coverage gaps closed, auth-failure taxonomy added.** 45 findings, 29 controls declared across
all modes; `/__manifest` reports how many are present in the current one.

## The hardened reference

A second, self-contained stack on its own ports, with **exactly one flaw class
fixed and nothing else tidied**, so a differential against the vulnerable target
is attributable to that class alone.

```bash
./harden.sh authz      # fix only app-layer authorization
./harden.sh all        # fix everything (expect the residual below)
./harden.sh none       # sanity: should behave like the vulnerable target
./harden.sh --sweep    # every class in turn, asserting each diff is minimal
```

| | |
|---|---|
| vulnerable | http://localhost:8090/app |
| hardened | http://localhost:8092/app (Supabase on :8093) |

Classes: `rls` `secrets` `authz` `injection` `headers` `auth` `qa` `perf`.

It is one codebase gated on `HARDEN_CLASS`, not a second cleaned-up copy —
that is what guarantees the diff is minimal. Same source, same build, same
image layers; exactly one class of behaviour changes.

It needs its **own database and its own GoTrue** because two classes are not
per-container properties: `rls` lives in Postgres policies and `auth` lives in
gateway/GoTrue configuration. Sharing either would mean hardening one target
silently hardened the other.

`./harden.sh --sweep` asserts the minimal-diff property directly: for each
class, that class must read FIXED and all seven others must still read PRESENT.
It currently passes for all eight. It has already caught two real defects — a
persisted database volume that left `rls` hardened after any earlier run (fixed
with an explicit revert overlay) and a probe whose non-unique slug collided
into a 409 that read as a false FIX.

### The hardened build must still WORK

Two defects in the first hardened build made the target unusable, and both are
worth recording because they are easy to reintroduce:

- **The CSP had no `connect-src`.** The app is served on one port and its
  Supabase API on another, so they are different origins. Without an explicit
  `connect-src` the policy falls back to `default-src 'self'` and the browser
  blocks every supabase-js call *before dispatch* — the symptom is
  "failed to fetch" with **nothing in the network tab**, because no request is
  ever made. The CSP now derives the API origin from
  `NEXT_PUBLIC_SUPABASE_URL`.
- **The gateway rate limit was 5/minute.** That stops credential stuffing and
  also locks out a grader that logs in a few times while crawling, making every
  authed route unreachable for reasons that look like the target's fault. It is
  now 8/minute on the credential endpoint only.

- **The gateway rate limit covered the whole `/auth/v1/` prefix.**
  `@supabase/ssr` calls `/auth/v1/user` on *every* request to validate the
  session, and the middleware matcher covers nearly every route, so the limit
  throttled session checks rather than logins: `getUser()` began returning 429,
  the user read as signed out, and the app bounced to `/login` after about two
  clicks. The limit now applies only to `/auth/v1/token`, the
  credential-submission endpoint — which is also the correct design. Measured
  after the split: 0 x 429 in 40 session checks, 11 x 429 in 30 login attempts.

None of the three was visible to `curl`: a CSP only takes effect in a browser,
and a rate limit only bites across a session. All were found by driving Chrome
against :8092.

**`infra/smoke.mjs` now guards against all three**, and `harden.sh` runs it on
every build. It logs in through the UI, walks twelve pages across two laps, and
fails on any CSP violation, any failed request, or any bounce to `/login`. The
first version did two hops and would have missed the rate-limit bug entirely;
the twelve-hop walk is what catches a session that decays under normal use.
Exit 2 means no browser was available and the check was skipped, so a machine
without Chrome does not report a working target as broken.

A hardened reference that cannot be logged into or crawled produces no
differential at all, so "does it still work" is part of the hardening contract.

### Expected residual — a hardened build scores LOW, not ZERO

`GET /__manifest` on the hardened target returns a `hardening` block naming the
class, the finding ids it fixes, and the **expected residual**. With
`HARDEN_CLASS=all`, 33 findings are fixed and **9 remain**:

`llm-001` `llm-002` `sum-001` `info-001` `info-002` `cookie-001` `ui-001`
`err-001` `hdr-003`

These are genuinely still present and **a grader is correct to report them**.
They survive because no class in the set addresses them: the client-side prompt
and its synthetic account data are still bundle literals, PostgREST still
publishes its OpenAPI root, its version banner and verbose errors, the session
cookie cannot be HttpOnly under the `@supabase/ssr` browser-client pattern nor
Secure over plain http, and the discarded-error and settings-save defects are
untouched.

Scoring a hardened build against zero would mark every one of those correct
findings as a false positive. That is the mistake this declaration exists to
prevent.

## Modes

Two dials. Shape A versus shape B is deliberately NOT a third dimension — that
would be a separate compose profile or a separate repo.

| Dial | Env var | Settings | What changes |
|---|---|---|---|
| RLS | `RLS_MODE` | `off` · `permissive` · `correct` | Only the policies on `public.bookmarks`. Table, columns and seed data are identical in all three. |
| Discovery | `DISCOVERY_MODE` | `linked` · `bundle` · `interaction` · `concatenated` | Only how `/api/bookmarks/all` can be found. The route behaves identically in all four. |
| Perf | `PERF_MODE` | `on` · `off` | Whether the `/perf/*` route group exists at all. Off by default: a three-second sleep in a normal crawl would slow the crawler, trip timeouts and could gate off the security and QA probes. |

**Canonical mode is `RLS_MODE=off` + `DISCOVERY_MODE=linked` + `PERF_MODE=off`.**

One table across three policy variants is the point: three separately named
tables would confound the comparison with naming and content differences, so
the policy would no longer be the only variable. Same for the discovery dial —
the finding is byte-identical, only reachability moves.

The two dials are independent by construction. `dial-rls-001` is a database
authorization failure reached through PostgREST; `dial-disc-001` is an
app-layer authorization failure reached through a Next route holding a
service-role client. `dial-disc-001` leaks the same rows **even when
`RLS_MODE=correct`**, which is the point: conflating "RLS is correct" with "the
data is protected" is exactly the mistake the pair catches.

Each entry below carries a `modes:` field when it is mode-dependent. Absent
means it exists in every mode. CI should run all combinations — the comparison
is the whole reason the dials exist.

Ground truth is also served over HTTP at **`GET {basePath}/__manifest`**
(`http://localhost:8090/app/__manifest`). `verify.sh` asserts that the ids
served there match the ids in this file, so the two cannot drift apart.

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

One entry, `auth-001`, was found by the user **after** the planting pass, by
asking a question the manifest could not answer. It is labelled as a natural
omission rather than a plant. Expect more of these: the manifest describes what
has been checked, not everything that is true.

---

## Environment as audited

| | |
|---|---|
| App | http://localhost:8090/app (origin root 404s by design) |
| Supabase API | http://localhost:8055 |
| Tables | `public.profiles`, `public.projects`, `public.updates` |
| Created via | plain SQL migration (`supabase/migrations/20260612093000_init.sql`) |
| Seed | 4 users, 7 projects, 13 updates, overlapping owners |
| Note | A grader run mutates this. Writes are wide open by design and self-registration works, so user and row counts grow. `verify.sh` treats seed counts as lower bounds and tests relationships, not fixed numbers. `docker compose down -v` resets. |

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
    Unauthorized write only. The impersonation half was SPLIT OUT into rls-005
    on review: forging authorship is a different weakness class with a different
    CWE, and it is the more alarming of the two.

- id: rls-005
  name: Anonymous attribution forgery — content published as another user
  category: improper-authentication
  cwe: CWE-345
  owasp_2025: A07
  discovery_mechanism: baas-direct
  reachable_by_other_means: false
  location: table `public.updates` via PostgREST, `user_id` column
  severity: critical
  is_control: false
  paired_control: ctl-002
  occurred: naturally
  verified_by: |
    POST /rest/v1/updates with only the anon key and a `user_id` belonging to
    another user -> HTTP 201. The row is created and attributed to that user.
    Confirmed the forged entry then renders on the public project page under
    that person's name, in their update log, indistinguishable from their own
    writing. Row removed after verification.
  detection: |
    Insert an update with a user_id you do not control, then load
    {basePath}/p/{slug} and observe the content attributed to that account.
  notes: |
    SPLIT FROM rls-002 on review. rls-002 is "an anonymous caller can write to a
    table they should not". This is "an anonymous caller can publish words under
    a named person's identity", which is impersonation: CWE-345 rather than
    CWE-306, and A07 rather than A01.
    The distinction is not academic. The write is the vulnerability; the
    forgeable authorship is the impact, and it is the half that would matter in
    an incident review. The author is taken from the request body and never
    checked against the session, so nothing in the app or the database ties the
    content to the account it claims to come from.
    A grader that reports only "unauthorized write" has found half of this.

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
    GET /storage/v1/bucket with the anon key -> lists both buckets
    GET /storage/v1/object/public/project-media/lampshade/screenshot.txt
      -> HTTP 200, body served with no apikey and no session
    Asserted at the end of the seed run AND in verify.sh.
  detection: |
    GET /storage/v1/bucket to enumerate, then fetch the object with no
    credentials via /storage/v1/object/public/{bucket}/{path}.
  notes: |
    TWICE CORRECTED after grader feedback on 2026-07-25, and both corrections
    matter more than the finding.
    First, it was DECLARED BUT NOT DEPLOYED. The grader got
    {"error":"Bucket not found"}. Cause: seed.mjs short-circuited on "any
    project exists", so any stack upgraded without `docker compose down -v` had
    content from before the buckets were added and never ran the bucket step.
    The failure was masked because the bucket call was wrapped in a try/catch
    that logged every error as "already exists". Seeding is now idempotent per
    resource, the catch is gone, seed depends on storage being healthy, and the
    run ends by asserting project-media exists and is public — the fixture
    refuses to come up while claiming a finding it does not have.
    Second, it was UNDISCOVERABLE. Anonymous GET /storage/v1/bucket returned an
    empty array because storage.buckets had no SELECT policy, so the bucket was
    reachable only by guessing its name. A `baas-direct` finding that cannot be
    enumerated is not really reachable; migration 20260614102000 adds the
    listing policy.
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
  severity: high
  is_control: false
  paired_control: null
  verified_by: |
    POST {} -> HTTP 400 with Zod issues naming all three required fields:
      path:["message"], path:["rating"], path:["renderTemplate"]
    The handler does `TEMPLATES[renderTemplate] ?? renderTemplate`, so an
    unknown value becomes the template, and templates are EVALUATED:
      renderTemplate="{{7*7}}"        -> {"rendered":"49"}
      renderTemplate="{{rating*20}}"  -> evaluates against the request's rating
  detection: |
    POST an empty body and read the field names out of the validation error.
    Then send renderTemplate="{{7*7}}" and observe "49" in the response.
  notes: |
    REVISED after grader feedback on 2026-07-25. As first built this endpoint
    echoed the template back verbatim, which was not black-box detectable: a
    legitimate report builder or email-preview feature accepts a caller-supplied
    template and reflects it, so there was no observable difference between this
    app and a correct one. Firing on a field merely named `renderTemplate` would
    have been a naming heuristic, not evidence. The template is now genuinely
    evaluated server side, which makes it real SSTI with a provable signal.
    SCOPE, STATED PRECISELY SO THIS DOES NOT OVERCLAIM. The evaluator in
    web/src/lib/template.ts is not a general code evaluator. It supports
    numbers, the named context variables, + - * / %, and parentheses. There is
    no eval(), no new Function(), no property access, no function calls, and no
    reachable host object. `{{7*7}}` returns 49; `{{process.env}}` and
    `{{constructor.constructor('...')()}}` do not evaluate and are returned
    unchanged. It is deliberately enough to produce the canonical SSTI signal
    without shipping an RCE primitive in a container that also holds a
    service_role key. A grader reporting "SSTI, arithmetic evaluation confirmed"
    is correct. One reporting "RCE" is overclaiming.
    THE FIELD NAME IS STILL THE DISCOVERY PATH. Per the decision recorded for
    info-001 the OpenAPI root is deliberately open, so this parameter is a
    request-body-only field that is NOT a column on any table. Verified: 0
    columns in the public schema match, 0 occurrences in the OpenAPI spec.

- id: probe-001
  name: Deployment .env served under the app root
  category: sensitive-data-exposure
  cwe: CWE-538
  owasp_2025: A05
  discovery_mechanism: path-probe
  reachable_by_other_means: false
  location: GET http://localhost:8090/app/.env
  severity: critical
  is_control: false
  paired_control: ctl-005
  verified_by: |
    GET /app/.env            -> 200, plain text
    GET /.env  (origin root) -> 404
    Body contains POSTGRES_PASSWORD, the full DATABASE_URL, SMTP_PASSWORD,
    the service_role key, and JWT_SECRET. The JWT secret is the worst of them:
    it signs the whole auth system, so it forges any user or role at will.
  detection: |
    Probe common config paths RELATIVE TO THE APP ROOT:
      curl http://localhost:8090/app/.env
    Probing http://localhost:8090/.env returns 404 and proves nothing.
  notes: |
    THIS IS THE FINDING THE SUBPATH DESIGN EXISTS TO CATCH, and the reason
    CLAUDE.md's third design rule is not decorative.
    A path-guessing probe that resolves candidates against the ORIGIN instead
    of the app root requests /.env, gets 404, and reports the target clean —
    while a critical secret leak sits one prefix away. Against any fixture
    served at / that bug is invisible, because both resolutions coincide.
    Here they do not, so the bug becomes measurable. It applies to every
    user.github.io/project/ style deployment in the wild.
    IMPLEMENTATION NOTE, for honesty: these paths are served by a rewrite in
    next.config.mjs rather than by static files, because Next refuses to serve
    dotfiles out of public/ (verified: it returns 400). What is being emulated
    is a deployment whose webserver document root is the project directory —
    shared hosting, a misconfigured nginx `root`, a cloned repo sitting above
    the build. The observable behaviour is identical to that shape; only the
    mechanism differs, and the mechanism is invisible to a grader.
    Cross-check with the root-served variant on :8091, where the same file is
    at /.env and /app/.env 404s. The difference between the two runs is the
    diagnosis.

- id: probe-002
  name: Git config with an embedded credential served under the app root
  category: sensitive-data-exposure
  cwe: CWE-538
  owasp_2025: A05
  discovery_mechanism: path-probe
  reachable_by_other_means: false
  location: GET http://localhost:8090/app/.git/config
  severity: high
  is_control: false
  paired_control: ctl-005
  verified_by: |
    GET /app/.git/config            -> 200
    GET /.git/config (origin root)  -> 404
    Remote URL embeds a synthetic ghp_ token.
  detection: Probe /.git/config relative to the app root, not the origin.
  notes: |
    Same resolution trap as probe-001, second path so the behaviour is not a
    one-off. The token is synthetic and inert.

- id: dial-rls-001
  name: "RLS dial: bookmarks readable across users"
  category: broken-access-control
  cwe: CWE-639
  owasp_2025: A01
  discovery_mechanism: baas-direct
  reachable_by_other_means: false
  location: table `public.bookmarks` via PostgREST
  severity: critical
  is_control: false
  paired_control: ctl-016
  occurred: planted
  modes:
    rls: [off, permissive]
  verified_by: |
    RLS_MODE=off         anon SELECT -> all 6 bookmarks including private notes,
                         and anon INSERT/UPDATE/DELETE all succeed
    RLS_MODE=permissive  anon SELECT -> 0 rows; ada SELECT -> 6 rows though she
                         owns 2; writes correctly refused for rows she does not own
    RLS_MODE=correct     anon SELECT -> 0 rows; ada SELECT -> exactly her 2
    Seed data is deliberately cross-user: every bookmark is one person's private
    note about someone else's project, so a leak is visible immediately.
  detection: |
    Query the table with the anon key, then with a registered session, and
    compare the row count against the number you own.
  notes: |
    THE POINT IS THE COMPARISON, NOT THE FINDING. Same table name, same columns,
    same seed data in all three modes; only the policy set differs. Three
    separately named tables would have confounded it with naming and content.
    `permissive` is the setting no platform default prevents. RLS is enabled,
    four policies exist, three of them are correctly owner-scoped, and every
    "is RLS on?" check passes — the SELECT policy is
    `using (auth.role() = 'authenticated')`, which reads as access control and
    behaves as "is anyone signed in". It is what a generator that writes
    policies rather than omitting them tends to produce, and writes staying
    correctly scoped is what makes it easy to miss.
    Note this finding is NOT reachable anonymously in `permissive`. A grader
    that never registers an account sees a clean table.

- id: dial-disc-001
  name: Bookmark export route has no authorization
  category: broken-access-control
  cwe: CWE-306
  owasp_2025: A01
  discovery_mechanism: varies-by-dial
  reachable_by_other_means: false
  location: GET {basePath}/api/bookmarks/all
  severity: high
  is_control: false
  paired_control: null
  occurred: planted
  verified_by: |
    GET with no session and no apikey -> HTTP 200, every user's bookmarks with
    their private notes. Confirmed identical in all three RLS modes, including
    `correct`, because the route holds a service-role client.
    Reachability per DISCOVERY_MODE:
      linked        anchor present in the served HTML of {basePath}/bookmarks
      bundle        string literal in one JS chunk, rendered nowhere
      interaction   returned by POST {basePath}/api/bookmarks {action:"tools"},
                    which the UI sends only on click; absent from markup and bundle
      concatenated  assembled from ['api','bookmarks','all'] at click time;
                    the whole path appears nowhere
  detection: Depends on the dial. That is the entire purpose of the entry.
  notes: |
    THE SECOND DIAL. The finding never changes; only the reach capability
    required to arrive at it does. Effective mechanism by mode:
      linked -> static-crawl, bundle -> bundle-mining,
      interaction -> interaction, concatenated -> suffix-convention.
    So one fixture sweeps four mechanisms with the vulnerability held constant,
    which is the cleanest possible measurement of reach independent of detection.
    IT IS A NEXT ROUTE, DELIBERATELY. The PostgREST OpenAPI root (info-001) is
    left open and lists every table, so a table-based finding is always
    enumerable and could not be discovery-gated. A Next route is invisible to
    OpenAPI, which is what makes this dial meaningful at all.
    INDEPENDENT OF THE RLS DIAL. It leaks the same rows when RLS_MODE=correct.
    Reporting "bookmarks are protected" after checking only RLS is exactly the
    error this catches.

- id: sum-001
  name: Body-only parameter discoverable solely from a validation error
  category: information-disclosure
  cwe: CWE-200
  owasp_2025: A05
  discovery_mechanism: schema-error
  reachable_by_other_means: false
  location: POST {basePath}/api/summarize, field `toneProfile`
  severity: low
  is_control: false
  paired_control: ctl-017
  occurred: planted
  verified_by: |
    POST {} -> HTTP 400 with Zod issues naming projectSlug, maxSentences and
    toneProfile. None of the three is a column on any table: 0 matches in
    information_schema.columns and 0 occurrences in the OpenAPI spec.
    An unrecognised toneProfile is reflected back in the response body.
  detection: POST an empty body and read the field names out of the error.
  notes: |
    The route exists for an authentic reason: summarising an update log is the
    one thing client-side supabase-js cannot do, because it calls an external
    model provider and that key must not be in the browser. It is the shape a
    Server Action / API route generator produces for this stack, which is what
    v0 and Bolt emit.
    Severity is low deliberately. The impact is reflection of an unknown tone
    name; the value of the entry is that the parameter is unreachable by any
    other means. info-001 cannot short-circuit it because OpenAPI has nothing to
    say about a request body field.
    The same route is also ctl-017, the second proxy false-positive control.

- id: authz-002
  name: Member directory exposes every account email to any registered user
  category: information-disclosure
  cwe: CWE-359
  owasp_2025: A01
  discovery_mechanism: authed-discovery
  reachable_by_other_means: false
  location: GET {basePath}/team
  severity: high
  is_control: false
  paired_control: null
  occurred: planted
  verified_by: |
    anonymous  GET /team -> 404
    with a session -> 200, listing 8 accounts with their email addresses and
    last sign-in times.
  detection: |
    Register or log in, then crawl WITH that session. An anonymous crawl finds
    nothing here at all.
  notes: |
    404, NOT A REDIRECT, AND THAT IS THE POINT. /dashboard and /settings redirect
    to /login when anonymous, which confirms they exist — a crawler learns the
    route is there and can come back with credentials. This route returns 404,
    so it is indistinguishable from a path that was never implemented. Only a
    grader that carries a session INTO THE CRAWL, rather than merely into its
    probes, ever sees it.
    The data is genuinely new. Email addresses live in auth.users and appear
    nowhere else in this fixture: public.profiles carries username, display name
    and bio only, and admin-001's export contains no emails (verified: 0
    occurrences). So this is not a restatement of another entry.

- id: authz-003
  name: Activity feed exposes account authentication history
  category: information-disclosure
  cwe: CWE-200
  owasp_2025: A01
  discovery_mechanism: authed-discovery
  reachable_by_other_means: false
  location: GET {basePath}/team/audit
  severity: medium
  is_control: false
  paired_control: null
  occurred: planted
  verified_by: |
    anonymous -> 404; with a session -> 200.
    Renders GoTrue audit events: sign-ins, signups and password-recovery
    requests, each keyed by the acting account's email. 10 email occurrences on
    the page in a freshly seeded stack.
    The backing function is granted to service_role only:
      anon POST /rest/v1/rpc/recent_auth_events -> 401
  detection: Carry a session into the crawl and read the feed.
  notes: |
    The second finding behind authed-discovery, as CLAUDE.md asks for. It
    reveals who is active, when, and which accounts have requested a password
    reset — useful for targeting before an attempt on auth-001, which has no
    rate limiting.
    NO IP ADDRESSES, DELIBERATELY. The first build of this route surfaced an
    ip_address column. auth.audit_log_entries.ip_address is empty in this
    configuration and the payload carries no remote_addr, so the column was
    always blank and the manifest claim would have been false. It was removed
    rather than left as an unbacked claim.
    The RPC is granted to service_role only so PostgREST cannot be a second path
    to the same data — a finding reachable two ways teaches half as much.

- id: xss-001
  name: Stored XSS via unescaped project description
  category: injection
  cwe: CWE-79
  owasp_2025: A03
  discovery_mechanism: static-crawl
  reachable_by_other_means: false
  location: GET {basePath}/p/{slug}/rich
  severity: high
  is_control: false
  paired_control: ctl-xss-001
  occurred: planted
  verified_by: |
    Full chain, end to end:
      1. anon PATCH /rest/v1/projects?slug=eq.nightjar with the anon key only,
         setting description to `pwn <img src=x onerror=alert(document.domain)>`
         -> HTTP 204 (this is rls-001; projects has no RLS)
      2. GET /p/nightjar/rich -> the payload is present in the served HTML
         unescaped: <img src=x onerror=alert(document.domain)>
      3. GET /p/nightjar/plain -> the same stored value arrives escaped:
         &lt;img src=x onerror=...
    Data restored after verification.
  detection: |
    Either inspect the seeded description, which contains an inert
    <span data-html-probe="1"> that renders as an element here and as literal
    text on the sibling route, or store a payload via the open write path and
    load this page.
  notes: |
    STORED, and the write path is already part of the fixture: because
    public.projects has no RLS, an ANONYMOUS caller can plant the payload and it
    then executes for every visitor. That chain — unauthenticated write into a
    rendered sink — is the realistic shape on this stack.
    The seeded inert span exists so the sink is observable by inspection alone,
    without a grader having to write first. Exploitation still requires the
    write.

################################################################
# AUTH-FAILURE TAXONOMY
#
# Registration is where graders fail in the field, and until now this fixture
# always registered successfully — so none of the real failure modes reproduced
# and no grader's handling of them could be verified. These reproduce the
# measured taxonomy from 120 hackathon apps, with the observed frequencies.
#
# Selected with ./signup.sh <mode>. Canonical is `normal`.
#
# THE TWO CONTROLS CARRY AS MUCH WEIGHT AS THE DEFECTS. Without them there is no
# way to separate "the grader is broken" from "this target is legitimately
# untestable", which is the distinction that is expensive to get wrong.
################################################################

- id: signup-001
  name: Registration reachable only via a client-side interaction
  category: auth-reachability
  cwe: CWE-1110
  discovery_mechanism: interaction
  reachable_by_other_means: false
  location: "{basePath}/ — the \"Get started\" button"
  is_control: false
  occurred: planted
  modes:
    signup: [interaction]
  verified_by: |
    27.5% of the measured corpus.
      GET /app/signup                      -> 404
      the string "signup" in served HTML   -> 0 occurrences
      homepage without clicking            -> 0 forms, 0 requests to /auth/v1/*
      homepage after clicking "Get started"-> form appears, registration
                                              completes, session granted
  notes: |
    There is no conventional route and no link. The button says "Get started",
    not "Sign up" — in the field these are labelled "Try it", "Join the beta",
    and matching on the word would find this far too easily.

- id: signup-002
  name: Submit blocked by an unlabelled required input — no request is sent
  category: auth-reachability
  cwe: CWE-1110
  discovery_mechanism: static-crawl
  reachable_by_other_means: false
  location: "{basePath}/signup"
  is_control: false
  occurred: planted
  modes:
    signup: [unlabeled]
  verified_by: |
    26.7% of the measured corpus. Filling username, email and password by
    accessible name and submitting produced **0 requests to /auth/v1/***, and
    the page stayed on /signup.
  notes: |
    One required input carries no name, no id, no placeholder and no
    aria-label, and its caption is a sibling element with no `htmlFor`. A
    filler that locates fields by accessible name cannot see it, leaves it
    empty, and HTML5 validation blocks submit before dispatch. The failure is
    silent on both sides: no error to the user, no request on the wire.

- id: signup-003
  name: Login-only homepage with registration linked from nowhere
  category: auth-reachability
  cwe: CWE-1110
  discovery_mechanism: suffix-convention
  reachable_by_other_means: false
  location: "{basePath}/ is a login form; {basePath}/signup is unlinked"
  is_control: false
  occurred: planted
  modes:
    signup: [login-only]
  verified_by: |
    Homepage renders one form and it is LOGIN. `href="/app/signup"` appears 0
    times in the served HTML, while GET /app/signup still returns 200.
  notes: |
    A grader that fills the first form it finds submits credentials to login
    and never walks to the registration route. Reaching it requires guessing
    the conventional /signup path rather than following a link.

################################################################
# UI-STATE HONESTY — Pass B
#
# Intent-independent and invisible to security scanners: none of these is a
# vulnerability. Each has a control that is the SAME component with the one
# wrong behaviour corrected and nothing else changed, so a differential picks
# up the behaviour and not incidental differences.
#
# READ THIS BEFORE JUDGING THE FIXTURE'S REALISM: staleness after a write does
# NOT occur naturally on this stack. Next 15 treats dynamic routes as
# immediately stale and refetches them on client-side navigation, so the audit
# of the generated app found writes propagating correctly everywhere — that
# result is recorded as ctl-007. Presenting the defect at all required
# CONSTRUCTING it, by deliberately defeating the framework. Anyone reading this
# fixture should know that "Next 15 closes this by default" is the reason these
# entries look artificial: they are.
################################################################

- id: ui-002
  name: Create succeeds but the list never updates
  category: ui-state-honesty
  cwe: CWE-1188
  discovery_mechanism: interaction
  reachable_by_other_means: false
  location: "{basePath}/qa/stale"
  severity: medium
  is_control: false
  paired_control: ctl-qa-001
  occurred: planted
  claim_type: structural
  verified_by: |
    POST to the shared items endpoint succeeds and the row is recorded; the
    rendered list still shows the original three entries until a manual reload.
    The control at /qa/fresh uses the same component and the same endpoint and
    updates immediately.
  detection: |
    Drive a browser: add an item, then read the list without reloading.
  notes: |
    Constructed, not natural — see the block header. The list is held in client
    state seeded once, and `router.refresh()` is omitted on purpose. The write
    genuinely lands, which is what makes this dishonest rather than broken.
    SHIPPED BROKEN ONCE, AND THE CONTROL WITH IT. The page originally passed a
    hardcoded array into the component instead of reading the store, so no
    render ever reflected a write — a manual reload did not update the list
    either, and /qa/stale and /qa/fresh were indistinguishable. ctl-qa-001
    claimed "create invalidates and the list updates" and it never did.
    verify.sh could not see any of it, because the whole behaviour is
    client-side and nothing about it appears in a response body. That gap is
    now closed by infra/ui-check.mjs, which asserts the defect and its control
    behave DIFFERENTLY — asserting only the defect would have passed on the
    broken build too, since both halves were equally broken.

- id: ui-003
  name: Save reports success when the request returned 500
  category: ui-state-honesty
  cwe: CWE-393
  discovery_mechanism: interaction
  reachable_by_other_means: false
  location: "{basePath}/qa/silent-save"
  severity: medium
  is_control: false
  paired_control: ctl-qa-002
  occurred: planted
  claim_type: structural
  verified_by: |
    POST {basePath}/api/qa/save -> HTTP 500 every time, for the defect and the
    control alike. /qa/silent-save renders "Saved"; /qa/honest-save renders the
    error and says nothing was saved.
  detection: Click Save and compare the UI against the network response.
  notes: |
    The component never inspects the response, which is exactly what
    `await fetch(...)` with no check produces. Note the endpoint is SHARED with
    the control, so a probe keyed on "an endpoint returned 500" fires on both
    and is wrong about one — the 500 is identical, the honesty is not.

- id: ui-004
  name: Deep link renders an empty shell
  category: ui-state-honesty
  cwe: CWE-1188
  discovery_mechanism: interaction
  reachable_by_other_means: false
  location: "{basePath}/qa/deep-link"
  severity: medium
  is_control: false
  paired_control: ctl-qa-003
  occurred: planted
  claim_type: structural
  verified_by: |
    Cold GET of /qa/deep-link returns markup containing
    `<div id="deep-link-content"></div>` and it is never populated. The control
    at /qa/deep-link-ok fetches on mount and renders rows on a cold load.
  detection: |
    Request the URL directly rather than navigating to it in-app, then check
    whether the content container ever fills.
  notes: |
    The classic SPA deep-link defect. A crawler that follows an in-app link sees
    content; one that requests the URL cold sees a shell — so two crawlers can
    disagree about whether this page has any content at all.

- id: ui-005
  name: Browser back does not return to the previous view
  category: ui-state-honesty
  cwe: CWE-1021
  discovery_mechanism: interaction
  reachable_by_other_means: false
  location: "{basePath}/qa/back-trap"
  severity: low
  is_control: false
  paired_control: ctl-qa-004
  occurred: planted
  claim_type: structural
  verified_by: |
    The page pushes a duplicate history entry on mount and re-pushes it on every
    popstate, so Back never leaves. /qa/back-ok is the same page without the
    trap.
  detection: Drive a real browser, navigate in, press Back.
  notes: |
    Usually arrives in real code via a well-meant "are you sure you want to
    leave?" guard. No HTTP probe and no static analysis can see it; this one
    genuinely requires driving a browser.

- id: ui-006
  name: Served HTML references a JS chunk that 404s
  category: ui-state-honesty
  cwe: CWE-1104
  discovery_mechanism: static-crawl
  reachable_by_other_means: false
  location: "{basePath}/qa/dead-chunk"
  severity: medium
  is_control: false
  paired_control: ctl-qa-005
  occurred: planted
  claim_type: structural
  verified_by: |
    The page markup references /_next/static/chunks/analytics.7f3a91c4.js,
    which returns 404. The control at /qa/live-chunk references
    /qa/present.js, which returns 200.
  detection: |
    Parse the served HTML for script sources and request each one.
  notes: |
    What a stale deploy or a mis-ordered cache-bust leaves behind. The only
    entry in this group reachable without driving a browser.

################################################################
# PERFORMANCE — Pass B
#
# Two claim types, and the distinction is load-bearing.
#
#   structural    A deterministic property of the response or the markup:
#                 compressed or not, validator present or not, request count,
#                 byte count. Ground truth here is as unambiguous as "RLS is
#                 off", and holds on any machine.
#   timing-floor  A floor GUARANTEED BY CONSTRUCTION, never a measured value.
#                 "LCP is 4.2s" cannot be ground truth because it depends on
#                 the environment. "TTFB is at least 3s" can, because a
#                 server-side sleep makes it true everywhere.
#
# The whole group is gated behind PERF_MODE and isolated under /perf/*, so a
# three-second sleep never lands in the main flow where it would slow the
# crawler, trip timeouts, or gate off the security and QA probes.
################################################################

- id: perf-001
  name: Text response served without compression
  category: performance
  cwe: CWE-405
  discovery_mechanism: static-crawl
  reachable_by_other_means: false
  location: GET {basePath}/api/perf/uncompressed
  severity: medium
  is_control: false
  paired_control: ctl-perf-001
  occurred: planted
  claim_type: structural
  modes:
    perf: [on]
  verified_by: |
    With Accept-Encoding: gzip -> Content-Encoding: identity, 124879 bytes on
    the wire. The control serves a byte-identical body gzipped to 5206 bytes.
  detection: Request with Accept-Encoding: gzip and read Content-Encoding.
  notes: |
    HONEST SCOPE. Next compresses page responses but does NOT compress route
    handler responses in this configuration, so other /api/* routes are also
    uncompressed — they just return small JSON where it matters little. This
    entry is about a large, highly compressible text payload. The control had to
    gzip explicitly in the handler for the same reason; relying on the framework
    produced a "compression control" that was itself uncompressed, which is a
    broken control and was caught by verify.sh.

- id: perf-002
  name: Cacheable asset served with no validator and no cache headers
  category: performance
  cwe: CWE-405
  discovery_mechanism: static-crawl
  reachable_by_other_means: false
  location: GET {basePath}/api/perf/no-validator
  severity: medium
  is_control: false
  paired_control: ctl-perf-002
  occurred: planted
  claim_type: structural
  modes:
    perf: [on]
  verified_by: |
    Response carries zero of Cache-Control, ETag, Last-Modified. The control
    serves the identical body with an ETag and
    `Cache-Control: public, max-age=31536000, immutable`, and answers
    If-None-Match with 304.
  detection: Read the response headers; try a conditional request.
  notes: The body never changes, so every re-fetch is pure waste.

- id: perf-003
  name: Excessive resource requests on the critical path
  category: performance
  cwe: CWE-405
  discovery_mechanism: static-crawl
  reachable_by_other_means: false
  location: "{basePath}/perf/requests"
  severity: medium
  is_control: false
  paired_control: ctl-perf-003
  occurred: planted
  claim_type: structural
  modes:
    perf: [on]
  verified_by: |
    60 distinct `dot.png?v=N` URLs in the served markup, all pointing at one
    68-byte image, each cache-busted so none can be reused.
  detection: Count resource URLs in the served HTML.
  notes: |
    Count the DISTINCT query values, not raw string occurrences: the RSC flight
    payload repeats each src, so a naive grep reports roughly 168.

- id: perf-004
  name: Oversized image on the critical path
  category: performance
  cwe: CWE-405
  discovery_mechanism: static-crawl
  reachable_by_other_means: false
  location: "{basePath}/perf/image"
  severity: high
  is_control: false
  paired_control: ctl-perf-003
  occurred: planted
  claim_type: structural
  modes:
    perf: [on]
  verified_by: |
    /perf/hero-oversized.png is 4201703 bytes, rendered above the fold at
    320px wide, eagerly loaded, with no responsive sources.
  detection: Fetch the image referenced above the fold and measure it.
  notes: |
    Incompressible by construction (random pixel data), so the byte count is
    stable regardless of transport.

- id: perf-005
  name: TTFB exceeds 3s by construction
  category: performance
  cwe: CWE-405
  discovery_mechanism: static-crawl
  reachable_by_other_means: false
  location: "{basePath}/perf/slow"
  severity: high
  is_control: false
  paired_control: ctl-perf-003
  occurred: planted
  claim_type: timing-floor
  modes:
    perf: [on]
  verified_by: |
    Server sleeps 3000ms before rendering. Measured 3.03s here, but the CLAIM
    is the floor, not that number.
  detection: Measure time to first byte. It cannot be under three seconds.
  notes: |
    THIS ENTRY ASSERTS A FLOOR, NOT A VALUE, and that is the general rule for
    every timing claim in this fixture. A measured latency is a property of the
    machine, the container runtime and the current load, so it cannot be ground
    truth. A construction-guaranteed floor can be, because it holds anywhere.

- id: auth-001
  name: No rate limiting on the password grant — unlimited credential stuffing
  category: broken-authentication
  cwe: CWE-307
  owasp_2025: A07
  discovery_mechanism: static-crawl
  reachable_by_other_means: true          # also directly via baas-direct
  location: POST /auth/v1/token?grant_type=password
  severity: high
  is_control: false
  paired_control: ctl-014
  occurred: naturally
  verified_by: |
    45 consecutive failed logins (25 against nonexistent accounts, 20 with
    wrong passwords against a real one): every response 400, zero 429s, no
    backoff, no lockout. The account authenticated normally immediately after.
    Re-checked in verify.sh with a 25-attempt burst.
  detection: |
    POST wrong credentials repeatedly to the token endpoint and count 429s.
    There are none. The login form at {basePath}/login posts here.
  notes: |
    FOUND AFTER THE PLANTING PASS, BY THE USER, NOT BY DESIGN. This is the
    first behaviour the manifest did not describe, and it is recorded as a
    natural omission rather than a plant: self-hosted GoTrue does not
    rate-limit the password grant by default, while hosted Supabase does. The
    stack simply inherited the default and nobody decided otherwise.
    It is genuinely reachable two ways — by crawling to the login form, or by
    hitting the Supabase auth API directly — so unlike most entries here it is
    not gated behind a single mechanism. Left that way because narrowing it
    would mean breaking the login form, which is not worth it.

- id: auth-002
  name: Weak password policy — six characters, no complexity, no breach check
  category: broken-authentication
  cwe: CWE-521
  owasp_2025: A07
  discovery_mechanism: static-crawl
  reachable_by_other_means: true
  location: POST /auth/v1/signup, and {basePath}/signup
  severity: low
  is_control: false
  paired_control: null
  occurred: naturally
  verified_by: |
    signup with password "aaaaaa" -> HTTP 200, account created
    signup with password "a"      -> HTTP 422 (minimum length 6 enforced)
    So the only rule is length >= 6. No complexity requirement, no dictionary
    or breach check, and a single repeated character is accepted.
  detection: Register with "aaaaaa" through {basePath}/signup or the auth API.
  notes: |
    GoTrue default. Compounds auth-001: unlimited guessing against passwords
    with roughly no entropy floor. Recorded separately because a grader may
    detect one and not the other.
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
  name: Config paths are NOT served at the origin root
  category: not-a-finding
  discovery_mechanism: path-probe
  is_control: true
  verified_by: |
    GET http://localhost:8090/.env         -> 404
    GET http://localhost:8090/.git/config  -> 404
    GET http://localhost:8090/app/package.json -> 404 (genuinely absent)
    The first two return 200 under /app/ — see probe-001 and probe-002.
  why_flagging_this_is_wrong: |
    REVISED IN THE PLANTING PASS. This entry previously stated that nothing was
    served at either prefix. That is no longer true, and the change is the
    whole point of the subpath design.
    A grader that probes only the origin root and reports "no exposed config
    files" is not producing a true negative. It is producing a FALSE NEGATIVE
    against probe-001, a critical leak that includes the JWT signing secret.
    The origin root really is clean; the app root is not. Reporting clean is
    only correct if the app root was probed too.
    This is the sharpest instrumentation in the repository precisely because
    the failure is silent: the probe gets a 404, the grader reports success,
    and nothing in the output hints that the wrong prefix was tested. Compare
    against the root-served variant on :8091 to confirm the diagnosis.

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

- id: ctl-014
  name: Other auth endpoints ARE rate limited
  category: not-a-finding
  discovery_mechanism: baas-direct
  location: POST /auth/v1/recover and /auth/v1/otp
  is_control: true
  occurred: naturally
  verified_by: |
    /auth/v1/recover, 12 rapid calls -> 200 then 429 for every subsequent one
    /auth/v1/otp,      8 rapid calls -> 200 then 429 for every subsequent one
    Signup still returned 200 afterwards, so the limiter is scoped to the
    email-sending endpoints and does not spill onto registration.
  why_flagging_this_is_wrong: |
    Direct pair for auth-001, and a naturally occurring one — nothing here was
    configured for the fixture.
    A grader that concludes "this API has no rate limiting" from the login
    endpoint alone is wrong: two endpoints on the same service, same host,
    same port are limited aggressively, tripping after a single request. The
    correct finding is per-endpoint ("the password grant is unlimited"), not
    per-service ("auth is unlimited"). A report phrased the second way is
    overclaiming and this control is what catches it.

- id: ctl-016
  name: "RLS dial at correct: bookmarks is owner-scoped on all four verbs"
  category: not-a-finding
  discovery_mechanism: baas-direct
  location: table `public.bookmarks`
  is_control: true
  occurred: planted
  modes:
    rls: [correct]
  verified_by: |
    RLS on, four policies, each `auth.uid() = user_id`.
      anon SELECT -> 0 rows
      ada  SELECT -> exactly her own 2 rows
    Table definition, column list and seed rows byte-identical to `off` and
    `permissive`.
  why_flagging_this_is_wrong: |
    Direct pair for dial-rls-001, and the reason the dial is one table rather
    than three. Everything a detector could key on other than the policy — the
    name, the columns, the row contents, the route that reads it — is unchanged
    from the broken modes. A finding reported against public.bookmarks here is
    a false positive with no confounder to hide behind.
    CAUTION, AND THIS IS THE INTERESTING PART: dial-disc-001 still leaks these
    exact rows in this mode, through {basePath}/api/bookmarks/all, because that
    route holds a service-role client and checks no session. So "the database is
    correctly scoped" and "the data is protected" come apart here. A grader
    should report the app-layer route and NOT the table. Reporting the table is
    a false positive; reporting neither is a miss.

- id: ctl-017
  name: Summarize route proxies an external provider with no database in the path
  category: not-a-finding
  discovery_mechanism: schema-error
  location: POST {basePath}/api/summarize
  is_control: true
  occurred: planted
  verified_by: |
    Random latency 0.18-4.1s, intermittent 500 (`connect ETIMEDOUT: model
    provider did not respond in time`) and 429 with Retry-After, and the parsed
    request echoed back in every response.
    Source contains no supabase import and no database call of any kind.
  why_flagging_this_is_wrong: |
    Second permanent proxy control, alongside ctl-012, and placed here on
    purpose: this route is also where the schema-error finding lives, so a
    grader that discovers sum-001 is immediately holding an endpoint that looks
    injectable and is not.
    It trips all three classic oracles at once — multi-second variable latency,
    intermittent upstream error strings, and full payload reflection — with no
    interpreter and no database anywhere behind it. Any injection reported here
    is a false positive.

- id: ctl-xss-001
  name: Sibling route renders the same stored field escaped
  category: not-a-finding
  discovery_mechanism: static-crawl
  location: GET {basePath}/p/{slug}/plain
  is_control: true
  occurred: planted
  verified_by: |
    With a live payload stored in the row, /rich served
    `<img src=x onerror=alert(document.domain)>` raw while /plain served
    `&lt;img src=x onerror=...`. Same row, same column, same request.
  why_flagging_this_is_wrong: |
    Direct pair for xss-001, and the strictest kind: the CONTENT is identical
    because both routes read the same stored field from the same row. Only the
    sink differs — dangerouslySetInnerHTML on one, JSX interpolation on the
    other. A grader reporting XSS here has flagged the presence of
    attacker-controlled content rather than an injection.
    See also ctl-008, which was NARROWED when this pair was planted: the main
    application pages still escape correctly, and reporting XSS against the feed
    or the standard project page is still a false positive.

- id: ctl-cookie-001
  name: Secure and non-Secure cookie pair (client diagnostic)
  category: not-a-finding
  discovery_mechanism: authed-discovery
  location: POST {basePath}/api/session/secure-flag and /plain-flag, read at /echo
  is_control: true
  occurred: planted
  verified_by: |
    /secure-flag sets `bl_secure` WITH the Secure attribute; /plain-flag sets
    `bl_plain` without it. /echo reports which of the two came back.
  why_flagging_this_is_wrong: |
    A DIAGNOSTIC, NOT A VULNERABILITY, and it measures the CLIENT rather than
    the target. CLAUDE.md asks for it because a Secure cookie stored but never
    transmitted over http is a real grader bug that otherwise presents as the
    target's fault.
    Over plain http the correct browser-equivalent result is bl_plain present
    and bl_secure absent. A client returning BOTH transmits Secure cookies over
    an insecure channel. A client returning NEITHER is dropping cookies
    entirely, which invalidates every authed-discovery result it produces —
    worth knowing before trusting a score.
    The absent Secure attribute on the real session cookie is already recorded
    as cookie-001, and it is REQUIRED for this fixture to work over http, so
    reporting these two endpoints as a finding is wrong.

- id: ctl-signup-001
  name: Registration succeeds but grants no session (email confirmation)
  category: not-a-finding
  discovery_mechanism: static-crawl
  location: "{basePath}/signup"
  is_control: true
  occurred: planted
  modes:
    signup: [confirm]
  verified_by: |
    15.0% of the measured corpus. 1 request to /auth/v1/signup, HTTP 200, the
    account IS created, no session is returned, and the UI renders
    "Account created. Check your email to confirm before signing in."
  why_flagging_this_is_wrong: |
    Registration worked. The deployment requires email confirmation, so no
    session is issued and everything behind authentication is CORRECTLY
    unreachable. The right report is N/A for every authed check, not a
    registration failure and not a crawler defect.
    This control exists to separate "our crawler is broken" from "this target
    is legitimately untestable". Without it those two look identical, and
    guessing wrong in either direction is expensive.

- id: ctl-signup-002
  name: "SSO-only: self-registration is not offered"
  category: not-a-finding
  discovery_mechanism: static-crawl
  location: "{basePath}/signup"
  is_control: true
  occurred: planted
  modes:
    signup: [sso]
  verified_by: |
    7.5% of the measured corpus. No registration form is rendered (0 forms on
    the page), and the API refuses outright:
      POST /auth/v1/signup -> 422 {"error_code":"signup_disabled"}
  why_flagging_this_is_wrong: |
    There is no account to create, by design. Correctly untestable in exactly
    the same way as ctl-signup-001, and reporting a registration defect here is
    a false positive.

- id: ctl-qa-001
  name: Create invalidates and the list updates
  category: not-a-finding
  discovery_mechanism: interaction
  location: "{basePath}/qa/fresh"
  is_control: true
  occurred: planted
  verified_by: Same component and endpoint as ui-002 with router.refresh() restored; the new item appears without a reload.
  why_flagging_this_is_wrong: |
    Minimal diff from the defect: one call restored, nothing else changed, so a
    differential attributes the delta to invalidation and nothing else.

- id: ctl-qa-002
  name: Failed save is surfaced to the user
  category: not-a-finding
  discovery_mechanism: interaction
  location: "{basePath}/qa/honest-save"
  is_control: true
  occurred: planted
  verified_by: Posts to the SAME always-500 endpoint as ui-003 and renders the failure.
  why_flagging_this_is_wrong: |
    THE SHARPEST CONTROL IN THIS GROUP. The network behaviour is identical to
    the defect — same endpoint, same 500, same payload. Only the UI's honesty
    differs. A probe keyed on "a request failed" fires on both and is wrong
    about this one; the finding is that the interface lies, not that the
    request failed.

- id: ctl-qa-003
  name: Deep link renders content on a cold load
  category: not-a-finding
  discovery_mechanism: interaction
  location: "{basePath}/qa/deep-link-ok"
  is_control: true
  occurred: planted
  verified_by: Same component as ui-004 fetching on mount; a direct GET renders rows.
  why_flagging_this_is_wrong: Content arrives without an in-app navigation, which is the correct behaviour.

- id: ctl-qa-004
  name: Browser back behaves normally
  category: not-a-finding
  discovery_mechanism: interaction
  location: "{basePath}/qa/back-ok"
  is_control: true
  occurred: planted
  verified_by: Same page as ui-005 without the history re-push.
  why_flagging_this_is_wrong: Back returns to the previous view.

- id: ctl-qa-005
  name: Referenced script resolves
  category: not-a-finding
  discovery_mechanism: static-crawl
  location: "{basePath}/qa/live-chunk"
  is_control: true
  occurred: planted
  verified_by: Same markup shape as ui-006; {basePath}/qa/present.js returns 200.
  why_flagging_this_is_wrong: |
    A probe that flags any page carrying an async script tag, rather than
    checking whether the script resolves, fires here wrongly.

- id: ctl-perf-001
  name: Comparable text response IS compressed
  category: not-a-finding
  discovery_mechanism: static-crawl
  location: GET {basePath}/api/perf/fast
  is_control: true
  occurred: planted
  modes:
    perf: [on]
  verified_by: |
    Byte-identical body to perf-001 (124879 bytes uncompressed), served
    Content-Encoding: gzip at 5206 bytes on the wire, with Vary: Accept-Encoding.
  why_flagging_this_is_wrong: |
    Same size, same content, same route group as the uncompressed one — so
    compression is the only variable between them.

- id: ctl-perf-002
  name: Cacheable asset has a validator and an immutable max-age
  category: not-a-finding
  discovery_mechanism: static-crawl
  location: GET {basePath}/api/perf/fast
  is_control: true
  occurred: planted
  modes:
    perf: [on]
  verified_by: |
    ETag present, `Cache-Control: public, max-age=31536000, immutable`, and a
    conditional request with If-None-Match returns 304.
  why_flagging_this_is_wrong: Correct on every caching axis perf-002 gets wrong.

- id: ctl-perf-003
  name: A page that is fast, light and cached
  category: not-a-finding
  discovery_mechanism: static-crawl
  location: "{basePath}/perf/fast"
  is_control: true
  occurred: planted
  modes:
    perf: [on]
  verified_by: |
    No blocking work, two small requests, cached asset. TTFB measured at 0.06s
    against the 3.03s of perf-005 in the same route group.
  why_flagging_this_is_wrong: |
    THE SINGLE MOST VALUABLE ENTRY IN THE PERFORMANCE SET, and the reason to
    build the perf group at all.
    It sits in the SAME route group as four deliberate defects, so a probe
    cannot pass by treating /perf/* as uniformly slow — it has to discriminate
    within the group.
    Web-vitals scoring carries substantial penalty weight and has had no
    external precision evidence of any kind. Findings alone cannot supply that:
    a probe that fires on everything scores perfectly on findings and is
    useless. Only a correct-by-construction route that must stay silent
    measures precision, so this control, not the defects beside it, is what
    closes that exposure. Any performance finding reported here is a false
    positive.

- id: ctl-015
  name: Login errors do not permit account enumeration
  category: not-a-finding
  discovery_mechanism: static-crawl
  location: POST /auth/v1/token?grant_type=password
  is_control: true
  occurred: naturally
  verified_by: |
    real account + wrong password -> {"code":400,"error_code":"invalid_credentials",
                                      "msg":"Invalid login credentials"}
    nonexistent account           -> byte-identical response
    Compared as whole response bodies, not just status codes.
  why_flagging_this_is_wrong: |
    The responses are identical, so the endpoint leaks nothing about which
    accounts exist. This sits directly beside auth-001 on the same endpoint:
    that endpoint has a real authentication weakness and a correctly handled
    one at the same time. A grader that reports "user enumeration via login"
    because it found a login weakness at all has pattern-matched on the
    endpoint rather than tested the behaviour.
    Note profiles ARE a public directory by design (ctl-002), so usernames are
    enumerable there — but that is a deliberate product feature exposing no
    email addresses, and it is not this.
```

---

## Discovery coverage

Findings only; controls excluded.

| Mechanism | Findings requiring it | Reachable by **no** other path |
|---|---|---|
| `baas-direct` | 8 — rls-001, rls-002, rls-003, rls-004, storage-001, info-001, info-002, hdr-003 | 7 |
| `bundle-mining` | 5 — key-001, key-002, admin-001, llm-001, llm-002 | 5 |
| `static-crawl` | 4 — hdr-001, hdr-002, auth-001, auth-002 | 2 |
| `authed-discovery` | 2 — authz-001, cookie-001 | 1 |
| `path-probe` | 2 — probe-001, probe-002 | 2 |
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
| **requires probing relative to the app root, not the origin** | probe-001, probe-002 |

A grader that never registers misses four findings including a critical one.
A grader that resolves path guesses against the origin misses two more,
including probe-001, which leaks the JWT signing secret. `path-probe` is a
mechanism added during the planting pass; CLAUDE.md's table does not name it,
but the capability it tests — resolving candidate paths against the app root —
is exactly what the third design rule exists to measure.

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
parameter, the `suffix-convention` injection, the decoy-secret control set, the
proxy-route control, `GET {basePath}/__manifest`, the root-served comparison
variant, and the `path-probe` pair that finally makes the subpath design
measurable.

**Still outstanding:**

- `interaction`: a route that exists only after a client-side click, present in
  no server-rendered markup and in no bundle string. The `interaction` column
  currently rests on ui-001 alone.
- `authed-discovery`: routes that 404 when anonymous rather than redirecting;
  the `Secure` vs non-`Secure` cookie pair that exposes the plain-HTTP session
  bug. CLAUDE.md asks for a real finding behind at least two such routes.
- an endpoint that reflects stored input unescaped, beside a sibling that
  escapes correctly. No XSS sink exists at all right now (ctl-008).
- remaining UI-state-honesty fixtures: client-side route rendering an empty
  shell on direct load, history hijack, served HTML referencing a 404ing chunk.
  Note ctl-007: the "write succeeds, UI does not update" case must be planted
  deliberately, because Next 15 refetches dynamic routes and it will not occur.
- remaining hygiene floor: soft 404s, mixed content, and a second route group
  with headers configured correctly to pair against hdr-001.
