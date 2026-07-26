#!/usr/bin/env bash
# Brings up the hardened reference with exactly ONE flaw class fixed, then
# proves the diff is minimal: that class's findings must be gone, and every
# other class must still reproduce.
#
#   ./harden.sh authz         fix only the app-layer authorization class
#   ./harden.sh all           fix everything (expect the declared residual)
#   ./harden.sh none          sanity: behaves like the vulnerable target
#   ./harden.sh --sweep       every class in turn, reporting the differential
#
# The vulnerable target stays up on :8090 throughout, so the two can be
# compared side by side.
#
#   vulnerable : http://localhost:8090/app
#   hardened   : http://localhost:8092/app     (Supabase on :8093)

set -uo pipefail
cd "$(dirname "$0")"

CLASSES=(rls secrets authz injection headers auth qa perf)
VULN=${VULN:-http://localhost:8090/app}
HARD=${HARD:-http://localhost:8092/app}
HARD_SB=${HARD_SB:-http://localhost:8093}
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
SVC=$(grep '^SERVICE_ROLE_KEY=' .env | cut -d= -f2-)

setenv(){ grep -q "^$1=" .env && sed -i "s|^$1=.*|$1=$2|" .env || echo "$1=$2" >> .env; }
code(){ curl -s -o /dev/null -m 20 -w '%{http_code}' "$@"; }
hjwt(){ curl -s -X POST "$HARD_SB/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada.demo@buildlog.test","password":"demo-password-123"}' \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4; }
hrows(){ curl -s "$HARD_SB/rest/v1/$1" -H "apikey: $ANON" ${2:+-H "Authorization: Bearer $2"} \
  | grep -o '"id"' | wc -l | tr -d ' '; }

bring_up(){ # class
  local c=$1
  setenv HARDEN_CLASS "$c"
  # Values compose cannot branch on. `secrets` withholds the two keys at BUILD
  # time so they are never inlined; `auth` tightens GoTrue configuration.
  if [ "$c" = "secrets" ] || [ "$c" = "all" ]; then
    setenv HARDENED_SERVICE_KEY ""
    setenv HARDENED_OPENAI_KEY ""
  else
    setenv HARDENED_SERVICE_KEY "$SVC"
    setenv HARDENED_OPENAI_KEY "$(grep '^NEXT_PUBLIC_FAKE_OPENAI_KEY=' .env | cut -d= -f2-)"
  fi
  if [ "$c" = "auth" ] || [ "$c" = "all" ]; then
    # 20/minute, not 5. The limit has to stop credential stuffing WITHOUT
    # making the target unusable: at 5 a grader that logs in a few times while
    # crawling gets locked out and every authed route becomes unreachable,
    # which destroys the differential for reasons that look like the target's
    # fault. The auth probe sends 30 attempts, so it still trips.
    setenv HARDENED_RATE_LIMIT 20
    setenv HARDENED_PW_MIN_LENGTH 12
    setenv HARDENED_PW_REQUIRED_CHARS "abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789"
  else
    setenv HARDENED_RATE_LIMIT 150
    setenv HARDENED_PW_MIN_LENGTH 6
    setenv HARDENED_PW_REQUIRED_CHARS ""
  fi

  echo "  building HARDEN_CLASS=$c ..."
  if ! docker compose --profile hardened build hardened-web >/tmp/harden-build.log 2>&1; then
    echo "  BUILD FAILED — see /tmp/harden-build.log"; tail -12 /tmp/harden-build.log; return 1
  fi
  # migrate applies (or reverts) the rls overlay; harden-storage sets the bucket
  # flag in both directions. Both are one-shot, so force them to re-run — the
  # database volume persists across class switches.
  docker compose --profile hardened up -d --force-recreate hardened-migrate >/dev/null 2>&1
  docker compose --profile hardened up -d >/dev/null 2>&1
  docker compose --profile hardened up -d --force-recreate hardened-harden-storage >/dev/null 2>&1
  for _ in $(seq 1 60); do
    [ "$(code "$HARD")" = "200" ] && return 0
    sleep 3
  done
  echo "  hardened target never came up"; return 1
}

# Each probe prints FIXED or PRESENT for one class against the hardened target.
probe(){ # class -> echoes "FIXED"/"PRESENT"
  case "$1" in
    rls)
      # NOT a read check: the project feed is public by design in both builds,
      # so SELECT returning rows proves nothing.
      #
      # Two independent signals, because either alone is misleading:
      #   write  anonymous INSERT into public.projects (rls-001)
      #   read   an authenticated user seeing MORE sponsor leads than they own
      #          (rls-003). Checking anon reads of sponsor_leads is useless —
      #          auth.role()='authenticated' is false for anon, so it returns
      #          zero rows in the vulnerable build too.
      #
      # The slug must be unique per call and cleaned up. Using $$ made it
      # constant for the whole script run, so after the first successful insert
      # every later one hit the UNIQUE constraint and returned 409, which the
      # probe misread as "fixed".
      local aid w tok vis own slug
      slug="harden-probe-$(od -An -N4 -tx4 /dev/urandom | tr -d ' ')"
      aid=$(curl -s -m 20 "$HARD_SB/rest/v1/profiles?select=id&username=eq.ada" -H "apikey: $ANON" \
            | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
      w=$(curl -s -o /dev/null -m 20 -w '%{http_code}' -X POST "$HARD_SB/rest/v1/projects" \
          -H "apikey: $ANON" -H 'Content-Type: application/json' \
          -d "{\"user_id\":\"$aid\",\"title\":\"probe\",\"slug\":\"$slug\"}")
      curl -s -o /dev/null -m 20 -X DELETE "$HARD_SB/rest/v1/projects?slug=eq.$slug" \
        -H "apikey: $SVC" -H "Authorization: Bearer $SVC"
      tok=$(hjwt)
      vis=$(hrows "sponsor_leads?select=id" "$tok")
      own=$(hrows "sponsor_leads?select=id&user_id=eq.$aid" "$tok")
      { [ "$w" != "201" ] && [ "$vis" = "$own" ]; } && echo FIXED || echo PRESENT ;;
    secrets)
      local e; e=$(code "$HARD/.env")
      local cid; cid=$(docker compose --profile hardened ps -q hardened-web)
      local tmp; tmp=$(mktemp -d)
      docker cp "$cid":/app/.next/static "$tmp/" >/dev/null 2>&1
      local k; k=$(grep -rlF "$SVC" "$tmp" 2>/dev/null | wc -l | tr -d ' ')
      rm -rf "$tmp"
      { [ "$e" = "404" ] && [ "$k" = "0" ]; } && echo FIXED || echo PRESENT ;;
    authz)
      local a; a=$(code "$HARD/api/admin/export")
      [ "$a" = "401" ] && echo FIXED || echo PRESENT ;;
    injection)
      local n; n=$(curl -s -m 20 "$HARD/api/projects/search?q=zzznomatch%25,id.not.is.null,title.ilike.%25zzznomatch" \
        | grep -o '"count":[0-9]*' | cut -d: -f2)
      [ "${n:-9}" = "0" ] && echo FIXED || echo PRESENT ;;
    headers)
      local h; h=$(curl -sD - -o /dev/null -m 20 "$HARD" | tr 'A-Z' 'a-z' | grep -c '^content-security-policy:')
      [ "$h" = "1" ] && echo FIXED || echo PRESENT ;;
    auth)
      local codes; codes=$(for _ in $(seq 1 30); do curl -s -o /dev/null -m 20 -w '%{http_code} ' \
        -X POST "$HARD_SB/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
        -H 'Content-Type: application/json' -d '{"email":"ada.demo@buildlog.test","password":"wrong"}'; done)
      echo "$codes" | grep -q 429 && echo FIXED || echo PRESENT ;;
    qa)
      # The deep-link and stale-list defects are client-side and invisible to a
      # plain HTTP fetch, so the probe uses the one QA defect with a
      # server-rendered signal: which script src the page emits.
      curl -s -m 20 "$HARD/qa/dead-chunk" | grep -q 'analytics.7f3a91c4.js' && echo PRESENT || echo FIXED ;;
    perf)
      local enc; enc=$(curl -sD - -o /dev/null -m 20 -H 'Accept-Encoding: gzip' "$HARD/api/perf/uncompressed" \
        | grep -ic 'content-encoding: gzip')
      [ "$enc" = "1" ] && echo FIXED || echo PRESENT ;;
  esac
}

