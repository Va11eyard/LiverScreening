#!/bin/bash
set -euo pipefail
export PATH="/usr/local/go/bin:$PATH"

ENV=/opt/liverscreening-api/.env
PASS_FILE=/opt/liverscreening-api/doctor-passwords.env

if [ ! -f "$ENV" ]; then
  echo "Missing $ENV — run deploy first" >&2
  exit 1
fi

DOCTORS=(
  doctor@liver.kz
  doctor2@liver.kz
  doctor3@liver.kz
  doctor4@liver.kz
  doctor5@liver.kz
  doctor6@liver.kz
  doctor7@liver.kz
)

sudo tee "$PASS_FILE" >/dev/null <<'HDR'
HDR

for email in "${DOCTORS[@]}"; do
  pass=$(openssl rand -base64 18 | tr -d '/+=' | head -c 18)
  echo "${email}=${pass}" | sudo tee -a "$PASS_FILE" >/dev/null
done

sudo chmod 600 "$PASS_FILE"
sudo chown ubuntu:ubuntu "$PASS_FILE"

if ! sudo grep -q '^SEED_DOCTOR_PASSWORDS_FILE=' "$ENV"; then
  echo "SEED_DOCTOR_PASSWORDS_FILE=${PASS_FILE}" | sudo tee -a "$ENV" >/dev/null
fi

cd /opt/liverscreening-src
set -a
eval "$(sudo grep -v '^#' "$ENV" | sed 's/^/export /')"
set +a

export SEED_ROTATE_PASSWORDS=1
go run ./scripts/seed-users

echo "Per-doctor passwords written to ${PASS_FILE} (chmod 600). Distribute securely to each doctor." >&2
