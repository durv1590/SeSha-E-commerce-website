#!/usr/bin/env bash
# Post-deploy checks against a running site. Exits non-zero if anything fails.
#
#   infra/scripts/smoke.sh https://www.seshakart.com            # production (indexable)
#   EXPECT_INDEXING=0 infra/scripts/smoke.sh https://staging.…   # staging / before launch
#
# Read-only: it only sends GET requests.
set -uo pipefail

BASE=${1:?usage: smoke.sh <base-url>}
BASE=${BASE%/}
EXPECT_INDEXING=${EXPECT_INDEXING:-1}
HTTPS=0; [[ $BASE == https://* ]] && HTTPS=1
failures=0
tmp=$(mktemp -d)
trap 'rm -r "$tmp"' EXIT

pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }
# fetch <path> → sets $status; body in $tmp/body, headers in $tmp/headers
fetch() {
  status=$(curl -sS --max-time 20 -o "$tmp/body" -D "$tmp/headers" -w '%{http_code}' "$BASE$1" || echo 000)
}
header() { grep -i "^$1:" "$tmp/headers" | tail -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ //'; }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

echo "Smoke test: $BASE"

fetch /api/health/ready
check "API ready (database and Redis up)" \
  '[ "$status" = 200 ] && grep -q "\"database\":\"up\"" "$tmp/body" && grep -q "\"redis\":\"up\"" "$tmp/body"'

fetch /api/categories
check "API serves the catalogue" '[ "$status" = 200 ] && grep -q "\"data\"" "$tmp/body"'

fetch /
csp=$(header content-security-policy)
check "home page 200" '[ "$status" = 200 ]'
script_src=$(tr ';' '\n' <<<"$csp" | grep -i '^ *script-src' || true)
check "CSP: script nonce + strict-dynamic, no unsafe-inline scripts" \
  '[[ $script_src == *"nonce-"* && $script_src == *strict-dynamic* && $script_src != *unsafe-inline* ]]'
check "clickjacking protection" '[ "$(header x-frame-options)" = DENY ]'
if [ "$HTTPS" = 1 ]; then
  check "HSTS" '[[ $(header strict-transport-security) == *max-age=* ]]'
fi
check "no framework banner" '[ -z "$(header x-powered-by)" ]'

fetch /robots.txt
if [ "$EXPECT_INDEXING" = 1 ]; then
  check "robots.txt open to crawlers, lists the sitemap" 'grep -q "^Sitemap: " "$tmp/body" && ! grep -qx "Disallow: /" "$tmp/body"'
  fetch /sitemap.xml
  check "sitemap lists pages" '[ "$status" = 200 ] && grep -q "<loc>" "$tmp/body"'
else
  check "robots.txt closed to crawlers (not launched)" 'grep -qx "Disallow: /" "$tmp/body"'
fi

fetch /admin
check "admin redirects visitors to sign-in" '[[ $status == 30* ]] && [[ $(header location) == *"/login"* ]]'

fetch /.well-known/security.txt
check "security.txt" '[ "$status" = 200 ] && grep -q "^Contact: " "$tmp/body"'

fetch /this-page-does-not-exist
check "unknown page answers 404" '[ "$status" = 404 ]'

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "All checks passed"
