#!/bin/bash
# Generate unique coordinator password; doctors use shared Doctor123! via reset-doctor-passwords.sh.
# Safe for existing DB: only updates password_hash when SEED_ROTATE_PASSWORDS=1.
# Does NOT touch case data or uploads.
set -euo pipefail
export PATH="/usr/local/go/bin:$PATH"

ENV=/opt/eyeeye-api/.env
PASS_FILE=/opt/eyeeye-api/doctor-passwords.env
CREDENTIALS=/opt/eyeeye-api/credentials-$(date +%Y%m%d-%H%M%S).txt

if [ ! -f "$ENV" ]; then
  echo "Missing $ENV — run deploy first" >&2
  exit 1
fi

gen_pass() {
  openssl rand -base64 18 | tr -d '/+=' | head -c 18
}

NEW_ADMIN_PASS=$(gen_pass)
{
  echo "# EyeEye pilot credentials — store securely, then delete this file"
  echo "# Generated: $(date -Iseconds)"
  echo ""
  echo "coordinator@eyeeye.kz=${NEW_ADMIN_PASS}"
} | sudo tee "$CREDENTIALS" >/dev/null

sudo tee "$PASS_FILE" >/dev/null <<HDR
# email=password (coordinator + doctors; source of truth for smoke tests)
coordinator@eyeeye.kz=${NEW_ADMIN_PASS}
HDR

DOCTORS=(
  doctor@eyeeye.kz
  doctor2@eyeeye.kz
  doctor3@eyeeye.kz
  doctor4@eyeeye.kz
  doctor5@eyeeye.kz
  doctor6@eyeeye.kz
  doctor7@eyeeye.kz
)

for email in "${DOCTORS[@]}"; do
  echo "${email}=Doctor123!" | sudo tee -a "$PASS_FILE" >/dev/null
  echo "${email}=Doctor123!" | sudo tee -a "$CREDENTIALS" >/dev/null
done

sudo chmod 600 "$PASS_FILE" "$CREDENTIALS"
sudo chown ubuntu:ubuntu "$PASS_FILE" "$CREDENTIALS"

if sudo grep -q '^SEED_ADMIN_PASSWORD=' "$ENV"; then
  TMP=$(mktemp)
  sudo grep -v '^SEED_ADMIN_PASSWORD=' "$ENV" >"$TMP"
  echo "SEED_ADMIN_PASSWORD=${NEW_ADMIN_PASS}" >>"$TMP"
  sudo cp "$TMP" "$ENV"
  rm -f "$TMP"
else
  echo "SEED_ADMIN_PASSWORD=${NEW_ADMIN_PASS}" | sudo tee -a "$ENV" >/dev/null
fi

if ! sudo grep -q '^SEED_DOCTOR_PASSWORDS_FILE=' "$ENV"; then
  echo "SEED_DOCTOR_PASSWORDS_FILE=${PASS_FILE}" | sudo tee -a "$ENV" >/dev/null
fi

if ! sudo grep -q '^LISTEN_HOST=' "$ENV"; then
  echo 'LISTEN_HOST=127.0.0.1' | sudo tee -a "$ENV" >/dev/null
fi

cd /opt/eyeeyeupload-src
set -a
# shellcheck disable=SC1091
eval "$(sudo grep -v '^#' "$ENV" | sed 's/^/export /')"
set +a

export SEED_ROTATE_PASSWORDS=1
go run ./scripts/seed-users

echo ""
echo "Passwords rotated. Credentials written to: ${CREDENTIALS}"
echo "Distribute to clinicians, then: sudo rm -f ${CREDENTIALS}"
echo "Doctor password file (for re-seed): ${PASS_FILE}"
