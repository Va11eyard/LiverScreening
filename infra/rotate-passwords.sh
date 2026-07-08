#!/bin/bash
set -euo pipefail
export PATH="/usr/local/go/bin:$PATH"

ENV=/opt/liverscreening-api/.env
PASS_FILE=/opt/liverscreening-api/doctor-passwords.env
CREDENTIALS=/opt/liverscreening-api/credentials-$(date +%Y%m%d-%H%M%S).txt

if [ ! -f "$ENV" ]; then
  echo "Missing $ENV — run deploy first" >&2
  exit 1
fi

gen_pass() {
  openssl rand -base64 18 | tr -d '/+=' | head -c 18
}

NEW_ADMIN_PASS=$(gen_pass)
{
  echo "# LiverScreening pilot credentials — store securely, then delete this file"
  echo "# Generated: $(date -Iseconds)"
  echo ""
  echo "coordinator@liver.kz=${NEW_ADMIN_PASS}"
} | sudo tee "$CREDENTIALS" >/dev/null

sudo tee "$PASS_FILE" >/dev/null <<HDR
coordinator@liver.kz=${NEW_ADMIN_PASS}
HDR

DOCTORS=(
  doctor@liver.kz
  doctor2@liver.kz
  doctor3@liver.kz
  doctor4@liver.kz
  doctor5@liver.kz
  doctor6@liver.kz
  doctor7@liver.kz
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

cd /opt/liverscreening-src
set -a
eval "$(sudo grep -v '^#' "$ENV" | sed 's/^/export /')"
set +a

export SEED_ROTATE_PASSWORDS=1
go run ./scripts/seed-users

echo ""
echo "Passwords rotated. Credentials written to: ${CREDENTIALS}"
echo "Distribute to clinicians, then: sudo rm -f ${CREDENTIALS}"
echo "Doctor password file (for re-seed): ${PASS_FILE}"
