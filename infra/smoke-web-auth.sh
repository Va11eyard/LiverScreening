#!/bin/bash
set -euo pipefail

WEB_PORT="${WEB_PORT:-3014}"
BASE_URL="${WEB_URL:-http://127.0.0.1:${WEB_PORT}}"
EMAIL="${TEST_EMAIL:-doctor@liver.kz}"
SMOKE_FULL_LOGIN="${SMOKE_FULL_LOGIN:-0}"

source "$(dirname "$0")/load-test-password.sh"
PASS="$(load_test_password "$EMAIL")"

echo "Smoke auth on ${BASE_URL}..."

COOKIE=$(mktemp)
cleanup() { rm -f "$COOKIE" /tmp/smoke-session.json /tmp/smoke-csrf.json; }
trap cleanup EXIT

SESSION_CODE=$(curl -s -b "$COOKIE" -c "$COOKIE" -o /tmp/smoke-session.json -w "%{http_code}" "${BASE_URL}/api/auth/session")
if [ "$SESSION_CODE" != "200" ]; then
  echo "FAIL: GET /api/auth/session returned HTTP ${SESSION_CODE}" >&2
  exit 1
fi

CSRF_CODE=$(curl -s -b "$COOKIE" -c "$COOKIE" -o /tmp/smoke-csrf.json -w "%{http_code}" "${BASE_URL}/api/auth/csrf")
if [ "$CSRF_CODE" != "200" ]; then
  echo "FAIL: GET /api/auth/csrf returned HTTP ${CSRF_CODE}" >&2
  exit 1
fi

if ! python3 -c 'import json; json.load(open("/tmp/smoke-csrf.json"))' 2>/dev/null; then
  echo "FAIL: /api/auth/csrf did not return JSON" >&2
  cat /tmp/smoke-csrf.json >&2
  exit 1
fi

if [ "$SMOKE_FULL_LOGIN" = "1" ]; then
  CSRF=$(python3 -c 'import json; print(json.load(open("/tmp/smoke-csrf.json"))["csrfToken"])')
  LOGIN_CODE=$(curl -s -b "$COOKIE" -c "$COOKIE" -o /dev/null -w "%{http_code}" -L -X POST \
    "${BASE_URL}/api/auth/callback/credentials" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "csrfToken=$CSRF" \
    --data-urlencode "email=$EMAIL" \
    --data-urlencode "password=$PASS" \
    --data-urlencode "callbackUrl=${BASE_URL}/cases")
  if [ "$LOGIN_CODE" != "200" ] && [ "$LOGIN_CODE" != "302" ] && [ "$LOGIN_CODE" != "303" ]; then
    echo "FAIL: credentials callback returned HTTP ${LOGIN_CODE}" >&2
    exit 1
  fi
  if ! grep -q 'session-token' "$COOKIE"; then
    echo "FAIL: login did not set session cookie" >&2
    cat "$COOKIE" >&2
    exit 1
  fi
fi

echo "OK: auth smoke passed (${BASE_URL})"
