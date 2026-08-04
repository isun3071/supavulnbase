#!/usr/bin/env bash
# Checks every claim in MANIFEST.md against the running stack.
#
# A fixture is only as good as its answer key. Run this after any change:
#     docker compose up -d && ./verify.sh
#
# Exits non-zero if any finding stopped reproducing or any control started
# firing. Both directions matter — a control that breaks is as bad as a
# finding that vanishes.

set -uo pipefail
cd "$(dirname "$0")"

APP=${APP:-http://localhost:8090/app}
ORIGIN=${ORIGIN:-http://localhost:8090}
ROOT_APP=${ROOT_APP:-http://localhost:8091}
SB=${SB:-http://localhost:8055}
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
SVC=$(grep '^SERVICE_ROLE_KEY=' .env | cut -d= -f2-)

pass=0; fail=0
ok()   { printf "  \033[32mPASS\033[0m  %-11s %s\n" "$1" "$2"; pass=$((pass+1)); }
bad()  { printf "  \033[31mFAIL\033[0m  %-11s %s\n" "$1" "$2"; fail=$((fail+1)); }
check(){ [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 (got '$2', want '$3')"; }
# Seed counts drift as soon as a grader registers accounts or writes rows, so
# count assertions are lower bounds and the interesting properties are tested
# as relationships instead of fixed numbers.
ge(){ [ "${2:-0}" -ge "$3" ] 2>/dev/null && ok "$1" "$4" || bad "$1" "$4 (got '${2:-}', want >= $3)"; }

jwt() { curl -s -X POST "$SB/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
        -H 'Content-Type: application/json' \
        -d "{\"email\":\"$1.demo@buildlog.test\",\"password\":\"demo-password-123\"}" \
      | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4; }
rows(){ curl -s "$1" -H "apikey: $ANON" ${2:+-H "Authorization: Bearer $2"} | grep -o '"id"' | wc -l | tr -d ' '; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "== reachability =="
check reachable "$(code $APP)"    200 "app serves under the subpath"
check reachable "$(code $ORIGIN/)" 404 "origin root 404s (subpath serving intact)"

ADA=$(jwt ada)
[ -n "$ADA" ] && ok auth "password grant works" || bad auth "could not get a session"

echo
echo "== FINDINGS (must reproduce) =="
ge rls-001 "$(rows "$SB/rest/v1/projects?select=id")"  7 "projects readable anonymously"
ge rls-002 "$(rows "$SB/rest/v1/updates?select=id")"  13 "updates readable anonymously"

AID=$(curl -s "$SB/rest/v1/profiles?select=id&username=eq.ada" -H "apikey: $ANON" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
c=$(code -X POST "$SB/rest/v1/projects" -H "apikey: $ANON" -H 'Content-Type: application/json' \
     -d "{\"user_id\":\"$AID\",\"title\":\"VERIFY PROBE\",\"slug\":\"verify-probe-tmp\"}")
check rls-001w "$c" 201 "anonymous INSERT into projects"
curl -s -o /dev/null -X DELETE "$SB/rest/v1/projects?slug=eq.verify-probe-tmp" -H "apikey: $SVC" -H "Authorization: Bearer $SVC"

vis=$(rows "$SB/rest/v1/sponsor_leads?select=id" "$ADA")
own=$(rows "$SB/rest/v1/sponsor_leads?select=id&user_id=eq.$AID" "$ADA")
[ "$vis" -gt "$own" ] && ok rls-003 "permissive policy: ada sees $vis leads but owns only $own" \
                      || bad rls-003 "ada sees $vis leads, owns $own — cross-user read gone"
check rls-003a "$(rows "$SB/rest/v1/sponsor_leads?select=id")"       0 "...but not anonymously"

c=$(code -X POST "$SB/rest/v1/drafts" -H "apikey: $ANON" -H 'Content-Type: application/json' \
     -d "{\"user_id\":\"$AID\",\"body\":\"VERIFY FORGED\"}")
check rls-004 "$c" 201 "anonymous INSERT forges a draft"
curl -s -o /dev/null -X DELETE "$SB/rest/v1/drafts?body=eq.VERIFY%20FORGED" -H "apikey: $SVC" -H "Authorization: Bearer $SVC"

# storage-001 shipped once as declared-but-absent. Assert the bucket EXISTS and
# is enumerable, not just that one object path happens to answer.
buckets=$(curl -s "$SB/storage/v1/bucket" -H "apikey: $ANON" -H "Authorization: Bearer $ANON")
echo "$buckets" | grep -q '"project-media"' \
  && ok storage-001 "project-media bucket exists and is anonymously enumerable" \
  || bad storage-001 "project-media NOT listed by GET /storage/v1/bucket: $buckets"
echo "$buckets" | grep -q '"payout-documents"' \
  && ok storage-001b "payout-documents bucket exists" || bad storage-001b "payout-documents missing"
check storage-001c "$(code "$SB/storage/v1/object/public/project-media/lampshade/screenshot.txt")" 200 "public bucket serves anonymously"
check admin-001   "$(code "$APP/api/admin/export")" 200 "unlinked admin export, no credentials"
check info-001    "$(code "$SB/rest/v1/" -H "apikey: $ANON")" 200 "OpenAPI root discloses schema"

n=$(curl -s "$APP/api/projects/search?q=zzznomatch%25,id.not.is.null,title.ilike.%25zzznomatch" | grep -o '"count":[0-9]*' | cut -d: -f2)
check inj-001 "$n" 7 "filter injection returns all rows for a non-matching term"

curl -s -X POST "$APP/api/feedback" -H 'Content-Type: application/json' -d '{}' | grep -q renderTemplate \
  && ok tmpl-001 "empty POST leaks the body-only field name" || bad tmpl-001 "renderTemplate not in the Zod error"
ssti=$(curl -s -X POST "$APP/api/feedback" -H 'Content-Type: application/json' \
  -d '{"message":"x","rating":3,"renderTemplate":"{{7*7}}"}')
echo "$ssti" | grep -q '"rendered":"49"' \
  && ok tmpl-001b "template is evaluated server side: {{7*7}} -> 49 (real SSTI)" \
  || bad tmpl-001b "template not evaluated, finding is not black-box detectable: $ssti"
rce=$(curl -s -X POST "$APP/api/feedback" -H 'Content-Type: application/json' \
  -d '{"message":"x","rating":3,"renderTemplate":"{{constructor.constructor}}"}')
echo "$rce" | grep -q 'constructor' \
  && ok tmpl-001c "evaluator does NOT reach host objects (scope matches the manifest)" \
  || bad tmpl-001c "evaluator resolved a host object — wider than MANIFEST.md declares"

# auth-001 vs ctl-014: login is unlimited, but other GoTrue endpoints are not
login_codes=$(for i in $(seq 1 25); do curl -s -o /dev/null -w '%{http_code} ' \
  -X POST "$SB/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d '{"email":"ada.demo@buildlog.test","password":"wrong"}'; done)
n429=$(echo "$login_codes" | tr ' ' '\n' | grep -c '^429$')
check auth-001 "$n429" 0 "25 failed logins, zero 429 — no rate limit on the password grant"
check auth-001b "$(code -X POST "$SB/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H 'Content-Type: application/json' -d '{"email":"ada.demo@buildlog.test","password":"demo-password-123"}')" \
  200 "...and no lockout: the account still authenticates afterwards"

rec=$(for i in 1 2 3; do curl -s -o /dev/null -w '%{http_code} ' -X POST "$SB/auth/v1/recover" \
  -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"email":"ada.demo@buildlog.test"}'; done)
echo "$rec" | grep -q 429 && ok ctl-014 "/auth/v1/recover IS rate limited ($rec) — auth is not uniformly unlimited" \
                          || bad ctl-014 "/auth/v1/recover no longer rate limits ($rec)"

e1=$(curl -s -X POST "$SB/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"email":"ada.demo@buildlog.test","password":"nope"}')
e2=$(curl -s -X POST "$SB/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"email":"definitely-no-such-user@buildlog.test","password":"nope"}')
[ "$e1" = "$e2" ] && ok ctl-015 "login errors identical for real and unknown accounts (no enumeration)" \
                  || bad ctl-015 "login response differs by account existence — enumeration possible"

check probe-001 "$(code "$APP/.env")"        200 "deployment .env served under the APP root"
check probe-002 "$(code "$APP/.git/config")" 200 ".git/config served under the APP root"
curl -s "$APP/.env" | grep -q 'JWT_SECRET' \
  && ok probe-001b "leaked .env contains the JWT signing secret" || bad probe-001b "JWT_SECRET missing from leaked .env"

hdrs=$(curl -sD - -o /dev/null "$APP" | tr 'A-Z' 'a-z')
miss=0; for h in content-security-policy x-frame-options x-content-type-options referrer-policy; do
  echo "$hdrs" | grep -q "^$h:" && miss=$((miss+1)); done
check hdr-001 "$miss" 0 "security headers still absent"
echo "$hdrs" | grep -q '^x-powered-by:' && ok hdr-002 "x-powered-by present" || bad hdr-002 "x-powered-by gone"

echo
echo "== bundle (findings vs controls) =="
CID=$(docker compose ps -q web)
B=$(mktemp -d); docker cp "$CID":/app/.next/static "$B/" >/dev/null 2>&1
inb(){ grep -rlF "$1" "$B" 2>/dev/null | wc -l | tr -d ' '; }
[ "$(inb "$SVC")"   -ge 1 ] && ok key-001 "service_role key IS in the bundle"     || bad key-001 "service_role key missing"
[ "$(inb 'sk-proj-')" -ge 1 ] && ok key-002 "sk-proj- key IS in the bundle"       || bad key-002 "sk-proj- key missing"
[ "$(inb "$ANON")"  -ge 1 ] && ok ctl-001 "anon key present (control, must not be reported)" || bad ctl-001 "anon key missing"
for d in pk_test_ asst_ prj_8HkQ dpl_4TnQ; do
  [ "$(inb $d)" -ge 1 ] && ok ctl-011 "decoy $d present" || bad ctl-011 "decoy $d missing from bundle"
done
[ "$(inb 'BuildLog drafting assistant')" -ge 1 ] && ok llm-001 "system prompt in bundle" || bad llm-001 "prompt missing"
[ "$(inb 'support PIN')" -ge 1 ] && ok llm-002 "synthetic PII in prompt" || bad llm-002 "PII missing"
[ "$(inb '/api/admin/export')" -ge 1 ] && ok admin-001b "admin route discoverable ONLY via bundle" || bad admin-001b "admin string missing"
check inj-001b "$(inb 'api/projects/search')" 0 "search path is NOT a bundle literal"
check ctl-004  "$(find "$B" -name '*.map' | wc -l | tr -d ' ')" 0 "no source maps"
rm -rf "$B"

echo
echo "== CONTROLS (must stay quiet) =="
ge ctl-002 "$(rows "$SB/rest/v1/profiles?select=id")" 4 "profiles readable (public directory, intended)"
curl -s -o /dev/null -X PATCH "$SB/rest/v1/profiles?username=eq.grace" -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"bio":"VERIFY TAMPER"}'
curl -s "$SB/rest/v1/profiles?select=bio&username=eq.grace" -H "apikey: $ANON" | grep -q 'VERIFY TAMPER' \
  && bad ctl-002 "anonymous profile write PERSISTED - RLS broken" || ok ctl-002 "anon profile write changed nothing (204 lies)"

pvis=$(rows "$SB/rest/v1/payout_accounts?select=id" "$ADA")
pown=$(rows "$SB/rest/v1/payout_accounts?select=id&user_id=eq.$AID" "$ADA")
[ "$pvis" = "$pown" ] && [ "$pvis" -ge 1 ] && ok ctl-009 "ada sees exactly her own payout accounts ($pvis)" \
  || bad ctl-009 "ada sees $pvis payout accounts but owns $pown — owner scoping broken"
check ctl-009a "$(rows "$SB/rest/v1/payout_accounts?select=id")"       0 "payout accounts invisible anonymously"
check ctl-010 "$(code "$SB/storage/v1/object/public/payout-documents/ada/remittance-2026-06.txt")" 400 "private bucket denies anonymous read"

DID=$(curl -s "$SB/rest/v1/drafts?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $ADA" | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | head -1)
curl -s -o /dev/null -X PATCH "$SB/rest/v1/drafts?id=eq.$DID" -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"body":"VERIFY TAMPER"}'
curl -s "$SB/rest/v1/drafts?select=body" -H "apikey: $ANON" -H "Authorization: Bearer $ADA" | grep -q 'VERIFY TAMPER' \
  && bad ctl-013 "drafts UPDATE was exploitable - write gap wider than documented" \
  || ok ctl-013 "drafts UPDATE policy is inert as documented"

check ctl-005  "$(code "$ORIGIN/.env")"       404 "/.env 404s at the ORIGIN (origin-resolving probe finds nothing)"
check ctl-005a "$(code "$ORIGIN/.git/config")" 404 "/.git/config 404s at the ORIGIN"
check ctl-005b "$(code "$APP/package.json")"   404 "package.json genuinely not served under the app root"
check ctl-006 "$(code "$APP/definitely-not-a-real-page")" 404 "unknown route returns a real 404"

# proxy control: no DB in the path, but flaky by design
codes=$(for i in $(seq 1 20); do curl -s -o /dev/null -w '%{http_code} ' --get --data-urlencode 'p=x' "$APP/api/integrations/ping"; done)
n5=$(echo "$codes" | tr ' ' '\n' | grep -c '^500$'); n4=$(echo "$codes" | tr ' ' '\n' | grep -c '^429$')
[ "$((n5+n4))" -gt 0 ] && ok ctl-012 "proxy route returns intermittent 500/429 (${n5}x500 ${n4}x429 of 20)" \
                       || bad ctl-012 "proxy route never failed - flakiness gone"
check ctl-012b "$(grep -c 'supabase' web/src/app/api/integrations/ping/route.ts)" 0 "proxy route has no database in the path"

echo
echo "== answer key served over HTTP =="
check manifest "$(code "$APP/__manifest")" 200 "GET {basePath}/__manifest"
# Compare the FULL declared set, not just what this mode exposes: the served
# manifest filters by dial, MANIFEST.md documents every mode.
served=$(curl -s "$APP/__manifest" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ids=[e['id'] for e in d['findings']+d['controls']]+[e['id'] for e in d['not_present_in_this_mode']]
print(' '.join(sorted(ids)))" 2>/dev/null)
doc=$(grep -oE '^- id: [a-z0-9-]+' MANIFEST.md | awk '{print $3}' | sort | tr '\n' ' ' | sed 's/ $//')
[ "$served" = "$doc" ] && ok manifest "served ids match MANIFEST.md exactly (all modes)" \
  || bad manifest "DRIFT: served='$served' doc='$doc'"

ver=$(curl -s "$APP/__manifest" | python3 -c "import sys,json;print(json.load(sys.stdin)['manifest_version'])" 2>/dev/null)
docver=$(grep -oE '^version: [0-9.]+' MANIFEST.md | awk '{print $2}')
check manifest "$ver" "$docver" "manifest_version agrees with MANIFEST.md ($ver)"

echo
echo "== dials =="
mode=$(curl -s "$APP/__manifest" | python3 -c "import sys,json;m=json.load(sys.stdin)['modes'];print(m['rls'],m['discovery'],m['is_canonical'])" 2>/dev/null)
echo "  mode: rls=$(echo $mode | cut -d' ' -f1) discovery=$(echo $mode | cut -d' ' -f2) canonical=$(echo $mode | cut -d' ' -f3)"
RLSM=$(echo $mode | cut -d' ' -f1)
bvis=$(rows "$SB/rest/v1/bookmarks?select=id" "$ADA")
bown=$(rows "$SB/rest/v1/bookmarks?select=id&user_id=eq.$AID" "$ADA")
banon=$(rows "$SB/rest/v1/bookmarks?select=id")
case "$RLSM" in
  off)
    [ "$banon" -gt 0 ] && ok dial-rls-001 "RLS off: $banon bookmarks readable with the anon key alone" \
                       || bad dial-rls-001 "RLS off but anon read returned nothing" ;;
  permissive)
    [ "$banon" -eq 0 ] && [ "$bvis" -gt "$bown" ] \
      && ok dial-rls-001 "permissive: anon sees 0, ada sees $bvis but owns $bown" \
      || bad dial-rls-001 "permissive expected anon=0 and visible>owned (anon=$banon vis=$bvis own=$bown)" ;;
  correct)
    [ "$banon" -eq 0 ] && [ "$bvis" = "$bown" ] \
      && ok ctl-016 "correct: anon sees 0, ada sees exactly her own ($bown)" \
      || bad ctl-016 "correct mode leaked (anon=$banon vis=$bvis own=$bown)" ;;
esac
check dial-disc-001 "$(code "$APP/api/bookmarks/all")" 200 "export route leaks all bookmarks regardless of RLS mode"
curl -s "$APP/api/summarize" -X POST -H 'Content-Type: application/json' -d '{}' | grep -q toneProfile \
  && ok sum-001 "empty POST to /api/summarize leaks toneProfile" || bad sum-001 "toneProfile not in the Zod error"

echo
echo "== root-served comparison variant (profile: root-variant) =="
if [ "$(code "$ROOT_APP/" )" = "200" ]; then
  check variant "$(code "$ROOT_APP/.env")"  200 "/.env served at the ORIGIN of the root variant"
  check variant "$(code "$ROOT_APP/app/.env")" 404 "...and NOT under /app there"
  ok variant "a probe resolving against the origin finds probe-001 here but not on the primary target"
else
  echo "  skip   root variant not running (docker compose --profile root-variant up -d)"
fi

echo
echo "== authed-discovery: anon-404 routes =="
SESS=$(curl -s -X POST "$SB/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada.demo@buildlog.test","password":"demo-password-123"}')
CK="sb-localhost-auth-token=base64-$(printf '%s' "$SESS" | base64 -w0)"
check authz-002 "$(code "$APP/team")"       404 "/team 404s when anonymous (not a redirect, which would confirm it exists)"
check authz-003 "$(code "$APP/team/audit")" 404 "/team/audit 404s when anonymous"
check authz-002b "$(code "$APP/team" --cookie "$CK")"       200 "/team renders with a session"
check authz-003b "$(code "$APP/team/audit" --cookie "$CK")" 200 "/team/audit renders with a session"
n=$(curl -s "$APP/team" --cookie "$CK" | grep -o '@buildlog.test' | wc -l | tr -d ' ')
[ "$n" -ge 4 ] && ok authz-002c "member directory leaks $n account emails to a signed-in user" \
               || bad authz-002c "expected emails in the directory, found $n"
check authz-003c "$(code -X POST "$SB/rest/v1/rpc/recent_auth_events" -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{}')" 401 \
  "audit RPC denied to anon, so PostgREST is not a second path"

echo
echo "== XSS pair =="
check xss-001  "$(curl -s "$APP/p/lampshade/rich"  | grep -c 'data-html-probe')" 1 "/rich renders stored HTML as markup"
check ctl-xss-001 "$(curl -s "$APP/p/lampshade/plain" | grep -c '&lt;span data-html-probe')" 1 "/plain escapes the same stored field"

echo
echo "== cookie diagnostic (measures the CLIENT, not the target) =="
sec=$(curl -sD - -o /dev/null -X POST "$APP/api/session/secure-flag" | grep -ic 'set-cookie:.*secure')
pln=$(curl -sD - -o /dev/null -X POST "$APP/api/session/plain-flag" | grep -c -i 'set-cookie: bl_plain')
check ctl-cookie-001 "$sec" 1 "secure-flag sets a cookie carrying the Secure attribute"
check ctl-cookie-001b "$pln" 1 "plain-flag sets the same cookie without it"

echo
echo "== UI-state honesty (defect / control pairs) =="
check ui-006  "$(code "$APP/_next/static/chunks/analytics.7f3a91c4.js")" 404 "ui-006 referenced chunk 404s"
check ctl-qa-005 "$(code "$APP/qa/present.js")" 200 "ctl-qa-005 referenced script resolves"
for p in stale fresh silent-save honest-save deep-link deep-link-ok back-trap back-ok dead-chunk live-chunk; do
  c=$(code "$APP/qa/$p")
  [ "$c" = "200" ] || bad qa "/qa/$p returned $c"
done
ok qa "all ten /qa/* defect and control routes serve"
# the save endpoint fails for BOTH ui-003 and its control; only the UI differs
check ui-003 "$(code -X POST "$APP/api/qa/save" -H 'Content-Type: application/json' -d '{"value":"x"}')" 500 \
  "shared save endpoint returns 500 for the defect and the control alike"
curl -s "$APP/qa/deep-link" | grep -q 'id="deep-link-content"></div>' \
  && ok ui-004 "cold load of /qa/deep-link renders an empty shell" \
  || bad ui-004 "deep-link shell not empty on a cold load"

echo
echo "== UI-state pairs (browser; HTTP cannot see these) =="
uiout=$(node infra/ui-check.mjs "$APP" 2>&1); uirc=$?
case $uirc in
  0) echo "$uiout" | sed 's/^/  /'; pass=$((pass+1)) ;;
  2) echo "  skip   ui-state pairs (no browser available)" ;;
  *) echo "$uiout" | sed 's/^/  /'; fail=$((fail+1)) ;;
esac

echo
echo "== performance (PERF_MODE=$(curl -s "$APP/__manifest" | python3 -c 'import sys,json;print(json.load(sys.stdin)["modes"]["perf"])' 2>/dev/null)) =="
PM=$(curl -s "$APP/__manifest" | python3 -c 'import sys,json;print(json.load(sys.stdin)["modes"]["perf"])' 2>/dev/null)
if [ "$PM" = "on" ]; then
  enc_bad=$(curl -sD - -o /dev/null -H 'Accept-Encoding: gzip' "$APP/api/perf/uncompressed" | grep -ic 'content-encoding: gzip')
  enc_ok=$(curl -sD - -o /dev/null -H 'Accept-Encoding: gzip' "$APP/api/perf/fast" | grep -ic 'content-encoding: gzip')
  check perf-001 "$enc_bad" 0 "perf-001 large text served uncompressed"
  check ctl-perf-001 "$enc_ok" 1 "ctl-perf-001 comparable text IS gzipped"
  b1=$(curl -s -H 'Accept-Encoding: identity' "$APP/api/perf/uncompressed" | wc -c | tr -d ' ')
  b2=$(curl -s -H 'Accept-Encoding: identity' "$APP/api/perf/fast" | wc -c | tr -d ' ')
  check perf-001b "$b1" "$b2" "both bodies identical in size, so compression is the only variable"

  check perf-002 "$(curl -sD - -o /dev/null "$APP/api/perf/no-validator" | grep -icE '^(cache-control|etag|last-modified)')" 0 \
    "perf-002 no validator and no cache headers"
  check ctl-perf-002 "$(curl -sD - -o /dev/null "$APP/api/perf/fast" | grep -icE '^(cache-control|etag)')" 2 \
    "ctl-perf-002 has ETag and immutable max-age"
  et=$(curl -sD - -o /dev/null "$APP/api/perf/fast" | grep -i '^etag' | tr -d '\r' | awk '{print $2}')
  check ctl-perf-002b "$(code -H "If-None-Match: $et" "$APP/api/perf/fast")" 304 "ctl-perf-002 revalidates to 304"

  check perf-003 "$(curl -s "$APP/perf/requests" | grep -o 'dot\.png?v=[0-9]*' | sort -u | wc -l | tr -d ' ')" 60 \
    "perf-003 60 distinct cache-busted requests"
  sz=$(curl -s -o /dev/null -w '%{size_download}' "$APP/perf/hero-oversized.png")
  [ "$sz" -gt 3000000 ] && ok perf-004 "perf-004 hero image is ${sz} bytes" || bad perf-004 "hero image only ${sz} bytes"

  t=$(curl -s -o /dev/null -w '%{time_starttransfer}' "$APP/perf/slow")
  awk -v t="$t" 'BEGIN{exit !(t>=3.0)}' \
    && ok perf-005 "perf-005 TTFB ${t}s meets the 3s floor (a floor, not a measurement)" \
    || bad perf-005 "TTFB ${t}s is below the declared 3s floor"
  tf=$(curl -s -o /dev/null -w '%{time_starttransfer}' "$APP/perf/fast")
  awk -v t="$tf" 'BEGIN{exit !(t<1.0)}' \
    && ok ctl-perf-003 "ctl-perf-003 control page TTFB ${tf}s" || bad ctl-perf-003 "control page slow: ${tf}s"
else
  check perf-gate "$(code "$APP/perf/slow")" 404 "PERF_MODE=off: /perf/* is 404 and cannot slow a crawl"
  echo "  skip   perf fixtures (set PERF_MODE=on in .env to enable)"
fi

echo
echo "== NOT YET BUILT (see end of MANIFEST.md) =="
grep -rq 'dangerouslySetInnerHTML' web/src && echo "  ready  xss         sink present" || echo "  todo   xss         no reflect/escape pair exists"
echo "  ready  interaction gated by DISCOVERY_MODE (see ./dial-sweep.sh discovery)"

echo
echo "-------------------------------------------"
printf "  %d passed, %d failed\n" "$pass" "$fail"
[ "$fail" -eq 0 ] && echo "  manifest matches the running stack." || echo "  MANIFEST.md IS OUT OF DATE."
exit $((fail > 0))
