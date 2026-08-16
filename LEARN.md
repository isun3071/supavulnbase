# Learn Supabase security by breaking BuildLog

This document walks through how Supabase apps leak data, using the running
fixture as a lab. You read a footgun, reproduce it with one command against the live
target, then watch the fix take hold. No prior Supabase knowledge is assumed.

Every command here runs against the vulnerable target on `http://localhost:8090`.
Nothing you do touches the internet. All the data is fake and all the keys are
dead outside this compose project.

One sentence is worth keeping. **Supabase moves the database into the browser,
and Row Level Security is the only wall left standing between a stranger and
your data.** The rest of this file is nine ways that wall has a hole in it.

---

## Before you start

Bring the stack up and wait about a minute for the first build:

```bash
docker compose up -d
```

Open `http://localhost:8090/app`. You get a public feed of projects. Log in
with `ada.demo@buildlog.test` and the password `demo-password-123`, or sign up
for your own account.

Two addresses matter for the lessons:

- `http://localhost:8090/app` is the app.
- `http://localhost:8055` is the Supabase API (PostgREST, GoTrue, Storage),
  the same API the browser talks to.

Grab the public key once so the commands below can use it:

```bash
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
```

The answer key for the whole fixture is `MANIFEST.md`, and the same data is
served at `http://localhost:8090/app/__manifest`. Each lesson names the finding
id (like `rls-001`) so you can look up the full entry.

---

## The mental model, in ninety seconds

A normal web app keeps its database behind a server. The browser asks the
server for data, and the server decides what to hand back. The database is never
exposed to the client.

Supabase does something different. It puts a REST API called PostgREST directly
in front of Postgres and ships a public key, the anon key, to the browser. The
browser queries the database on its own. There is often no server in the middle
making authorization decisions.

So what stops one user from reading another user's rows? One thing: Row Level
Security, a set of Postgres policies that filter every query by who is asking.
Turn RLS off, or write a policy that says less than you think it says, and the
anon key in every visitor's browser becomes a key to the whole table.

Most of what follows comes from that single shift.

---

## Lesson 1: a table with no policy answers to anyone (`rls-001`)

The footgun. You create a table with a SQL migration and forget to enable RLS.
Supabase grants the `anon` role full read and write on everything in the public
schema by default, so the table is now open to the world through PostgREST.

Why it happens so often. The Supabase dashboard prompts you to turn RLS on when
you create a table by clicking. A SQL migration does not prompt you. Every code
generator writes migrations, so the table looks finished and carries no guard
at all.

See it. Read every project with the public key and no account:

```bash
curl "http://localhost:8055/rest/v1/projects?select=title" -H "apikey: $ANON"
```

You get all seven, belonging to four different users. Now write to the table
you do not own, still with nothing but the anon key:

```bash
curl -X POST "http://localhost:8055/rest/v1/projects" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"user_id":"00000000-0000-0000-0000-000000000000","title":"anyone can write this","slug":"probe-1"}'
```

See it fixed. The repair is one line per table, `alter table ... enable row
level security`, plus policies that scope each row to its owner. The full fix is
in `supabase/harden/rls.sql`. Run it against a separate hardened copy on port
8092:

```bash
./harden.sh rls
curl "http://localhost:8093/rest/v1/projects" -H "apikey: $ANON" \
  -X POST -H "Content-Type: application/json" -d '{"title":"x","slug":"y"}'
```

The write returns `401` now. The vulnerable target on 8090 stays broken so you
can compare the two side by side.

The lesson for your own apps. A migration that creates a table is not done when
the table exists. It is done when RLS is on and a policy is written. Treat a
table with no policy as a table with no lock.

---

## Lesson 2: RLS on is not the same as RLS correct (`rls-003`)

The footgun. You enable RLS, you write a policy, every checklist passes. The
policy is `using (auth.role() = 'authenticated')`. That reads like "only signed
in users," and it is true for every signed in user, so any account can read
every row.

Why it happens so often. A generator that writes policies tends to write this
one, because it satisfies the linter and the demo. It is the most common
critical finding in real Supabase reviews. No platform default catches it,
because RLS is on and a policy exists. The mistake lives inside the policy.

See it. This table needs an account, so it teaches a second habit: carry a
session into your probing. Get a token, then read the sponsor leads:

```bash
TOKEN=$(curl -s -X POST "http://localhost:8055/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"ada.demo@buildlog.test","password":"demo-password-123"}' \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

curl "http://localhost:8055/rest/v1/sponsor_leads?select=company,contact_email,amount_cents" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
```

Ada owns two leads. She sees six, with the contact emails and deal sizes of
people she has no relationship to.

