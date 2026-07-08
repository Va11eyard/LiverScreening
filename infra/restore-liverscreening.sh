#!/bin/bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root (sudo)" >&2
  exit 1
fi

ARCHIVE="${1:-}"
if [ -z "${ARCHIVE}" ] || [ ! -f "${ARCHIVE}" ]; then
  echo "Usage: $0 /path/to/liverscreening_YYYYMMDD_HHMMSS.tar.gz" >&2
  exit 1
fi

UPLOAD_DIR="${LIVERSCREENING_UPLOAD_DIR:-/opt/liverscreening-data/uploads}"
API_ENV="${LIVERSCREENING_API_ENV:-/opt/liverscreening-api/.env}"
WEB_ENV="${LIVERSCREENING_WEB_ENV:-/opt/liverscreening-web/.env}"
EXPORT_DIR="${LIVERSCREENING_EXPORT_DIR:-/opt/liverscreening-api/exports}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

echo "[liverscreening-restore] extracting ${ARCHIVE}..."
tar -xzf "${ARCHIVE}" -C "${WORKDIR}" --strip-components=1

if [ ! -f "${WORKDIR}/liver.sql.gz" ]; then
  echo "ERROR: liver.sql.gz missing in archive" >&2
  exit 1
fi

echo "[liverscreening-restore] restoring postgres..."
gunzip -c "${WORKDIR}/liver.sql.gz" | sudo -u postgres psql -v ON_ERROR_STOP=1

if [ -f "${WORKDIR}/uploads.tar.gz" ]; then
  echo "[liverscreening-restore] restoring uploads..."
  mkdir -p "$(dirname "${UPLOAD_DIR}")"
  tar -xzf "${WORKDIR}/uploads.tar.gz" -C "$(dirname "${UPLOAD_DIR}")"
fi

if [ -f "${WORKDIR}/config.tar.gz" ]; then
  echo "[liverscreening-restore] restoring config..."
  CONFIG_STAGE="$(mktemp -d)"
  tar -xzf "${WORKDIR}/config.tar.gz" -C "${CONFIG_STAGE}"
  [ -f "${CONFIG_STAGE}/api.env" ] && install -m 600 "${CONFIG_STAGE}/api.env" "${API_ENV}"
  [ -f "${CONFIG_STAGE}/web.env" ] && install -m 600 "${CONFIG_STAGE}/web.env" "${WEB_ENV}"
  [ -f "${CONFIG_STAGE}/doctor-passwords.env" ] && install -m 600 "${CONFIG_STAGE}/doctor-passwords.env" /opt/liverscreening-api/doctor-passwords.env
  for f in "${CONFIG_STAGE}"/credentials-*.txt; do
    [ -f "${f}" ] && install -m 600 "${f}" "/opt/liverscreening-api/$(basename "${f}")"
  done
  rm -rf "${CONFIG_STAGE}"
fi

if [ -f "${WORKDIR}/exports.tar.gz" ]; then
  echo "[liverscreening-restore] restoring excel exports..."
  mkdir -p "$(dirname "${EXPORT_DIR}")"
  tar -xzf "${WORKDIR}/exports.tar.gz" -C "$(dirname "${EXPORT_DIR}")"
fi

if [ -f "${WORKDIR}/audit.jsonl.gz" ]; then
  echo "[liverscreening-restore] restoring audit log..."
  mkdir -p /var/log/liverscreening
  gunzip -c "${WORKDIR}/audit.jsonl.gz" >/var/log/liverscreening/audit.jsonl
  chmod 640 /var/log/liverscreening/audit.jsonl
fi

cat "${WORKDIR}/manifest.txt" 2>/dev/null || true
echo "[liverscreening-restore] done. Restart: systemctl restart liverscreening-api liverscreening-web"
