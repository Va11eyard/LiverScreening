#!/bin/bash
set -euo pipefail
export PATH="/usr/local/go/bin:$PATH"
set -a
eval "$(sudo grep -v '^#' /opt/liverscreening-api/.env | sed 's/^/export /')"
set +a

cd /opt/liverscreening-src
go run ./scripts/seed-users

echo "--- users in database ---"
sudo -u postgres psql -d liver -c "SELECT email, name, role, left(hospital, 40) AS hospital FROM users ORDER BY email;"

echo "--- login check coordinator ---"
curl -s -X POST "http://127.0.0.1:${API_PORT:-8089}/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"coordinator@liver.kz\",\"password\":\"${SEED_ADMIN_PASSWORD}\"}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("coordinator OK:", d["user"]["role"])'

echo "--- login check doctor ---"
curl -s -X POST "http://127.0.0.1:${API_PORT:-8089}/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"doctor@liver.kz\",\"password\":\"${SEED_DOCTOR_PASSWORD}\"}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("doctor OK:", d["user"]["role"])'