See it fixed. The correct policy is `using (auth.uid() = user_id)`, which
compares the row's owner to the caller. `./harden.sh rls` applies it. After
that, Ada sees two.

The lesson for your own apps. "Is RLS on" is the wrong question. "What does the
policy actually compare" is the right one. A policy that checks a role instead
of an identity is a policy that checks nothing useful.

---

## Lesson 3: a 204 does not mean the write happened (`ctl-002`, `rls-004`)

The footgun. You probe a table with a write, PostgREST answers `204 No
Content`, and you record it as a successful write. PostgREST returns `204` for a
write that changed zero rows exactly as it does for one that changed a hundred.

Why it matters. A `204` turns a careful reviewer into a false alarm. The `profiles` table in this fixture is locked down correctly. An
anonymous write to it returns `204` and changes nothing. A reviewer who trusts
the status code reports a critical hole in a table that is fine.

See it. Try to overwrite a profile you do not own:

```bash
curl -s -o /dev/null -w "status: %{http_code}\n" \
  -X PATCH "http://localhost:8055/rest/v1/profiles?username=eq.grace" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"bio":"changed by a stranger"}'

curl "http://localhost:8055/rest/v1/profiles?select=bio&username=eq.grace" -H "apikey: $ANON"
```

The status is `204`. The bio is unchanged. The write touched no rows because the
policy filtered them all away before the update ran.

The lesson for your own apps. Confirm a write by reading the row back, never by
the status code. This also explains a real limit of RLS: an unpoliced `update`
or `delete` still has to find its target rows, and that lookup obeys the read
policy. A correct read policy quietly neutralizes an open write policy, which is
why the `drafts` table here is exploitable on `insert` but not on `update`.

---

## Lesson 4: your public key belongs in the browser, your secret key does not (`key-001`, `ctl-001`)

The footgun. Supabase gives you two keys. The anon key is meant to ship to
every browser. The service_role key bypasses RLS entirely and is meant to stay
on a server. Both are long tokens that start with `eyJ`. Put the wrong one in a
variable named `NEXT_PUBLIC_` and your build inlines it into the JavaScript that
every visitor downloads.

Why the two look identical. They are both JSON Web Tokens signed with the same
secret. Nothing on the surface tells them apart. The difference is one field
inside the decoded token, the `role` claim.

See it. Decode the role of each:

```bash
echo "$ANON" | cut -d. -f2 | base64 -d 2>/dev/null | grep -o '"role":"[^"]*"'
SVC=$(grep '^SERVICE_ROLE_KEY=' .env | cut -d= -f2-)
echo "$SVC" | cut -d. -f2 | base64 -d 2>/dev/null | grep -o '"role":"[^"]*"'
```

One reads `anon`, the other reads `service_role`. In this fixture the
service_role key is inlined into the client bundle (finding `key-001`), and the
anon key is inlined right beside it. Reporting the anon key as a leak is a
mistake, because it is public on purpose. Reporting the service_role key is a
five alarm fire, because it reads and writes every table with no policy in the
way.

The lesson for your own apps. A long token near the word "supabase" is not
automatically a leak. Decode the `role` claim. `anon` is fine in the browser.
`service_role` in the browser means anyone can dump your database.

---

## Lesson 5: where the app lives changes what a scanner finds (`probe-001`)

The footgun. This app is served under `/app`, not at the root of the domain.
The deployment box has an environment file sitting next to the build, and the
web server hands it out as static text. A scanner that checks for an exposed
`.env` has to ask for it at the right prefix.

