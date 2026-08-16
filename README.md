# supavulnbase / BuildLog

**Never deploy this to the public internet.** This repository is a deliberately
vulnerable Next.js and Supabase application, built as a benchmark target for
automated web application graders. It ships with authentication disabled in
places, Row Level Security missing on real tables, and a database that answers
anonymous writes. Everything binds to `127.0.0.1` by default and it must stay
that way. See [SECURITY.md](SECURITY.md).

All data in it is synthetic. All credentials are valid in format and dead
outside this compose project.

---

## What it is

`BuildLog` is a project journal for building in public: people post a project,
then log daily updates under it. It has the shape of an overnight hackathon
submission because that is the point. It measures whether a grader can **reach**
a finding, not merely whether it can detect one it has been handed.

It fills a gap left by the existing corpus. GapBench scenarios are emulated and
have no registerable account or database. OopsSec Store is real but runs its own
Prisma backend. DVWA is PHP and MySQL. None of them have **PostgREST, Row Level
Security, or a public anon key**, which is the architecture a large share of
modern hackathon submissions actually use.

## Run it

```bash
docker compose up
```

That is the whole setup. It brings up Postgres, GoTrue, PostgREST, Storage, a
Kong gateway, applies the SQL migrations, seeds four demo accounts with
overlapping records, and builds and serves the app.

| Surface | URL |
|---|---|
| App (**served under a subpath, not at the origin root**) | http://localhost:8090/app |
| Ground truth, machine readable | http://localhost:8090/app/\_\_manifest |
| Supabase API gateway | http://localhost:8055 |
| Postgres | `postgres://postgres:postgres@localhost:54322/postgres` |

Check the target against its answer key at any time:

```bash
./verify.sh          # 91 assertions; more with PERF_MODE=on; fails on drift
```

`http://localhost:8090/` returns 404 by design. The app lives at `/app`. This is
deliberate. A probe that guesses paths against the origin instead of the app
root passes every fixture served at the root and reports clean, and that bug is
invisible unless the target is served under a subpath.

That trap is live. `GET /app/.env` returns a deployment env file containing the
JWT signing secret. `GET /.env` at the origin returns 404. A probe that resolves
against the origin reports this target clean while a critical leak sits one
prefix away.

### The comparison target served at the root

```bash
docker compose --profile root-variant up -d      # http://localhost:8091
```

Same app, `basePath` empty. There `/.env` is at the origin and `/app/.env`
returns 404, the exact inverse. Run a grader against both. A grader that finds
the leak only on :8091 resolves paths against the origin, and that is the
diagnosis.

Both API keys are in [`.env`](.env), committed on purpose so setup needs no
manual configuration.

### Demo accounts

All use the password `demo-password-123`.

| Email | Username |
|---|---|
| ada.demo@buildlog.test | ada |
| grace.demo@buildlog.test | grace |
| linus.demo@buildlog.test | linus |
| margaret.demo@buildlog.test | margaret |

Registration works over plain HTTP at `/app/signup`.

## Learning path

[`LEARN.md`](LEARN.md) is a guided tour for newcomers to Supabase security: nine
footguns, each reproduced with one command against the running app and then
repaired, ordered from the obvious to the subtle.

## Ground truth

[`MANIFEST.md`](MANIFEST.md) is the answer key: every known finding, its
discovery mechanism, and, for the controls, the reason a grader that flags it is
wrong. Read it before "fixing" anything.

It carries a `version`, and `/__manifest` returns that version plus the current
dial settings. **Cite all three with any published score or it is not
reproducible.**

## The hardened reference

```bash
./harden.sh authz      # fix ONLY authorization in the app layer
./harden.sh all        # fix everything (expect a residual of 9, not 0)
./harden.sh --sweep    # every class, asserting each diff is minimal
```

The hardened copy runs on **:8092** (Supabase on **:8093**) with its own
database and GoTrue, so the vulnerable target on :8090 stays up for comparison
beside it. One class is fixed at a time, from `rls` `secrets` `authz`
`injection` `headers` `auth` `qa` `perf`, and nothing else is tidied, so the
delta is attributable to that class.

Every `harden.sh` run smoke tests the target in a real browser. It logs in,
walks twelve pages, and fails on any CSP violation, failed request, or bounce
back to `/login`. Run it against anything:

```bash
node infra/smoke.mjs http://localhost:8090/app     # or :8092, :8091
node infra/ui-check.mjs http://localhost:8090/app  # UI state pairs (browser)
```

`ui-check.mjs` asserts that each UI state defect and its control behave
differently. Those five defects live only in the browser, so `verify.sh` cannot
see them, and one shipped with the defect and its control equally broken while
every HTTP check stayed green. It skips cleanly on a target where the `qa` class
is hardened, since the defects are correctly absent there.

`GET /__manifest` on the hardened target declares which findings it fixes and
which are **expected to remain**. A fully hardened build still has 9 real
findings, so scoring it against zero marks correct results as false positives.
See `MANIFEST.md`.

## Modes

Four dials, set in [`.env`](.env):

