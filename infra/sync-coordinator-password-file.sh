#!/bin/bash
set -euo pipefail
PASS=$(grep '^SEED_ADMIN_PASSWORD=' /opt/eyeeye-api/.env | cut -d= -f2-)
FILE=/opt/eyeeye-api/doctor-passwords.env
if grep -qi '^coordinator@eyeeye.kz=' "$FILE" 2>/dev/null; then
  echo "SYNCED=already_present"
  exit 0
fi
TMP=$(mktemp)
{
  echo "# email=password (coordinator + doctors)"
  echo "coordinator@eyeeye.kz=${PASS}"
  cat "$FILE"
} >"$TMP"
mv "$TMP" "$FILE"
chmod 600 "$FILE"
chown ubuntu:ubuntu "$FILE"
echo "SYNCED=coordinator_added"
