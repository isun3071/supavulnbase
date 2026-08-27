#!/usr/bin/env bash
# independent.sh — prove findings from BELOW the app and the checker.
#
# verify.sh proves the fixture matches the answer key I wrote. The author and
# the checker are the same hand, so their agreement is consistency, not truth:
# a shared wrong assumption passes green. This script deliberately shares NO
# logic with the app or with verify.sh. It reads lower layers that have never
# heard of MANIFEST.md and cannot encode its assumptions:
#
#   - Postgres system catalogs   (pg_class, pg_policies, grants, storage.buckets)
#   - the JWT tokens' own claims  (base64 of the payload)
#   - the bytes of the compiled JS bundle   (grep)
#   - raw HTTP response headers and served files
#
# Every line prints the raw evidence, so you audit the oracle, not me.
#
# SCOPE HONESTY: this reaches the findings that a lower layer can testify to.
# It is independent of the CHECKER, not of the AUTHOR. The schema and bundle are
# still mine. For author-independence run a third-party scanner (Rung 2, e.g.
# gitleaks/semgrep) or a blind auditor (Rung 3, e.g. the Sloptic grader). Entries
# that need a non-canonical dial, or that are behavioural/source-review only, are
# listed at the end as out of this script's reach by design.

set -uo pipefail
cd "$(dirname "$0")"
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
SVC=$(grep '^SERVICE_ROLE_KEY=' .env | cut -d= -f2-)
SB=${SB:-http://localhost:8055}
APP=${APP:-http://localhost:8090/app}

DB(){ docker compose exec -T db psql -U postgres -d postgres -At -c "$1" 2>/dev/null; }
pass=0
ok(){ printf "  \033[32mPROVEN\033[0m %-13s %s\n" "$1" "$2"; pass=$((pass+1)); }
no(){ printf "  \033[31m  ??  \033[0m %-13s %s\n" "$1" "$2"; }

echo "== oracle 1: Postgres system catalogs (a layer beneath PostgREST and the app) =="
for t in projects updates; do
  r=$(DB "select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='$t'")
  [ "$r" = "f" ] && ok "rls($t)" "pg_class.relrowsecurity=false -> RLS never enabled" || no "rls($t)" "relrowsecurity=$r"
done
g=$(DB "select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='projects' and grantee='anon' and privilege_type='INSERT'")
[ "$g" = "1" ] && ok "rls-001" "anon holds INSERT grant on projects -> anonymous write is real" || no "rls-001" "anon INSERT grant=$g"
q=$(DB "select qual from pg_policies where tablename='sponsor_leads' and cmd='SELECT'")
echo "$q" | grep -q "auth.role()" && ok "rls-003" "sponsor_leads SELECT qual = [$q] -> role check, not owner check" || no "rls-003" "qual=[$q]"
w=$(DB "select with_check from pg_policies where tablename='drafts' and cmd='INSERT'")
echo "$w" | grep -qx "true" && ok "rls-004" "drafts INSERT with_check=true -> unpoliced insert" || no "rls-004" "with_check=[$w]"
b=$(DB "select public from storage.buckets where id='project-media'")
[ "$b" = "t" ] && ok "storage-001" "storage.buckets.public=true for project-media" || no "storage-001" "public=$b"
bp=$(DB "select public from storage.buckets where id='payout-documents'")
[ "$bp" = "f" ] && ok "ctl-010" "payout-documents public=false -> correctly private" || no "ctl-010" "public=$bp"
qc=$(DB "select qual from pg_policies where tablename='profiles' and cmd='UPDATE'")
echo "$qc" | grep -q "auth.uid() = id" && ok "ctl-002" "profiles UPDATE qual = [$qc] -> owner-scoped, correct" || no "ctl-002" "qual=[$qc]"
qp=$(DB "select count(*) from pg_policies where tablename='payout_accounts' and qual like '%auth.uid() = user_id%'")
[ "${qp:-0}" -ge 1 ] && ok "ctl-009" "payout_accounts policies compare auth.uid()=user_id -> correct" || no "ctl-009" "owner-scoped policies=$qp"

echo
echo "== oracle 2: the JWT tokens' own decoded claims (base64, no server involved) =="
ar=$(echo "$ANON" | cut -d. -f2 | base64 -d 2>/dev/null | grep -o '"role":"[^"]*"')
sr=$(echo "$SVC"  | cut -d. -f2 | base64 -d 2>/dev/null | grep -o '"role":"[^"]*"')
[ "$ar" = '"role":"anon"' ] && ok "ctl-001" "anon key decodes to $ar -> public by design" || no "ctl-001" "$ar"
[ "$sr" = '"role":"service_role"' ] && ok "key-001(id)" "the other key decodes to $sr -> RLS bypass" || no "key-001" "$sr"

echo
echo "== oracle 3: the bytes of the compiled JS bundle (grep, no app logic) =="
CID=$(docker compose ps -q web); B=$(mktemp -d); docker cp "$CID":/app/.next/static "$B/" >/dev/null 2>&1
inb(){ grep -rlF "$1" "$B" 2>/dev/null | wc -l | tr -d ' '; }
[ "$(inb "$SVC")" -ge 1 ] && ok "key-001" "service_role JWT present in $(inb "$SVC") shipped chunk(s)" || no "key-001" "absent"
[ "$(inb 'sk-proj-')" -ge 1 ] && ok "key-002" "sk-proj- key present in the bundle" || no "key-002" "absent"
[ "$(inb "$ANON")" -ge 1 ] && ok "ctl-001b" "anon key ALSO in the bundle (the harmless twin)" || no "ctl-001b" "absent"
[ "$(inb 'BuildLog drafting assistant')" -ge 1 ] && ok "llm-001" "full system prompt present as a literal" || no "llm-001" "absent"
[ "$(inb 'support PIN')" -ge 1 ] && ok "llm-002" "synthetic PII (support PIN) present in the prompt" || no "llm-002" "absent"
[ "$(inb '/api/admin/export')" -ge 1 ] && ok "admin-001" "unlinked /api/admin/export string present in the bundle" || no "admin-001" "absent"
for d in pk_test_ asst_ prj_ dpl_; do [ "$(inb "$d")" -ge 1 ] && ok "ctl-011($d)" "public identifier $d present (must-not-flag)" || no "ctl-011($d)" absent; done
[ "$(find "$B" -name '*.map' | wc -l | tr -d ' ')" = "0" ] && ok "ctl-004" "0 source maps in the shipped output" || no "ctl-004" "source maps present"
rm -rf "$B"

echo
echo "== oracle 4: raw HTTP headers and served files (read the wire, not the app) =="
h=$(curl -sD - -o /dev/null "$APP" | tr 'A-Z' 'a-z')
echo "$h" | grep -q '^content-security-policy:' || ok "hdr-001" "no Content-Security-Policy header on /app"
echo "$h" | grep -q '^x-powered-by:' && ok "hdr-002" "x-powered-by header present (framework disclosure)"
echo "$(curl -sD - -o /dev/null "$SB/rest/v1/projects?select=id&limit=1" -H "apikey: $ANON")" | grep -qi '^server: postgrest' && ok "hdr-003" "Server: postgrest/... banner on the data API"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$APP/.env")" = "200" ] && curl -s "$APP/.env" | grep -q JWT_SECRET && ok "probe-001" "/app/.env serves a file containing JWT_SECRET" || no "probe-001" "not served"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$APP/.git/config")" = "200" ] && ok "probe-002" "/app/.git/config is served" || no "probe-002" "not served"
[ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8090/.env)" = "404" ] && ok "ctl-005" "/.env at the ORIGIN is 404 (subpath trap intact)" || no "ctl-005" "served at origin"

echo
echo "-------------------------------------------------------------"
echo "  $pass entries proven from below the app, independent of verify.sh."
echo
echo "  Out of this script's reach BY DESIGN (need a different independence source):"
echo "    - rls-002/005, authz-001/002/003, inj-001, tmpl-001, xss-001, sum-001,"
echo "      auth-001/002, cookie-001, info-001/002, admin-001(behaviour), the ui-*"
echo "      and perf-* and signup-* families: behavioural or mode-gated. Prove these"
echo "      with verify.sh + ui-check.mjs in their modes (self-consistency), OR with"
echo "      a third-party scanner / blind grader (author-independent)."
echo "    - err-001: source-review only. Read the 13 discard sites."
