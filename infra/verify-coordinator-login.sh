#!/bin/bash
# Verify coordinator API login matches SEED_ADMIN_PASSWORD / credentials file.
set -euo pipefail

API="${API_URL:-http://127.0.0.1:8088}"
EMAIL="${COORDINATOR_EMAIL:-coordinator@eyeeye.kz}"

# shellcheck disable=SC1091
source "$(dirname "$0")/load-test-password.sh"
PASS="$(load_test_password "$EMAIL")"

for attempt in 1 2 3 4 5; do
  CODE=$(curl -s -o /tmp/coord-login.json -w "%{http_code}" -X POST "${API}/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\"}" || true)
  if [ "${CODE:-}" = "200" ]; then
    break
  fi
  if [ "$attempt" -lt 5 ]; then
    sleep 2
  fi
done

if [ "${CODE:-}" != "200" ]; then
  echo "FAIL: coordinator login returned HTTP ${CODE:-none}" >&2
  cat /tmp/coord-login.json >&2
  exit 1
fi

if ! python3 -c 'import json,sys; d=json.load(open("/tmp/coord-login.json")); sys.exit(0 if d.get("user",{}).get("role")=="coordinator" else 1)' 2>/dev/null; then
  echo "FAIL: coordinator login response missing coordinator role" >&2
  cat /tmp/coord-login.json >&2
  exit 1
fi

echo "OK: coordinator login works (HTTP ${CODE})"