See it. Ask for the environment file under the app path, then at the origin:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8090/app/.env
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8090/.env
```

The first returns `200` and hands you a file that contains the JWT signing
secret. The second returns `404`. A tool that only ever asks the origin reports
this target clean while a critical secret sits one prefix away.

The lesson for your own apps. Path guessing has to resolve against the app root,
not the domain root. The fixture ships a second copy served at the root on port
8091 for exactly this reason. Point your tool at both. A tool that finds the
leak only on one is resolving paths against the wrong prefix, and now you know.

---

## Lesson 6: the database will describe its whole schema to a stranger (`info-001`)

The footgun. PostgREST publishes an OpenAPI document at the root of its API.
The anon key is enough to read it, and it lists every table, every column, and
every type.

See it.

```bash
curl "http://localhost:8055/rest/v1/" -H "apikey: $ANON" | head -c 400
```

You get the data model for free: the names of the tables, the `user_id` columns,
the relationships. PostgREST does this by default rather than through a coding
mistake, so the fixture keeps it open. It also means any secret you hoped to hide behind an
unknown parameter name is not hidden, because the schema is public.

The lesson for your own apps. Assume an attacker knows your schema. Do not rely
on a column name or a table name being secret. The only thing standing between a
reader and a row is the policy on that row.

---

## Lesson 7: injection on Supabase is not SQL (`inj-001`)

The footgun. A route builds a PostgREST filter by pasting user input into a
query string. PostgREST filters are comma separated, so a comma in the input
adds a condition the developer never wrote. The bug is injection, but the
grammar being injected is PostgREST's filter language, not SQL.

See it. The search route at `/api/projects/search` matches a term against the
project titles. A term that matches nothing returns nothing:

```bash
curl "http://localhost:8090/app/api/projects/search?q=zzz"
```

`"count":0`. Now add a comma and a condition that is always true:

```bash
curl "http://localhost:8090/app/api/projects/search?q=zzz%25,id.not.is.null,title.ilike.%25zzz"
```

`"count":7`. The term still matches nothing, yet every row comes back, because
the injected `id.not.is.null` widened the filter to the whole table.

The finding also hides on purpose. The path `/api/projects/search` appears
nowhere in the served pages or the JavaScript bundle. You reach it by guessing a
conventional suffix on the `/api/projects` collection. The fixture's larger
point lives in that gap: reaching a bug is often harder than detecting it.

The lesson for your own apps. Never paste user input into a filter string.
Escape the delimiters, or pass values through the client library's parameter
methods, which quote them for you.

---

## Lesson 8: the defaults do not stop a password guesser (`auth-001`, `auth-002`)

The footgun. Self hosted GoTrue, the Supabase auth service, does not rate limit
the password endpoint out of the box, and it accepts a six character password
with no complexity rule. Hosted Supabase adds limits. A self hosted stack that
inherits the defaults does not.

See it. Send ten wrong passwords and count how many are throttled:

```bash
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "%{http_code} " \
    -X POST "http://localhost:8055/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d '{"email":"ada.demo@buildlog.test","password":"wrong"}'
done; echo
```

Ten `400`s, zero `429`s. Nothing slows a guesser down. The same endpoint accepts
`aaaaaa` as a new account password.

See it fixed. `./harden.sh auth` puts a rate limit in front of the password
endpoint and raises the password rules. The interesting part is where the limit
goes. It has to sit on the login endpoint alone, because the auth service also
checks the session on every page load, and a limit on the whole auth path logs
users out after a couple of clicks. The fix and that trap are both in
`harden.sh`.

The lesson for your own apps. Check your auth defaults against a burst of
requests, not against the settings page. A limit that is configured but sits in
front of the wrong endpoint protects nothing and can break the app.

---

## The other half: things that must not fire

Half of this fixture is findings. The other half is controls, code that looks
suspicious and is correct. A tool that reports these is wrong, and measuring how
often a tool stays quiet is as important as measuring how often it speaks.

Two are worth meeting directly.

The anon key in the bundle, from Lesson 4, is the first. It sits in the
JavaScript beside a real leaked key. A scanner that flags every long token flags
both, and is right once.

The proxy route is the second. The route at `/api/integrations/ping` forwards to
an outside service and has no database behind it. It answers slowly and fails at
random, on purpose:

```bash
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" \
    --get --data-urlencode "probe=' OR 1=1--" \
    http://localhost:8090/app/api/integrations/ping
done
```

The delays and the intermittent `500`s look like a backend buckling under an
injection payload. Nothing is behind it. An injection tool that keys on timing
or error strings fires here and is wrong every time. Real apps have routes like
this, so a tool has to tell them apart.

---

## Seeing a fix in isolation

Each lesson pointed you at `./harden.sh <class>`. That command builds a second
copy of the app on port 8092 with one class of bug repaired and nothing else
changed. You can read the exact repair:

- `supabase/harden/rls.sql` is the database fix for Lessons 1, 2, 3.
- `web/next.config.mjs` holds the header and secret fixes.
- The route files under `web/src/app/api` show the authorization and injection
  fixes as small conditional branches.

The reason for one class at a time is honesty. A copy that fixed everything at
once would leave you unable to tell which change closed which finding. Fixing
one class keeps the difference between the two copies attributable to that
class.

Run `./harden.sh --sweep` to walk every class in turn and confirm each repair
closes its own findings and leaves the rest alone.

---

## Where to go next

Read `MANIFEST.md`. Every finding has an entry that names the mechanism, the
CWE, the OWASP 2025 category, and, for the controls, the reason a tool that
flags it is wrong. The findings map cleanly onto the 2025 top ten, and the shape
is worth noticing: Broken Access Control and Security Misconfiguration together
account for two thirds of the security findings, and classic injection accounts
for three. Real Supabase apps show the same balance. The database moved into the
browser, and the failures moved with it.

`README.md` is the companion for testing a scanner instead of learning. It
covers the dials, the hardened reference, and the answer key served over HTTP.
