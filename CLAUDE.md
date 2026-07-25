# CLAUDE.md

## What this repo is

A **deliberately vulnerable Next.js + Supabase application**, built to look like a 24-hour hackathon submission, for benchmarking automated web app graders.

It exists because nothing else covers this shape. GapBench scenarios are emulated and have no registerable account or database, so stateful checks gate off. OopsSec Store is a real app with real sessions but runs its own Prisma backend. DVWA is PHP and MySQL. **None of them have PostgREST, Row Level Security, or a public anon key**, which is the architecture a large share of modern hackathon submissions actually use.

**Everything here is intentionally broken. That is the point.** Do not fix a defect you encounter. Check `MANIFEST.md` first. If it is documented there, it is deliberate.

---

## The most important design rule: this is a discovery obstacle course

Read this section before writing any code. It is what makes this repo different from every other vulnerable app, and getting it wrong makes the repo nearly worthless.

Benchmarking against real graders has shown that **detection is not the bottleneck. Discovery is.** Hand a probe an endpoint and the probe works correctly. The grader never finds the endpoint. So a fixture that puts obvious vulnerabilities on obvious routes teaches nothing, because the probes find them and the only thing learned is that a detector already known to work still works.

So **every finding in this repo sits behind a specific, deliberately chosen discovery path.** The vulnerability itself is almost incidental. What is being tested is whether the grader can reach it.

Each finding is tagged in the manifest with the **discovery mechanism required**:

| Mechanism | What the grader must be able to do |
|---|---|
| `static-crawl` | Follow links in served HTML. The baseline. |
| `bundle-mining` | Extract endpoint strings from the compiled JS bundle. The route is linked from nowhere. |
| `interaction` | Click something. The route exists only after a client-side state change and appears in no static markup. |
| `schema-error` | POST an empty body and read the field names out of the validation error. Zod is near-universal on this stack, and `{}` returns `details:[{path:"email"},{path:"title"}]`. |
| `authed-discovery` | Carry an authenticated session **into the crawl**, not just into the probes. The route 404s or redirects when anonymous. |
| `suffix-convention` | Guess `/search` and `/{id}` off a discovered collection. Paths built by string concatenation never appear as literals in the bundle. |
| `baas-direct` | Query PostgREST directly with the anon key, bypassing the app entirely. |

**Design requirement:** every mechanism above gates at least one finding reachable by no other path. When a grader misses that finding, the manifest says exactly which reach capability is broken. That turns a recall number into a diagnosis.

A finding reachable through two mechanisms teaches half as much. Prefer exactly one.

---

## Second design rule: paired controls

**Every vulnerability ships with a correct counterpart that must not fire.**

An all-broken target proves probes fire and says nothing about whether they stay quiet. Precision is only measurable against clean code that looks suspicious.

| Vulnerable | Control that must stay quiet |
|---|---|
| Table with RLS never enabled | Table with owner-scoped policy `using (auth.uid() = user_id)` |
| RLS on, policy `using (auth.role() = 'authenticated')` | Same table, owner-scoped |
| Service role key in the client bundle | **Anon key in the client bundle (public by design)** |
| `NEXT_PUBLIC_FAKE_OPENAI_KEY` (`sk-proj-` shape) | Supabase anon key, Stripe `pk_test_`, assistant ID `asst_`, Vercel `prj_` and `dpl_` |
| Endpoint reflecting stored input unescaped | Sibling endpoint escaping correctly |
| — | Proxy route with no DB in the path (see below) |

**The anon key beside the service role key is the single most important test in this repo.** Both are JWTs beginning `eyJ`. Only the decoded `role` claim distinguishes them. A grader that reports the anon key as a leaked secret has a false positive that would be humiliating in front of an organizer.

**The proxy route is the second most important.** An `/api/*` route forwarding to an external service, or a stub emulating one, returning intermittent 500s, 429s, and multi-second latency, with no database anywhere in the path. Injection oracles keying on timing, error strings, or payload reflection fire on it incorrectly. This is a known false-positive class and it needs a permanent fixture.

---

## Third design rule: serve under a subpath

Serve the app at `/app/` or a project-style path, **not at the origin root.**

Reference apps conventionally serve at `/`, which means path-guessing probes that wrongly resolve `/.env` and `/.git/config` against the origin instead of the app root pass every test and report clean. That bug is invisible to any fixture served at root, and it applies to every `user.github.io/project/` deployment in the wild.

Provide a root-served variant as a second target for comparison, but **the primary target is subpath-served.**

---

## How to build it: generate first, then audit, then plant

Do not hand-author the app. Generate it the way a hackathon team would.

**Step 1. Prompt a scaffolder for a plausible submission.** Next.js App Router, Supabase for auth and data, two or three tables, a couple of features. Something a team would build in 24 hours. Do not ask for vulnerabilities.

**Step 2. Hand audit what came out.** The generated app will arrive with characteristic defects already present: tables created via SQL migration, which does not auto-enable RLS the way the dashboard path does, plus `NEXT_PUBLIC_` inlining, missing security headers, no error branches, no state invalidation after writes.

**This audit step is the labeling and it cannot be automated.** Ground truth is what was verified by hand, not what was requested.

**Step 3. Plant only what did not occur naturally.** A generator will not produce the permissive RLS policy case, because it typically writes no policy rather than a bad one. It will not produce any of the paired controls. It will not produce the discovery obstacles.

