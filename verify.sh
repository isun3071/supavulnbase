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
SB=${SB:-http://localhost:8055}
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
SVC=$(grep '^SERVICE_ROLE_KEY=' .env | cut -d= -f2-)

pass=0; fail=0
ok()   { printf "  \033[32mPASS\033[0m  %-11s %s\n" "$1" "$2"; pass=$((pass+1)); }
bad()  { printf "  \033[31mFAIL\033[0m  %-11s %s\n" "$1" "$2"; fail=$((fail+1)); }
check(){ [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 (got '$2', want '$3')"; }

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
check rls-001 "$(rows "$SB/rest/v1/projects?select=id")"  7 "projects readable anonymously"
check rls-002 "$(rows "$SB/rest/v1/updates?select=id")"  13 "updates readable anonymously"

AID=$(curl -s "$SB/rest/v1/profiles?select=id&username=eq.ada" -H "apikey: $ANON" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
c=$(code -X POST "$SB/rest/v1/projects" -H "apikey: $ANON" -H 'Content-Type: application/json' \
     -d "{\"user_id\":\"$AID\",\"title\":\"VERIFY PROBE\",\"slug\":\"verify-probe-tmp\"}")
check rls-001w "$c" 201 "anonymous INSERT into projects"
curl -s -o /dev/null -X DELETE "$SB/rest/v1/projects?slug=eq.verify-probe-tmp" -H "apikey: $SVC" -H "Authorization: Bearer $SVC"

check rls-003 "$(rows "$SB/rest/v1/sponsor_leads?select=id" "$ADA")" 6 "permissive policy: ada reads all 6 leads"
check rls-003a "$(rows "$SB/rest/v1/sponsor_leads?select=id")"       0 "...but not anonymously"

c=$(code -X POST "$SB/rest/v1/drafts" -H "apikey: $ANON" -H 'Content-Type: application/json' \
     -d "{\"user_id\":\"$AID\",\"body\":\"VERIFY FORGED\"}")
check rls-004 "$c" 201 "anonymous INSERT forges a draft"
curl -s -o /dev/null -X DELETE "$SB/rest/v1/drafts?body=eq.VERIFY%20FORGED" -H "apikey: $SVC" -H "Authorization: Bearer $SVC"

check storage-001 "$(code "$SB/storage/v1/object/public/project-media/lampshade/screenshot.txt")" 200 "public bucket serves anonymously"
check admin-001   "$(code "$APP/api/admin/export")" 200 "unlinked admin export, no credentials"
check info-001    "$(code "$SB/rest/v1/" -H "apikey: $ANON")" 200 "OpenAPI root discloses schema"

n=$(curl -s "$APP/api/projects/search?q=zzznomatch%25,id.not.is.null,title.ilike.%25zzznomatch" | grep -o '"count":[0-9]*' | cut -d: -f2)
check inj-001 "$n" 7 "filter injection returns all rows for a non-matching term"

curl -s -X POST "$APP/api/feedback" -H 'Content-Type: application/json' -d '{}' | grep -q renderTemplate \
  && ok tmpl-001 "empty POST leaks the body-only field name" || bad tmpl-001 "renderTemplate not in the Zod error"

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
check ctl-002 "$(rows "$SB/rest/v1/profiles?select=id")" 4 "profiles readable (public directory, intended)"
curl -s -o /dev/null -X PATCH "$SB/rest/v1/profiles?username=eq.grace" -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"bio":"VERIFY TAMPER"}'
curl -s "$SB/rest/v1/profiles?select=bio&username=eq.grace" -H "apikey: $ANON" | grep -q 'VERIFY TAMPER' \
  && bad ctl-002 "anonymous profile write PERSISTED - RLS broken" || ok ctl-002 "anon profile write changed nothing (204 lies)"

check ctl-009 "$(rows "$SB/rest/v1/payout_accounts?select=id" "$ADA")" 1 "ada sees only her own payout account"
check ctl-009a "$(rows "$SB/rest/v1/payout_accounts?select=id")"       0 "payout accounts invisible anonymously"
check ctl-010 "$(code "$SB/storage/v1/object/public/payout-documents/ada/remittance-2026-06.txt")" 400 "private bucket denies anonymous read"

DID=$(curl -s "$SB/rest/v1/drafts?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $ADA" | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | head -1)
curl -s -o /dev/null -X PATCH "$SB/rest/v1/drafts?id=eq.$DID" -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"body":"VERIFY TAMPER"}'
curl -s "$SB/rest/v1/drafts?select=body" -H "apikey: $ANON" -H "Authorization: Bearer $ADA" | grep -q 'VERIFY TAMPER' \
  && bad ctl-013 "drafts UPDATE was exploitable - write gap wider than documented" \
  || ok ctl-013 "drafts UPDATE policy is inert as documented"

for p in .env .git/config package.json; do
  a=$(code "$ORIGIN/$p"); b=$(code "$APP/$p")
  [ "$a" = "404" ] && [ "$b" = "404" ] && ok ctl-005 "/$p not served at either prefix" || bad ctl-005 "/$p exposed (origin=$a app=$b)"
done
check ctl-006 "$(code "$APP/definitely-not-a-real-page")" 404 "unknown route returns a real 404"

# proxy control: no DB in the path, but flaky by design
codes=$(for i in $(seq 1 20); do curl -s -o /dev/null -w '%{http_code} ' --get --data-urlencode 'p=x' "$APP/api/integrations/ping"; done)
n5=$(echo "$codes" | tr ' ' '\n' | grep -c '^500$'); n4=$(echo "$codes" | tr ' ' '\n' | grep -c '^429$')
[ "$((n5+n4))" -gt 0 ] && ok ctl-012 "proxy route returns intermittent 500/429 (${n5}x500 ${n4}x429 of 20)" \
                       || bad ctl-012 "proxy route never failed - flakiness gone"
check ctl-012b "$(grep -c 'supabase' web/src/app/api/integrations/ping/route.ts)" 0 "proxy route has no database in the path"

echo
echo "== NOT YET BUILT (expected to fail; see end of MANIFEST.md) =="
m=$(code "$ORIGIN/__manifest"); [ "$m" = "200" ] && echo "  ready  __manifest  served" || echo "  todo   __manifest  not implemented (HTTP $m)"
grep -rq 'dangerouslySetInnerHTML' web/src && echo "  ready  xss        sink present" || echo "  todo   xss        no reflect/escape pair exists"

echo
echo "-------------------------------------------"
printf "  %d passed, %d failed\n" "$pass" "$fail"
[ "$fail" -eq 0 ] && echo "  manifest matches the running stack." || echo "  MANIFEST.md IS OUT OF DATE."
exit $((fail > 0))
