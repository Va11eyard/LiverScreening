#!/bin/bash
set -euo pipefail
export PATH="/usr/local/go/bin:$PATH"

sudo mkdir -p /opt/eyeeye-api /opt/eyeeye-web /opt/eyeeye-data/uploads /var/log/eyeeye
sudo chown ubuntu:ubuntu /opt/eyeeye-api /opt/eyeeye-web
sudo chown www-data:www-data /opt/eyeeye-data/uploads /var/log/eyeeye
sudo chmod 750 /var/log/eyeeye

ENV_API=/opt/eyeeye-api/.env
ENV_WEB=/opt/eyeeye-web/.env

if [ ! -f "$ENV_API" ]; then
  JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
  AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
  DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
  SEED_PASS=$(openssl rand -base64 18 | tr -d '/+=' | head -c 18)
  DOCTOR_PASS=$(openssl rand -base64 18 | tr -d '/+=' | head -c 18)

  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='eyeeye'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE USER eyeeye WITH PASSWORD '${DB_PASS}';"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='eyeeye'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE eyeeye OWNER eyeeye;"

  sudo tee "$ENV_API" >/dev/null <<ENV
APP_ENV=production
LISTEN_HOST=127.0.0.1
PORT=8088
DATABASE_URL=postgres://eyeeye:${DB_PASS}@localhost:5432/eyeeye?sslmode=disable
JWT_SECRET=${JWT_SECRET}
CORS_ALLOWED_ORIGINS=https://eye-eye.ropca.kz
SEED_ADMIN_EMAIL=coordinator@eyeeye.kz
SEED_ADMIN_PASSWORD=${SEED_PASS}
SEED_DOCTOR_PASSWORD=${DOCTOR_PASS}
SEED_DOCTOR_PASSWORDS_FILE=/opt/eyeeye-api/doctor-passwords.env
ACCESS_TOKEN_TTL=1h
TRUSTED_PROXY_IPS=127.0.0.1,::1
API_RATE_LIMIT_MAX=120
REFRESH_RATE_LIMIT_MAX=20
UPLOAD_DIR=/opt/eyeeye-data/uploads
AUDIT_LOG_PATH=/var/log/eyeeye/audit.jsonl
AI_INFERENCE_URL=
AI_INFERENCE_API_KEY=
ENV

  sudo tee "$ENV_WEB" >/dev/null <<ENV
APP_ENV=production
AUTH_SECRET=${AUTH_SECRET}
AUTH_URL=https://eye-eye.ropca.kz
PORT=3014
API_URL=http://127.0.0.1:8088
API_PROXY_TARGET=http://127.0.0.1:8088
NODE_ENV=production
ENV

  sudo chmod 600 "$ENV_API" "$ENV_WEB"
  sudo chown ubuntu:ubuntu "$ENV_API" "$ENV_WEB"
  echo "Initial coordinator password (save securely): ${SEED_PASS}" >&2
fi

if [ -f "$ENV_API" ] && ! sudo grep -q '^UPLOAD_DIR=' "$ENV_API"; then
  echo 'UPLOAD_DIR=/opt/eyeeye-data/uploads' | sudo tee -a "$ENV_API" >/dev/null
fi
if [ -f "$ENV_API" ] && ! sudo grep -q '^AUDIT_LOG_PATH=' "$ENV_API"; then
  echo 'AUDIT_LOG_PATH=/var/log/eyeeye/audit.jsonl' | sudo tee -a "$ENV_API" >/dev/null
fi
if [ -f "$ENV_API" ] && ! sudo grep -q '^AI_INFERENCE_URL=' "$ENV_API"; then
  echo 'AI_INFERENCE_URL=' | sudo tee -a "$ENV_API" >/dev/null
  echo 'AI_INFERENCE_API_KEY=' | sudo tee -a "$ENV_API" >/dev/null
fi

if [ -f "$ENV_API" ] && ! sudo grep -q '^SEED_DOCTOR_PASSWORD=' "$ENV_API"; then
  DOCTOR_PASS=$(openssl rand -base64 18 | tr -d '/+=' | head -c 18)
  echo "SEED_DOCTOR_PASSWORD=${DOCTOR_PASS}" | sudo tee -a "$ENV_API" >/dev/null
fi
if [ -f "$ENV_API" ] && ! sudo grep -q '^TRUSTED_PROXY_IPS=' "$ENV_API"; then
  echo 'TRUSTED_PROXY_IPS=127.0.0.1,::1' | sudo tee -a "$ENV_API" >/dev/null
fi

if [ -f "$ENV_API" ] && ! sudo grep -q '^LISTEN_HOST=' "$ENV_API"; then
  echo 'LISTEN_HOST=127.0.0.1' | sudo tee -a "$ENV_API" >/dev/null
