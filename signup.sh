#!/usr/bin/env bash
# Switch the registration failure mode on the vulnerable target (:8090).
#
#   ./signup.sh normal        canonical: linked, works, grants a session
#   ./signup.sh interaction   no route, no link; form only after a click
#   ./signup.sh unlabeled     submit blocked by an unlabelled required input
#   ./signup.sh login-only    homepage is login; /signup linked from nowhere
#   ./signup.sh confirm       CONTROL: succeeds, grants no session
#   ./signup.sh sso           CONTROL: no self-registration at all
#
# confirm and sso also reconfigure GoTrue, so the auth container restarts.
set -uo pipefail
cd "$(dirname "$0")"
M=${1:-normal}
case "$M" in normal|interaction|unlabeled|login-only|confirm|sso) ;;
  *) echo "unknown mode: $M"; exit 2 ;; esac

setenv(){ grep -q "^$1=" .env && sed -i "s|^$1=.*|$1=$2|" .env || echo "$1=$2" >> .env; }
setenv SIGNUP_MODE "$M"
[ "$M" = "confirm" ] && setenv SIGNUP_AUTOCONFIRM false || setenv SIGNUP_AUTOCONFIRM true
[ "$M" = "sso" ]     && setenv SIGNUP_DISABLED true     || setenv SIGNUP_DISABLED false

echo "SIGNUP_MODE=$M"
docker compose build web >/tmp/signup-build.log 2>&1 || { echo "BUILD FAILED"; tail -12 /tmp/signup-build.log; exit 1; }
docker compose up -d --force-recreate auth >/dev/null 2>&1
docker compose up -d web >/dev/null 2>&1
for _ in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://localhost:8090/app)" = "200" ] && break; sleep 3
done
echo "  /app/signup       -> $(curl -s -o /dev/null -w '%{http_code}' http://localhost:8090/app/signup)"
echo "  signup linked?    -> $(curl -s http://localhost:8090/app | grep -c 'href="/app/signup"')"
echo "  ready: http://localhost:8090/app"
