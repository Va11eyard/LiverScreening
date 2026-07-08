#!/bin/bash
# Restore EyeEye from a backup archive created by backup-eyeeye.sh
# Usage: sudo ./restore-eyeeye.sh /var/backups/eyeeye/eyeeye_YYYYMMDD_HHMMSS.tar.gz
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root (sudo)" >&2
  exit 1
fi

ARCHIVE="${1:-}"
if [ -z "${ARCHIVE}" ] || [ ! -f "${ARCHIVE}" ]; then
  echo "Usage: $0 /path/to/eyeeye_YYYYMMDD_HHMMSS.tar.gz" >&2
  exit 1
fi

UPLOAD_DIR="${EYEYE_UPLOAD_DIR:-/opt/eyeeye-data/uploads}"
API_ENV="${EYEYE_API_ENV:-/opt/eyeeye-api/.env}"
WEB_ENV="${EYEYE_WEB_ENV:-/opt/eyeeye-web/.env}"
EXPORT_DIR="${EYEYE_EXPORT_DIR:-/opt/eyeeye-api/exports}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

echo "[eyeeye-restore] extracting ${ARCHIVE}..."
tar -xzf "${ARCHIVE}" -C "${WORKDIR}" --strip-components=1

if [ ! -f "${WORKDIR}/eyeeye.sql.gz" ]; then
  echo "ERROR: eyeeye.sql.gz missing in archive" >&2
  exit 1
fi

echo "[eyeeye-restore] restoring postgres..."
gunzip -c "${WORKDIR}/eyeeye.sql.gz" | sudo -u postgres psql -v ON_ERROR_STOP=1

if [ -f "${WORKDIR}/uploads.tar.gz" ]; then
  echo "[eyeeye-restore] restoring uploads..."
  mkdir -p "$(dirname "${UPLOAD_DIR}")"
  tar -xzf "${WORKDIR}/uploads.tar.gz" -C "$(dirname "${UPLOAD_DIR}")"
fi

if [ -f "${WORKDIR}/config.tar.gz" ]; then
  echo "[eyeeye-restore] restoring config..."
  CONFIG_STAGE="$(mktemp -d)"
  tar -xzf "${WORKDIR}/config.tar.gz" -C "${CONFIG_STAGE}"
  [ -f "${CONFIG_STAGE}/api.env" ] && install -m 600 "${CONFIG_STAGE}/api.env" "${API_ENV}"
  [ -f "${CONFIG_STAGE}/web.env" ] && install -m 600 "${CONFIG_STAGE}/web.env" "${WEB_ENV}"
  [ -f "${CONFIG_STAGE}/doctor-passwords.env" ] && install -m 600 "${CONFIG_STAGE}/doctor-passwords.env" /opt/eyeeye-api/doctor-passwords.env
  for f in "${CONFIG_STAGE}"/credentials-*.txt; do
    [ -f "${f}" ] && install -m 600 "${f}" "/opt/eyeeye-api/$(basename "${f}")"
  done
  rm -rf "${CONFIG_STAGE}"
fi

if [ -f "${WORKDIR}/exports.tar.gz" ]; then
  echo "[eyeeye-restore] restoring excel exports..."
  mkdir -p "$(dirname "${EXPORT_DIR}")"
  tar -xzf "${WORKDIR}/exports.tar.gz" -C "$(dirname "${EXPORT_DIR}")"
fi

if [ -f "${WORKDIR}/audit.jsonl.gz" ]; then
  echo "[eyeeye-restore] restoring audit log..."
  mkdir -p /var/log/eyeeye
  gunzip -c "${WORKDIR}/audit.jsonl.gz" >/var/log/eyeeye/audit.jsonl
  chmod 640 /var/log/eyeeye/audit.jsonl
fi

cat "${WORKDIR}/manifest.txt" 2>/dev/null || true
echo "[eyeeye-restore] done. Restart: systemctl restart eyeeye-api eyeeye-web"