fi
if [ -f "$ENV_API" ] && ! sudo grep -q '^SEED_DOCTOR_PASSWORDS_FILE=' "$ENV_API"; then
  echo 'SEED_DOCTOR_PASSWORDS_FILE=/opt/eyeeye-api/doctor-passwords.env' | sudo tee -a "$ENV_API" >/dev/null
fi

sudo mkdir -p /opt/eyeeye-data/uploads /var/log/eyeeye
sudo chown www-data:www-data /opt/eyeeye-data/uploads /var/log/eyeeye
sudo chmod 750 /var/log/eyeeye

cd /opt/eyeeyeupload-src
sudo -u ubuntu env PATH="$PATH" CGO_ENABLED=0 go build -buildvcs=false -o /opt/eyeeye-api/eyeeye-api ./cmd/api

echo "Syncing pilot users (metadata only; passwords unchanged unless SEED_ROTATE_PASSWORDS=1)..."
set -a
# shellcheck disable=SC1091
eval "$(sudo grep -v '^#' /opt/eyeeye-api/.env | sed 's/^/export /')"
set +a
sudo -u ubuntu env PATH="$PATH" \
  DATABASE_URL="$DATABASE_URL" \
  SEED_ADMIN_EMAIL="$SEED_ADMIN_EMAIL" \
  SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" \
  SEED_DOCTOR_PASSWORD="$SEED_DOCTOR_PASSWORD" \
  SEED_DOCTOR_PASSWORDS_FILE="${SEED_DOCTOR_PASSWORDS_FILE:-/opt/eyeeye-api/doctor-passwords.env}" \
  go run ./scripts/seed-users

cd /opt/eyeeyeupload-src/apps/web
set -a
# shellcheck disable=SC1091
source /opt/eyeeye-web/.env
set +a
if [ -f pnpm-workspace.yaml ] && ! grep -q '^packages:' pnpm-workspace.yaml; then
  mv pnpm-workspace.yaml pnpm-workspace.yaml.bak
fi
NODE_ENV=development pnpm install --frozen-lockfile
NODE_ENV=production pnpm build
[ -f pnpm-workspace.yaml.bak ] && mv pnpm-workspace.yaml.bak pnpm-workspace.yaml

WEB_ROOT=/opt/eyeeye-web
WEB_STAGING=/opt/eyeeye-web-staging
WEB_PREV=/opt/eyeeye-web-prev
STAGING_PORT=3016
PROD_PORT=3014
REPO_ROOT=/opt/eyeeyeupload-src

rollback_web() {
  echo "Rolling back web release..." >&2
  sudo systemctl stop eyeeye-web 2>/dev/null || true
  sudo rm -rf "$WEB_ROOT"
  if [ -d "$WEB_PREV" ]; then
    sudo mv "$WEB_PREV" "$WEB_ROOT"
  fi
  sudo systemctl start eyeeye-web || true
}

stop_staging_web() {
  if [ -f /tmp/eyeeye-web-staging.pid ]; then
    sudo kill "$(cat /tmp/eyeeye-web-staging.pid)" 2>/dev/null || true
    rm -f /tmp/eyeeye-web-staging.pid
  fi
  if command -v fuser >/dev/null 2>&1; then
    sudo fuser -k "${STAGING_PORT}/tcp" 2>/dev/null || true
  fi
  sleep 1
}

verify_web_release() {
  local port="$1"
  local label="$2"
  local full_login="${3:-0}"
  echo "Verifying web (${label}) on port ${port}..."
  if ! curl -sf -o /dev/null "http://127.0.0.1:${port}/login"; then
    echo "ERROR: login page failed on port ${port}" >&2
    return 1
  fi
  CSS_NAME=$(basename "$CSS_FILE")
  local css_code
  css_code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${port}/_next/static/chunks/${CSS_NAME}")
  if [ "$css_code" != "200" ]; then
    echo "ERROR: CSS ${CSS_NAME} returned HTTP ${css_code} on port ${port}" >&2
    return 1
  fi
  WEB_PORT="$port" WEB_URL="http://127.0.0.1:${port}" SMOKE_FULL_LOGIN="${3:-0}" bash "${REPO_ROOT}/infra/smoke-web-auth.sh"
}

echo "Assembling web release in staging..."
sudo rm -rf "$WEB_STAGING"
sudo mkdir -p "$WEB_STAGING/.next"
sudo cp -r /opt/eyeeyeupload-src/apps/web/.next/standalone/. "$WEB_STAGING/"
sudo cp -r /opt/eyeeyeupload-src/apps/web/.next/static "$WEB_STAGING/.next/"
sudo cp -r /opt/eyeeyeupload-src/apps/web/public "$WEB_STAGING/public" 2>/dev/null || true
sudo chown -R www-data:www-data "$WEB_STAGING"

if [ ! -f "$WEB_STAGING/server.js" ]; then
  echo "ERROR: staging server.js missing" >&2
  exit 1
