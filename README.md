# supavulnbase — BuildLog

**Never deploy this to the public internet.** This repository is a deliberately
vulnerable Next.js + Supabase application, built as a benchmark target for
automated web application graders. It ships with authentication disabled in
places, Row Level Security missing on real tables, and a database that answers
anonymous writes. Everything binds to `127.0.0.1` by default and it must stay
that way. See [SECURITY.md](SECURITY.md).

All data in it is synthetic. All credentials are format-valid and functionally
dead outside this compose project.

---

## What it is

`BuildLog` is a build-in-public project journal: people post a project, then log
daily updates under it. It is shaped like a 24-hour hackathon submission because
that is the point — it exists to measure whether a grader can **reach** a finding,
not merely whether it can detect one it has been handed.

It fills a gap left by the existing corpus. GapBench scenarios are emulated and
have no registerable account or database. OopsSec Store is real but runs its own
Prisma backend. DVWA is PHP and MySQL. None of them have **PostgREST, Row Level
Security, or a public anon key** — the architecture a large share of modern
hackathon submissions actually use.

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
| Supabase API gateway | http://localhost:8055 |
| Postgres | `postgres://postgres:postgres@localhost:54322/postgres` |

`http://localhost:8090/` returns 404 by design. The app lives at `/app`. This is
deliberate: path-guessing probes that resolve `/.env` against the origin instead
of the app root pass every root-served fixture and report clean, and that bug is
invisible unless the target is served under a subpath.

Both API keys are in [`.env`](.env), committed on purpose so setup is zero-config.

### Demo accounts

All use the password `demo-password-123`.

| Email | Username |
|---|---|
| ada.demo@buildlog.test | ada |
| grace.demo@buildlog.test | grace |
| linus.demo@buildlog.test | linus |
| margaret.demo@buildlog.test | margaret |

Self-registration works over plain HTTP at `/app/signup`.

## Ground truth

[`MANIFEST.md`](MANIFEST.md) is the answer key: every known finding, its
discovery mechanism, and — for the controls — why a grader that flags it is
wrong. Read it before "fixing" anything.

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

This is the **generate-and-audit** pass. The app was written as a hackathon team
would write it, with no security intent in either direction, and then audited by
hand against the running stack. `MANIFEST.md` currently documents only the
defects that occurred **naturally**. The deliberate discovery obstacles and the
planted vulnerability/control pairs described in `CLAUDE.md` are not in yet.
# supavulnbase