| Dial | Settings | What changes |
|---|---|---|
| `RLS_MODE` | `off` · `permissive` · `correct` | Only the policies on `public.bookmarks`. Table, columns and seed data are identical in all three. |
| `DISCOVERY_MODE` | `linked` · `bundle` · `interaction` · `concatenated` | Only how `/api/bookmarks/all` can be found. The route behaves identically in all four. |
| `SIGNUP_MODE` | `normal` · `interaction` · `unlabeled` · `login-only` · `confirm` · `sso` | How registration behaves. Reproduces the measured auth failure taxonomy. `confirm` and `sso` are controls that must stay N/A. Use `./signup.sh <mode>`. |
| `PERF_MODE` | `on` · `off` | Whether `/app/perf/*` exists. Off by default, because a 3s sleep in a normal crawl would slow the crawler and could gate off other probes. |

Canonical is `RLS_MODE=off` plus `DISCOVERY_MODE=linked` plus `PERF_MODE=off`
plus `SIGNUP_MODE=normal`.

```bash
./signup.sh interaction   # rebuilds :8090 with that registration failure mode
```

```bash
./dial-sweep.sh rls          # 3 modes, fast, no rebuild
./dial-sweep.sh discovery    # 4 modes, rebuilds the image each time
```

CI should run the whole sweep. Running `verify.sh` against one mode misses
the comparison across modes, which is the reason the dials exist.

### Probe isolation regression test

The fixture serves identical content byte for byte with no network variance,
which makes it the only thing that can test this. Run the performance probes
**solo**, then again at **concurrency 5** against the same target, and compare.

```bash
sed -i 's/^PERF_MODE=.*/PERF_MODE=on/' .env && docker compose up -d web
for i in 1 2 3 4 5; do curl -s -o /dev/null -w '%{time_starttransfer}\n' \
  http://localhost:8090/app/perf/slow & done; wait
```

Nothing about the target changes between the two runs, so **numbers that move
mean the probes are contending with each other rather than measuring the
target.** Every other fixture varies for its own reasons, real network, real
backends, real caches, so a shift there is unattributable. Here it is not.

## Three things to know before you trust a run

**The app was authored, not scaffolded.** The intended method was to prompt a
generator and audit whatever came out. That was not possible in the environment
this was built in, so it was written by hand in the idiom a generator produces,
App Router and `supabase-js` in the browser for all writes and RLS as the only
authorization layer, then audited against the running stack rather than from
memory. The audit is honest, and three expected findings were falsified by
probing and recorded as controls. The **shape** still carries an author's bias
that real generator output would not, so treat the distribution of defects as
illustrative and the individual entries as verified.

**This fixture tests application configuration, not middleware versions.** Every
finding is about how the app is built and how its policies are written. Nothing
here exercises a CVE in PostgREST, GoTrue, Kong or Postgres, and the pinned
images are not kept current. A clean run says the grader handles application
misconfiguration. It says nothing about dependency or middleware
vulnerabilities.

**Localhost is not the internet.** There is no packet loss, no TLS handshake, no
geographic latency, and no bandwidth ceiling. That is deliberate: it makes the
fixture deterministic, which is what lets it validate that an instrument is
*correct*. It also means any threshold calibrated here will be wrong in the
field. Calibration belongs to the corpus from the field. This repo establishes
instrument correctness only.

## Layout

```
docker-compose.yml         the whole stack
.env                       committed demo keys (anon + service_role)
infra/
  kong.yml                 API gateway routes and the apikey boundary
  db/                      role passwords and JWT settings
  seed.mjs                 demo accounts and content
supabase/migrations/       app schema, plain SQL
web/                       the Next.js app
```

## Status

Manifest `0.8.0`. 45 findings and 29 controls declared across all modes, all
verified against the running stack by `./verify.sh` (91 assertions in canonical
mode, more with `PERF_MODE=on`), `./dial-sweep.sh`, and `./harden.sh --sweep`.

The security set sits beside two others that nothing else published covers.
**UI state honesty** fixtures at `/app/qa/*` hold five defects and five
controls, each defect independent of intent and invisible to a security scanner.
**Performance** fixtures at `/app/perf/*` hold five defects and three controls,
and they separate *structural* claims (compression, validators, request counts,
byte counts, all deterministic) from *timing* claims (which assert a floor
guaranteed by construction, never a measured value).

The app was first written as a hackathon team would write it, with no security
intent in either direction, then audited by hand. That produced the naturally
occurring half. Deliberate pairs of a vulnerability and its control, plus the
discovery obstacles, were planted on top. `MANIFEST.md` marks which is which and
records how each was verified.

Every discovery mechanism in `CLAUDE.md` now gates at least one finding
reachable by no other path, so a miss tells you which reach capability is
broken. The `interaction` mechanism is gated by the discovery dial rather than
resting on one naturally occurring finding.

The OWASP tags are Top 10:2025. The distribution is the point: Broken Access
Control (A01) and Security Misconfiguration (A02) together account for two
thirds of the security findings, and classic injection (A05) accounts for three.
Supabase moved the database into the browser, and the failures moved with it.