fi
CSS_FILE=$(find "$WEB_STAGING/.next/static/chunks" -maxdepth 1 -name '*.css' | head -1)
if [ -z "$CSS_FILE" ]; then
  echo "ERROR: no CSS chunk in staging build" >&2
  exit 1
fi

if [ -f "$WEB_ROOT/.env" ]; then
  sudo cp "$WEB_ROOT/.env" "$WEB_STAGING/.env"
else
  echo "ERROR: missing ${WEB_ROOT}/.env — cannot verify staging" >&2
  exit 1
fi
sudo chown www-data:www-data "$WEB_STAGING/.env"
sudo chmod 600 "$WEB_STAGING/.env"

echo "Starting staging web on port ${STAGING_PORT}..."
stop_staging_web
sudo -u www-data bash -c "set -a && source '${WEB_STAGING}/.env' && set +a && export PORT='${STAGING_PORT}' AUTH_URL='http://127.0.0.1:${STAGING_PORT}' && cd '${WEB_STAGING}' && exec node server.js" &
echo $! > /tmp/eyeeye-web-staging.pid
sleep 3

if ! curl -sf -o /dev/null --max-time 5 "http://127.0.0.1:${STAGING_PORT}/login"; then
  stop_staging_web
  echo "ERROR: staging web did not start on port ${STAGING_PORT}" >&2
  exit 1
fi

if ! verify_web_release "$STAGING_PORT" "staging" 0; then
  stop_staging_web
  echo "ERROR: staging verification failed — production web unchanged" >&2
  exit 1
fi
stop_staging_web

echo "Swapping web release (brief stop)..."
sudo systemctl stop eyeeye-web 2>/dev/null || true
sudo rm -rf "$WEB_PREV"
if [ -d "$WEB_ROOT" ]; then
  sudo mv "$WEB_ROOT" "$WEB_PREV"
fi
if ! sudo mv "$WEB_STAGING" "$WEB_ROOT"; then
  echo "ERROR: web swap failed, rolling back" >&2
  sudo rm -rf "$WEB_STAGING"
  if [ -d "$WEB_PREV" ]; then
    sudo mv "$WEB_PREV" "$WEB_ROOT"
  fi
  sudo systemctl start eyeeye-web || true
  exit 1
fi
sudo chown -R www-data:www-data "$WEB_ROOT"
if [ -f "$WEB_PREV/.env" ]; then
  sudo cp "$WEB_PREV/.env" "$WEB_ROOT/.env"
  sudo chown www-data:www-data "$WEB_ROOT/.env"
  sudo chmod 600 "$WEB_ROOT/.env"
fi
if [ ! -f "$WEB_ROOT/.env" ]; then
  echo "ERROR: ${WEB_ROOT}/.env missing after swap" >&2
  rollback_web
  exit 1
fi
if ! sudo grep -q '^AUTH_SECRET=.' "$WEB_ROOT/.env"; then
  echo "ERROR: AUTH_SECRET missing in ${WEB_ROOT}/.env" >&2
  rollback_web
  exit 1
fi

echo "Restarting API..."
sudo systemctl restart eyeeye-api
sudo systemctl start eyeeye-web
sleep 5

echo "Verifying production web..."
if ! curl -sf -o /dev/null http://127.0.0.1:8088/healthz; then
  echo "ERROR: API healthz failed" >&2
  rollback_web
  exit 1
fi
set -a
# shellcheck disable=SC1091
eval "$(sudo grep -v '^#' /opt/eyeeye-api/.env | sed 's/^/export /')"
set +a
if ! bash "${REPO_ROOT}/infra/verify-coordinator-login.sh"; then
  echo "ERROR: coordinator login does not match SEED_ADMIN_PASSWORD" >&2
  rollback_web
  exit 1
fi
if ! verify_web_release "$PROD_PORT" "production" 0; then
  rollback_web
  exit 1
fi

echo "Running end-to-end proxy verification..."
if ! bash "${REPO_ROOT}/infra/verify-proxy-auth.sh"; then
  echo "ERROR: verify-proxy-auth failed" >&2
  rollback_web
  exit 1
fi
if ! bash "${REPO_ROOT}/infra/verify-proxy-upload.sh"; then
  echo "ERROR: verify-proxy-upload failed" >&2
  rollback_web
  exit 1
fi

# Ensure nginx proxy buffers for large NextAuth cookies (never overwrite sites-enabled).
if [ -f "${REPO_ROOT}/infra/patch-nginx-buffers.sh" ]; then
  sudo bash "${REPO_ROOT}/infra/patch-nginx-buffers.sh"
fi

sudo rm -rf "$WEB_PREV"

if [ -f "${REPO_ROOT}/infra/install-backup-cron.sh" ]; then
  echo "Installing daily backup cron..."
  sudo bash "${REPO_ROOT}/infra/install-backup-cron.sh"
fi

echo "Deploy build complete (API healthz OK, auth smoke OK, proxy verify OK)"