Everything else stays authentic generated output, because authentic generated output is what a grader meets in the field.

---

## Vulnerability classes, organized by discovery mechanism

### `baas-direct` — the flagship class

Reachable with the anon key alone, bypassing the app. No account needed.

- **`rls_off`** — table created via migration, RLS never enabled, world-readable through PostgREST
- **`rls_permissive`** — RLS on, `using (auth.role() = 'authenticated')`, any logged-in user reads every row
- **`rls_write_gap`** — SELECT correctly scoped, INSERT and UPDATE and DELETE unpoliced. Tests whether the grader checks all four verbs.
- **`storage_public_bucket`** — a bucket marked public that should not be
- **Controls:** `rls_correct`, a correctly private bucket

### `bundle-mining`

- **`service_role_in_bundle`** — the catastrophic one, alongside the anon key control
- **`unlinked_admin_route`** — `/api/admin/*` present in the compiled JS, linked from nothing
- **`system_prompt_in_bundle`** — a client-side LLM call with the full prompt as a string literal. Minifiers rename variables and preserve string literals, so it arrives in plain English.
- **`synthetic_pii_in_prompt`** — the same prompt interpolating obviously fake personal data, marked synthetic in source and in the data itself

### `schema-error`

- An endpoint whose injectable parameter name is **discoverable only** by POSTing `{}` and reading the Zod validation error. Not in the bundle, not in any link.

### `authed-discovery`

- Routes that 404 or redirect when anonymous and are crawlable only with a session. Put a real finding behind at least two of them.
- Self-registration must work over plain HTTP. A `Secure` cookie stored but never transmitted over http is a real grader bug, so include one endpoint setting `Secure` and one that does not, to expose it.

### `suffix-convention`

- A collection at `/api/products` with the actual SQL injection at `/api/products/search?q=`. The suffix path appears nowhere as a literal. Build it by string concatenation.

### `interaction`

- A route existing only after a client-side click, present in no server-rendered markup and in no bundle string.

### `static-crawl` — the baseline

- Ordinary findings on ordinary routes, so the baseline is measurable and total failure is distinguishable from reach failure.

### UI-state honesty (no existing benchmark covers this)

All intent-independent, all invisible to security scanners. Each with a correct control.

- write succeeds, UI does not update until manual refresh
- user-initiated save fails, no error shown
- client-side route loaded directly renders only the empty shell
- router hijacks history, browser back does not return to the prior view
- served HTML references a JS chunk that 404s

### Hygiene floor

Two route groups, one with nothing configured and one correct. Missing headers, `x-powered-by`, source maps in production, SPA soft 404s, verbose error responses, permissive CORS with credentials, mixed content.

---

## Explicitly out of scope

**Model persuasion and prompt injection.** Do not build challenges around talking an LLM out of its instructions. That is a property of the model vendor's substrate, nondeterministic, and vendor-dependent. What **is** in scope is how the app constructs and contains the model: where the key lives, what data enters the prompt, whether model output is escaped before rendering, whether tool endpoints check authorization.

**Transport-layer flaws.** A benchmark served over one host with valid TLS cannot present TLS downgrade or certificate errors. Do not claim what cannot be presented.

---

## `MANIFEST.md` and `/__manifest`

Machine-readable ground truth, published **both** as a file and over HTTP at `GET /__manifest`, so a grader can fetch the answer key programmatically.

```yaml
- id: rls-002
  name: Permissive RLS policy allows cross-user read
  category: broken-access-control
  cwe: CWE-639
  owasp_2025: A01
  discovery_mechanism: baas-direct
  reachable_by_other_means: false
  location: table `notes_permissive` via PostgREST
  severity: critical
  detection: |
    Query the table with any authenticated session. Response contains rows
    with user_id values other than the authenticated user's.
  is_control: false
  paired_control: rls-003
  notes: |
    RLS is enabled. The policy is using (auth.role() = 'authenticated'),
    which passes for every logged-in user. No platform default prevents this.
    It requires understanding your own data model.
```

Controls get their own entries with `is_control: true` and a note stating **why a grader flagging this would be wrong.**

Also publish a **discovery coverage table**: for each mechanism, how many findings require it. That converts a recall score into a per-capability diagnosis.

---

## Setup

- **`docker compose up` and it runs.** Local Supabase, seeded database, the app. Zero manual configuration.
- Migrations create tables via **SQL, not the dashboard**, so the RLS-off case reproduces the path a code generator actually takes.
- Seed several users with overlapping records so cross-user access is demonstrable.
- Self-registration works over plain HTTP.
- All seed data synthetic and obviously fake.

---

## Safety

**Never deploy this to the public internet.** First paragraph of the README.

- No real credentials. Format-valid, functionally dead.
- No real personal data. Synthetic and obviously so.
- Bind to localhost by default.
- `SECURITY.md` stating the repo is intentionally vulnerable and reports are not needed.

---

## Working style

- **Do not fix vulnerabilities.** Check `MANIFEST.md` first.
- **Every vulnerability gets a paired control.** A commit adding a vulnerability without its control is incomplete.
- **Every finding declares its discovery mechanism**, and prefers exactly one.
- **One class per route** where possible. Realism that makes classes hard to isolate is a cost, not a feature.
- **Realistic code, authentic flaws.** Keep generated output where it is already wrong in the right way. Contrived constructions teach nothing about the field.
- **Update `MANIFEST.md` in the same commit.**