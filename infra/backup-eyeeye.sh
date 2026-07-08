#!/bin/bash
# Full EyeEye backup: PostgreSQL + uploads + config + exports + audit log.
# Intended for daily cron and server migration.
set -euo pipefail

BACKUP_ROOT="${EYEYE_BACKUP_DIR:-/var/backups/eyeeye}"
RETENTION_DAYS="${EYEYE_BACKUP_RETENTION_DAYS:-30}"
STAMP="$(TZ="${EYEYE_BACKUP_TZ:-Asia/Almaty}" date +%Y%m%d_%H%M%S)"
WORKDIR="${BACKUP_ROOT}/${STAMP}"
LATEST_LINK="${BACKUP_ROOT}/latest"
LOG_TAG="[eyeeye-backup ${STAMP}]"

API_ENV="${EYEYE_API_ENV:-/opt/eyeeye-api/.env}"
WEB_ENV="${EYEYE_WEB_ENV:-/opt/eyeeye-web/.env}"
UPLOAD_DIR="${EYEYE_UPLOAD_DIR:-/opt/eyeeye-data/uploads}"
EXPORT_DIR="${EYEYE_EXPORT_DIR:-/opt/eyeeye-api/exports}"
AUDIT_LOG="${EYEYE_AUDIT_LOG:-/var/log/eyeeye/audit.jsonl}"
PASS_FILE="${EYEYE_PASSWORDS_FILE:-/opt/eyeeye-api/doctor-passwords.env}"

mkdir -p "${BACKUP_ROOT}" "${WORKDIR}"
chmod 700 "${BACKUP_ROOT}"

echo "${LOG_TAG} start"

if ! sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='eyeeye'" | grep -q 1; then
  echo "${LOG_TAG} ERROR: database eyeeye not found" >&2
  exit 1
fi

echo "${LOG_TAG} dumping postgres..."
sudo -u postgres pg_dump --clean --if-exists eyeeye | gzip >"${WORKDIR}/eyeeye.sql.gz"

if [ -d "${UPLOAD_DIR}" ]; then
  echo "${LOG_TAG} archiving uploads..."
  tar -czf "${WORKDIR}/uploads.tar.gz" -C "$(dirname "${UPLOAD_DIR}")" "$(basename "${UPLOAD_DIR}")"
else
  echo "${LOG_TAG} uploads dir missing, skipping"
fi

echo "${LOG_TAG} archiving config..."
CONFIG_STAGE="$(mktemp -d)"
if [ -f "${API_ENV}" ]; then
  install -m 600 "${API_ENV}" "${CONFIG_STAGE}/api.env"
fi
if [ -f "${WEB_ENV}" ]; then
  install -m 600 "${WEB_ENV}" "${CONFIG_STAGE}/web.env"
fi
if [ -f "${PASS_FILE}" ]; then
  install -m 600 "${PASS_FILE}" "${CONFIG_STAGE}/doctor-passwords.env"
fi
shopt -s nullglob
for f in /opt/eyeeye-api/credentials-*.txt; do
  install -m 600 "${f}" "${CONFIG_STAGE}/$(basename "${f}")"
done
shopt -u nullglob
tar -czf "${WORKDIR}/config.tar.gz" -C "${CONFIG_STAGE}" .
rm -rf "${CONFIG_STAGE}"

if [ -d "${EXPORT_DIR}" ] && [ "$(ls -A "${EXPORT_DIR}" 2>/dev/null)" ]; then
  echo "${LOG_TAG} archiving excel exports..."
  tar -czf "${WORKDIR}/exports.tar.gz" -C "$(dirname "${EXPORT_DIR}")" "$(basename "${EXPORT_DIR}")"
fi

if [ -f "${AUDIT_LOG}" ]; then
  echo "${LOG_TAG} archiving audit log..."
  gzip -c "${AUDIT_LOG}" >"${WORKDIR}/audit.jsonl.gz"
fi

{
  echo "backup_version=1"
  echo "created_at=${STAMP}"
  echo "timezone=${EYEYE_BACKUP_TZ:-Asia/Almaty}"
  echo "hostname=$(hostname -f 2>/dev/null || hostname)"
  echo "database=eyeeye"
  echo "upload_dir=${UPLOAD_DIR}"
  ls -1 "${WORKDIR}"
} >"${WORKDIR}/manifest.txt"

ARCHIVE="${BACKUP_ROOT}/eyeeye_${STAMP}.tar.gz"
tar -czf "${ARCHIVE}" -C "${BACKUP_ROOT}" "${STAMP}"
rm -rf "${WORKDIR}"
ln -sfn "$(basename "${ARCHIVE}")" "${LATEST_LINK}.tar.gz"

echo "${LOG_TAG} pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_ROOT}" -maxdepth 1 -type f -name 'eyeeye_*.tar.gz' -mtime +"${RETENTION_DAYS}" -delete

echo "${LOG_TAG} done -> ${ARCHIVE}"