report(){ # target class
  local target=$1 fail=0
  echo "  class        expected   actual"
  for c in "${CLASSES[@]}"; do
    local want actual
    if [ "$target" = "all" ] || [ "$c" = "$target" ]; then want=FIXED; else want=PRESENT; fi
    actual=$(probe "$c")
    if [ "$want" = "$actual" ]; then
      printf "  \033[32m%-12s %-10s %s\033[0m\n" "$c" "$want" "$actual"
    else
      printf "  \033[31m%-12s %-10s %s   <-- diff is not minimal\033[0m\n" "$c" "$want" "$actual"
      fail=1
    fi
  done
  return $fail
}

TARGET=${1:-all}

if [ "$TARGET" = "--sweep" ]; then
  rc=0
  for c in "${CLASSES[@]}"; do
    echo; echo "=== HARDEN_CLASS=$c ==="
    bring_up "$c" || { rc=1; continue; }
    report "$c" || rc=1
  done
  echo; echo "=== restoring HARDEN_CLASS=all ==="
  bring_up all >/dev/null 2>&1
  [ $rc -eq 0 ] && echo "sweep clean: every class is a minimal diff" || echo "sweep found non-minimal diffs"
  exit $rc
fi

echo "=== HARDEN_CLASS=$TARGET ==="
bring_up "$TARGET" || exit 1
echo "  vulnerable: $VULN"
echo "  hardened:   $HARD"
if [ "$TARGET" = "none" ]; then
  echo "  (sanity mode: every class should read PRESENT)"
  report "__none__"
else
  report "$TARGET"
fi
