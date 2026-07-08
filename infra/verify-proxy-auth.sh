#!/bin/bash
set -euo pipefail

WEB="${WEB_URL:-https://platform.cornea.kz}"
EMAIL="${TEST_EMAIL:-doctor@liver.kz}"
source "$(dirname "$0")/load-test-password.sh"
PASS="$(load_test_password "$EMAIL")"
COOKIE=$(mktemp)
PNG=$(mktemp --suffix=.png)

cleanup() { rm -f "$COOKIE" "$PNG" /tmp/case-resp.json; }
trap cleanup EXIT

CSRF_CODE=$(curl -s -b "$COOKIE" -c "$COOKIE" -o /tmp/proxy-csrf.json -w "%{http_code}" "$WEB/api/auth/csrf")
if [ "$CSRF_CODE" != "200" ]; then
  echo "FAIL: GET /api/auth/csrf returned HTTP ${CSRF_CODE}" >&2
  cat /tmp/proxy-csrf.json >&2
  exit 1
fi
CSRF=$(python3 -c 'import json; print(json.load(open("/tmp/proxy-csrf.json"))["csrfToken"])')
curl -s -b "$COOKIE" -c "$COOKIE" -L -X POST "$WEB/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASS" \
  --data-urlencode "callbackUrl=$WEB/cases" \
  -o /dev/null

SESSION=$(curl -s -b "$COOKIE" "$WEB/api/auth/session" || true)
if ! echo "$SESSION" | python3 -c 'import sys,json; s=json.load(sys.stdin); exit(0 if s.get("user") else 1)' 2>/dev/null; then
  if ! grep -q 'session-token' "$COOKIE"; then
    echo "FAIL: login did not create a session cookie" >&2
    echo "$SESSION" >&2
    cat "$COOKIE" >&2
    exit 1
  fi
fi

python3 -c '
import struct, zlib, sys
w, h = 1, 1
raw = b"\x00" + b"\x00\x00\xff"
comp = zlib.compress(raw)
ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
def chunk(t, d):
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
path = sys.argv[1]
open(path, "wb").write(
    b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", comp) + chunk(b"IEND", b"")
)
' "$PNG"

CASE_JSON='{"date":"2026-07-02","hospital":"ПМСП №1 г. Астана","doctor":"Verify","motherSurname":"Test","childSurname":"Patient","stage":"F2"}'

CODE=$(curl -s -b "$COOKIE" -o /tmp/case-resp.json -w "%{http_code}" -X POST "$WEB/api/proxy/cases" \
  -F "data=${CASE_JSON};type=application/json" \
  -F "images=@${PNG};type=image/png")

if [ "$CODE" != "201" ]; then
  echo "FAIL: POST /api/proxy/cases returned HTTP $CODE" >&2
  cat /tmp/case-resp.json >&2
  exit 1
fi

echo "OK: proxy auth works (HTTP $CODE)"
cat /tmp/case-resp.json
