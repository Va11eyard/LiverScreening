#!/bin/bash
set -euo pipefail
PASS=$(grep '^SEED_ADMIN_PASSWORD=' /opt/liverscreening-api/.env | cut -d= -f2-)
FILE=/opt/liverscreening-api/doctor-passwords.env
if grep -qi '^coordinator@liver.kz=' "$FILE" 2>/dev/null; then
  echo "SYNCED=already_present"
  exit 0
fi
TMP=$(mktemp)
{
  echo "# email=password (coordinator + doctors)"
  echo "coordinator@liver.kz=${PASS}"
  cat "$FILE"
} >"$TMP"
mv "$TMP" "$FILE"
chmod 600 "$FILE"
chown ubuntu:ubuntu "$FILE"
echo "SYNCED=coordinator_added"
