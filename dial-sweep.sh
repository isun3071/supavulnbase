#!/usr/bin/env bash
# Sweeps the dials and checks each mode behaves as MANIFEST.md declares.
# The comparison across modes IS the fixture, so CI must run this, not just
# ./verify.sh against one mode.
#
#   ./dial-sweep.sh rls          three RLS modes (fast: no image rebuild)
#   ./dial-sweep.sh discovery    four discovery modes (slow: rebuilds the image)
#   ./dial-sweep.sh all
#
# Leaves the stack on the canonical mode when it finishes.

set -uo pipefail
cd "$(dirname "$0")"

SB=${SB:-http://localhost:8055}
APP=${APP:-http://localhost:8090/app}
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
fail=0
ok(){ printf "    \033[32mPASS\033[0m %s\n" "$1"; }
bad(){ printf "    \033[31mFAIL\033[0m %s\n" "$1"; fail=$((fail+1)); }

jwt(){ curl -s -X POST "$SB/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada.demo@buildlog.test","password":"demo-password-123"}' \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4; }
rows(){ curl -s "$1" -H "apikey: $ANON" ${2:+-H "Authorization: Bearer $2"} | grep -o '"id"' | wc -l | tr -d ' '; }

set_mode(){ # key value
  sed -i "s/^$1=.*/$1=$2/" .env
}

sweep_rls(){
  echo "== RLS dial =="
  for m in off permissive correct; do
    set_mode RLS_MODE "$m"
    docker compose up -d --force-recreate migrate >/dev/null 2>&1
    # migrate is one-shot; wait for it to exit before probing
    for _ in $(seq 1 30); do
      [ "$(docker inspect -f '{{.State.Running}}' "$(docker compose ps -aq migrate)" 2>/dev/null)" = "false" ] && break
      sleep 1
    done
    docker compose up -d web >/dev/null 2>&1; sleep 3
    ADA=$(jwt)
    AID=$(echo "$ADA" | cut -d. -f2 | base64 -d 2>/dev/null | grep -o '"sub":"[^"]*"' | cut -d'"' -f4)
    anon=$(rows "$SB/rest/v1/bookmarks?select=id")
    vis=$(rows "$SB/rest/v1/bookmarks?select=id" "$ADA")
    own=$(rows "$SB/rest/v1/bookmarks?select=id&user_id=eq.$AID" "$ADA")
    printf "  RLS_MODE=%-11s anon=%-3s ada_sees=%-3s ada_owns=%s\n" "$m" "$anon" "$vis" "$own"
    case "$m" in
      off)        [ "$anon" -gt 0 ] && ok "world readable with the anon key" || bad "expected anonymous read" ;;
      permissive) { [ "$anon" -eq 0 ] && [ "$vis" -gt "$own" ]; } \
                    && ok "anon blocked, but any signed-in user reads every row" \
                    || bad "expected anon=0 and ada_sees > ada_owns" ;;
      correct)    { [ "$anon" -eq 0 ] && [ "$vis" = "$own" ]; } \
                    && ok "owner-scoped: ada sees exactly her own" \
                    || bad "expected anon=0 and ada_sees == ada_owns" ;;
    esac
    # the app-layer route must leak in EVERY rls mode, including correct
    c=$(curl -s -o /dev/null -w '%{http_code}' "$APP/api/bookmarks/all")
    [ "$c" = "200" ] && ok "dial-disc-001 still leaks (independent of RLS)" \
                     || bad "export route returned $c"
  done
  set_mode RLS_MODE off
}

sweep_discovery(){
  echo "== Discovery dial =="
  for m in linked bundle interaction concatenated; do
    set_mode DISCOVERY_MODE "$m"
    docker compose build web >/dev/null 2>&1
    docker compose up -d web >/dev/null 2>&1; sleep 6
    html=$(curl -s "$APP/bookmarks")
    cid=$(docker compose ps -q web)
    tmp=$(mktemp -d); docker cp "$cid":/app/.next/static "$tmp/" >/dev/null 2>&1
    inhtml=$(echo "$html" | grep -c 'api/bookmarks/all')
    injs=$(grep -rl 'api/bookmarks/all' "$tmp" 2>/dev/null | wc -l | tr -d ' ')
    rm -rf "$tmp"
    printf "  DISCOVERY_MODE=%-13s in_html=%s in_bundle=%s\n" "$m" "$inhtml" "$injs"
    case "$m" in
      linked)       [ "$inhtml" -gt 0 ] && ok "path is in the served HTML" || bad "expected an anchor in the HTML" ;;
      bundle)       { [ "$inhtml" -eq 0 ] && [ "$injs" -gt 0 ]; } \
                      && ok "absent from HTML, present as a bundle literal" \
                      || bad "expected html=0 bundle>0" ;;
      interaction)  { [ "$inhtml" -eq 0 ] && [ "$injs" -eq 0 ]; } \
                      && ok "absent from both; only a click reveals it" \
                      || bad "expected html=0 bundle=0" ;;
      concatenated) { [ "$inhtml" -eq 0 ] && [ "$injs" -eq 0 ]; } \
                      && ok "no whole path anywhere; assembled from fragments" \
                      || bad "expected html=0 bundle=0" ;;
    esac
    # the finding itself never changes
    c=$(curl -s -o /dev/null -w '%{http_code}' "$APP/api/bookmarks/all")
    [ "$c" = "200" ] && ok "finding identical in this mode" || bad "export route returned $c"
  done
  set_mode DISCOVERY_MODE linked
  docker compose build web >/dev/null 2>&1
  docker compose up -d web >/dev/null 2>&1
}

case "${1:-all}" in
  rls) sweep_rls ;;
  discovery) sweep_discovery ;;
  *) sweep_rls; sweep_discovery ;;
esac

echo
[ "$fail" -eq 0 ] && echo "dial sweep clean" || echo "dial sweep: $fail failure(s)"
exit $((fail > 0))
