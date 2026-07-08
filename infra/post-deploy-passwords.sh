#!/bin/bash
set -euo pipefail
PASS_FILE=/opt/liverscreening-api/doctor-passwords.env
if [ ! -f "$PASS_FILE" ]; then
  echo "No ${PASS_FILE} — running password rotation..."
  sudo bash /opt/liverscreening-src/infra/rotate-passwords.sh
else
  echo "Password file exists — skipping rotation (run infra/rotate-passwords.sh to rotate)"
fi
