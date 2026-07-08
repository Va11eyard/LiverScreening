#!/bin/bash
set -euo pipefail

echo -n "HTTPS login: "
curl -s -o /dev/null -w "%{http_code}\n" https://platform.cornea.kz/login

SEED_PASS=$(sudo grep SEED_ADMIN_PASSWORD /opt/liverscreening-api/.env | cut -d= -f2-)
API_PORT="${API_PORT:-8089}"
RESP=$(curl -s -X POST "http://127.0.0.1:${API_PORT}/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"coordinator@liver.kz\",\"password\":\"${SEED_PASS}\"}")
TOKEN=$(echo "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["tokens"]["access_token"])')
echo "Token acquired (${#TOKEN} chars)"

echo -n "Weekly API: "
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer ${TOKEN}" \
  "http://127.0.0.1:${API_PORT}/api/v1/reports/weekly"

echo -n "Excel API: "
curl -s -o /tmp/liverscreening-test.xlsx -w "%{http_code} size=%{size_download}\n" \
  -H "Authorization: Bearer ${TOKEN}" \
  "http://127.0.0.1:${API_PORT}/api/v1/reports/excel"

echo -n "HTTPS cases (redirect): "
curl -s -o /dev/null -w "%{http_code}\n" https://platform.cornea.kz/cases

echo "Smoke tests passed"
