#!/bin/bash
set -euo pipefail

BASE="${1:-https://platform.cornea.kz}"

echo -n "login page: "
LOGIN_CODE=$(curl -s -o /tmp/liverscreening-login.html -w "%{http_code}" "${BASE}/login")
echo "$LOGIN_CODE"
if [ "$LOGIN_CODE" != "200" ]; then
  echo "FAIL: login page not 200" >&2
  exit 1
fi

CSS_PATH=$(grep -oE '/_next/static/chunks/[^"]+\.css' /tmp/liverscreening-login.html | head -1)
if [ -z "$CSS_PATH" ]; then
  echo "FAIL: no CSS chunk referenced in login HTML" >&2
  exit 1
fi

echo -n "css ${CSS_PATH}: "
CSS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}${CSS_PATH}")
echo "$CSS_CODE"
if [ "$CSS_CODE" != "200" ]; then
  echo "FAIL: CSS returned ${CSS_CODE} (site may look broken)" >&2
  exit 1
fi

echo -n "nextauth providers: "
AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/auth/providers")
echo "$AUTH_CODE"
if [ "$AUTH_CODE" != "200" ]; then
  echo "FAIL: NextAuth providers not 200" >&2
  exit 1
fi

echo "OK"
