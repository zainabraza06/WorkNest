#!/usr/bin/env bash
# Post-deploy smoke test: does the thing that is actually running behave like production?
#
#   scripts/smoke-test.sh https://worknest-qicp.onrender.com [https://work-nest-z.vercel.app]
#
# Exits non-zero on the first failed check, so it can gate a pipeline or a release. It is
# read-only: it registers nothing and writes nothing.
set -uo pipefail

API="${1:?usage: smoke-test.sh <api-origin> [web-origin]}"
WEB="${2:-}"
API="${API%/}"
FAILED=0

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAILED=1; }
check() { # check "<description>" <command...>
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then pass "$desc"; else fail "$desc"; fi
}

# A cold Render instance takes ~50s to wake; give the first request room and retry
fetch() { curl -sS --max-time 90 --retry 3 --retry-delay 5 --retry-all-errors "$@"; }
headers() { fetch -o /dev/null -D - "$@" | tr -d '\r'; }

echo "API: $API"

echo "Availability"
check "liveness answers 200"        bash -c "[ \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 90 --retry 3 --retry-all-errors '$API/api/health/live')\" = 200 ]"
READY=$(fetch "$API/api/health/ready")
echo "$READY" | grep -q '"db":"connected"' && pass "readiness reports the database connected" || fail "readiness: $READY"
HEALTH=$(fetch "$API/api/health")
echo "$HEALTH" | grep -q '"success":true' && pass "combined /health is green ($(echo "$HEALTH" | grep -o '"version":"[^"]*"'))" || fail "combined /health: $HEALTH"

echo "Security headers"
H=$(headers "$API/api/health")
grep -qi '^x-content-type-options: nosniff' <<<"$H" && pass "X-Content-Type-Options: nosniff" || fail "missing X-Content-Type-Options"
grep -qi '^strict-transport-security:' <<<"$H"      && pass "HSTS present"                    || fail "missing HSTS"
grep -qi "^content-security-policy:.*default-src 'none'" <<<"$H" && pass "API CSP denies everything" || fail "missing API CSP"
grep -qi '^cache-control: no-store' <<<"$H"          && pass "responses are not cacheable"      || fail "API responses are cacheable"
grep -qi '^x-powered-by:' <<<"$H"                    && fail "X-Powered-By leaks the framework" || pass "no X-Powered-By"
grep -qi '^x-request-id: ' <<<"$H"                   && pass "X-Request-Id returned"            || fail "no X-Request-Id"

echo "Behaviour"
CODE=$(fetch -o /dev/null -w '%{http_code}' "$API/api/auth/me")
[ "$CODE" = 401 ] && pass "protected route rejects anonymous requests (401)" || fail "GET /auth/me anonymous returned $CODE"
CODE=$(fetch -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"email":"nobody@example.com","password":"x"}' "$API/api/auth/login")
[ "$CODE" = 401 ] || [ "$CODE" = 400 ] && pass "bad credentials are refused ($CODE)" || fail "login with bad credentials returned $CODE"
BODY=$(fetch "$API/api/definitely-not-a-route")
echo "$BODY" | grep -q '"requestId"' && pass "errors carry a requestId" || fail "error body has no requestId: $BODY"
CODE=$(fetch -o /dev/null -w '%{http_code}' "$API/metrics")
{ [ "$CODE" = 404 ] || [ "$CODE" = 401 ]; } && pass "/metrics is not public ($CODE)" || fail "/metrics is publicly readable ($CODE)"
JOBS=$(fetch "$API/api/jobs?limit=1")
echo "$JOBS" | grep -q '"items"' && pass "public job listing works" || fail "GET /jobs: $JOBS"

echo "CORS"
if [ -n "$WEB" ]; then
  H=$(headers -X OPTIONS -H "Origin: ${WEB%/}" -H 'Access-Control-Request-Method: GET' "$API/api/jobs")
  grep -qi "^access-control-allow-origin: ${WEB%/}" <<<"$H" && pass "the web origin is allowed" || fail "web origin not allowed by CORS"
fi
H=$(headers -X OPTIONS -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: GET' "$API/api/jobs")
grep -qi '^access-control-allow-origin: https://evil.example' <<<"$H" && fail "an arbitrary origin is allowed by CORS" || pass "an arbitrary origin is refused"

if [ -n "$WEB" ]; then
  WEB="${WEB%/}"
  echo "Web: $WEB"
  H=$(headers "$WEB/")
  grep -qi '^x-frame-options: DENY' <<<"$H"                    && pass "clickjacking protection (X-Frame-Options)" || fail "web is frameable"
  grep -qi '^strict-transport-security:' <<<"$H"                && pass "HSTS present"                              || fail "web missing HSTS"
  grep -qi '^content-security-policy' <<<"$H"                   && pass "CSP present"                                || fail "web missing CSP"
  CODE=$(fetch -o /dev/null -w '%{http_code}' "$WEB/workers/123")
  [ "$CODE" = 200 ] && pass "deep links fall back to the SPA" || fail "deep link returned $CODE"
fi

echo
if [ "$FAILED" = 0 ]; then echo "All checks passed."; else echo "Some checks FAILED."; fi
exit "$FAILED"
