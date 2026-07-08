#!/bin/bash
set -euo pipefail
export PATH="/usr/local/go/bin:$PATH"
set -a
# shellcheck disable=SC1091
eval "$(sudo grep -v '^#' /opt/eyeeye-api/.env | sed 's/^/export /')"
set +a

cd /opt/eyeeyeupload-src
go run ./scripts/seed-users

echo "--- users in database ---"
sudo -u postgres psql -d eyeeye -c "SELECT email, name, role, left(hospital, 40) AS hospital FROM users ORDER BY email;"

echo "--- login check coordinator ---"
curl -s -X POST http://127.0.0.1:8088/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"coordinator@eyeeye.kz\",\"password\":\"${SEED_ADMIN_PASSWORD}\"}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("coordinator OK:", d["user"]["role"])'

echo "--- login check doctor ---"
curl -s -X POST http://127.0.0.1:8088/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"doctor@eyeeye.kz\",\"password\":\"${SEED_DOCTOR_PASSWORD}\"}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("doctor OK:", d["user"]["role"])'
