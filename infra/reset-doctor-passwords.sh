#!/bin/bash
# Generate unique per-doctor passwords and apply via seed-users.
# Does NOT rotate coordinator password or touch case data.
set -euo pipefail
export PATH="/usr/local/go/bin:$PATH"

ENV=/opt/eyeeye-api/.env
PASS_FILE=/opt/eyeeye-api/doctor-passwords.env

if [ ! -f "$ENV" ]; then
  echo "Missing $ENV — run deploy first" >&2
  exit 1
fi

DOCTORS=(
  doctor@eyeeye.kz
  doctor2@eyeeye.kz
  doctor3@eyeeye.kz
  doctor4@eyeeye.kz
  doctor5@eyeeye.kz
  doctor6@eyeeye.kz
  doctor7@eyeeye.kz
)

sudo tee "$PASS_FILE" >/dev/null <<'HDR'
# email=password (one unique password per doctor — keep this file secret)
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

cd /opt/eyeeyeupload-src
set -a
# shellcheck disable=SC1091
eval "$(sudo grep -v '^#' "$ENV" | sed 's/^/export /')"
set +a

export SEED_ROTATE_PASSWORDS=1
go run ./scripts/seed-users

echo "Per-doctor passwords written to ${PASS_FILE} (chmod 600). Distribute securely to each doctor." >&2
