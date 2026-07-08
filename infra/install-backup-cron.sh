#!/bin/bash
# Install daily EyeEye backup cron (07:00 Asia/Almaty).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_SCRIPT="${REPO_ROOT}/infra/backup-eyeeye.sh"
CRON_FILE="/etc/cron.d/eyeeye-backup"

if [ ! -f "${BACKUP_SCRIPT}" ]; then
  echo "Missing ${BACKUP_SCRIPT}" >&2
  exit 1
fi

sudo chmod +x "${BACKUP_SCRIPT}"
sudo mkdir -p /var/backups/eyeeye /var/log/eyeeye
sudo chown root:root /var/backups/eyeeye
sudo chmod 700 /var/backups/eyeeye

sudo tee "${CRON_FILE}" >/dev/null <<EOF
# EyeEye full backup — daily at 07:00 Asia/Almaty (for server migration / disaster recovery)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
TZ=Asia/Almaty
0 7 * * * root ${BACKUP_SCRIPT} >> /var/log/eyeeye/backup.log 2>&1
EOF

sudo chmod 644 "${CRON_FILE}"
echo "Installed ${CRON_FILE} (daily 07:00 Asia/Almaty)"
