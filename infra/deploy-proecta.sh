#!/bin/bash
set -euo pipefail
export PATH="/usr/local/go/bin:$PATH"

sudo mkdir -p /opt/liverscreening-api /opt/liverscreening-web /opt/liverscreening-data/uploads /var/log/liverscreening
sudo chown ubuntu:ubuntu /opt/liverscreening-api /opt/liverscreening-web
sudo chown www-data:www-data /opt/liverscreening-data/uploads /var/log/liverscreening
sudo chmod 750 /var/log/liverscreening

ENV_API=/opt/liverscreening-api/.env
ENV_WEB=/opt/liverscreening-web/.env

if [ ! -f "$ENV_API" ]; then
  JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
  AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
  DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
  SEED_PASS=$(openssl rand -base64 18 | tr -d '/+=' | head -c 18)
  DOCTOR_PASS=$(openssl rand -base64 18 | tr -d '/+=' | head -c 18)

  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='liver'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE USER liver WITH PASSWORD '${DB_PASS}';"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='liver'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE liver OWNER liver;"

  sudo tee "$ENV_API" >/dev/null <<ENV
APP_ENV=production
LISTEN_HOST=127.0.0.1
PORT=8089
DATABASE_URL=postgres://liver:${DB_PASS}@localhost:5432/liver?sslmode=disable
JWT_SECRET=${JWT_SECRET}
CORS_ALLOWED_ORIGINS=https://platform.cornea.kz
SEED_ADMIN_EMAIL=coordinator@liver.kz
SEED_ADMIN_PASSWORD=${SEED_PASS}
SEED_DOCTOR_PASSWORD=${DOCTOR_PASS}
SEED_DOCTOR_PASSWORDS_FILE=/opt/liverscreening-api/doctor-passwords.env
ACCESS_TOKEN_TTL=1h
TRUSTED_PROXY_IPS=127.0.0.1,::1
API_RATE_LIMIT_MAX=120
REFRESH_RATE_LIMIT_MAX=20
UPLOAD_DIR=/opt/liverscreening-data/uploads
AUDIT_LOG_PATH=/var/log/liverscreening/audit.jsonl
AI_INFERENCE_URL=
AI_INFERENCE_API_KEY=
ENV

  sudo tee "$ENV_WEB" >/dev/null <<ENV
APP_ENV=production
AUTH_SECRET=${AUTH_SECRET}
AUTH_URL=https://platform.cornea.kz
PORT=3024
API_URL=http://127.0.0.1:8089
API_PROXY_TARGET=http://127.0.0.1:8089
NEXT_PUBLIC_SCREENING_URL=https://screening.cornea.kz
NEXT_PUBLIC_ML_LAB_URL=https://ml.cornea.kz
NODE_ENV=production
ENV

  sudo chmod 600 "$ENV_API" "$ENV_WEB"
  sudo chown ubuntu:ubuntu "$ENV_API" "$ENV_WEB"
  echo "Initial coordinator password (save securely): ${SEED_PASS}" >&2
fi

if [ -f "$ENV_API" ] && ! sudo grep -q '^UPLOAD_DIR=' "$ENV_API"; then
  echo 'UPLOAD_DIR=/opt/liverscreening-data/uploads' | sudo tee -a "$ENV_API" >/dev/null
fi
if [ -f "$ENV_API" ] && ! sudo grep -q '^AUDIT_LOG_PATH=' "$ENV_API"; then
  echo 'AUDIT_LOG_PATH=/var/log/liverscreening/audit.jsonl' | sudo tee -a "$ENV_API" >/dev/null
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
  echo 'SEED_DOCTOR_PASSWORDS_FILE=/opt/liverscreening-api/doctor-passwords.env' | sudo tee -a "$ENV_API" >/dev/null
fi

sudo mkdir -p /opt/liverscreening-data/uploads /var/log/liverscreening
sudo chown www-data:www-data /opt/liverscreening-data/uploads /var/log/liverscreening
sudo chmod 750 /var/log/liverscreening

cd /opt/liverscreening-src
sudo -u ubuntu env PATH="$PATH" CGO_ENABLED=0 go build -buildvcs=false -o /opt/liverscreening-api/liverscreening-api ./cmd/api

echo "Syncing pilot users (metadata only; passwords unchanged unless SEED_ROTATE_PASSWORDS=1)..."
set -a
eval "$(sudo grep -v '^#' /opt/liverscreening-api/.env | sed 's/^/export /')"
set +a
sudo -u ubuntu env PATH="$PATH" \
  DATABASE_URL="$DATABASE_URL" \
  SEED_ADMIN_EMAIL="$SEED_ADMIN_EMAIL" \
  SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" \
  SEED_DOCTOR_PASSWORD="$SEED_DOCTOR_PASSWORD" \
  SEED_DOCTOR_PASSWORDS_FILE="${SEED_DOCTOR_PASSWORDS_FILE:-/opt/liverscreening-api/doctor-passwords.env}" \
  go run ./scripts/seed-users

cd /opt/liverscreening-src/apps/web
set -a
source /opt/liverscreening-web/.env
set +a
if [ -f pnpm-workspace.yaml ] && ! grep -q '^packages:' pnpm-workspace.yaml; then
  mv pnpm-workspace.yaml pnpm-workspace.yaml.bak
fi
NODE_ENV=development pnpm install --frozen-lockfile
NODE_ENV=production pnpm build
[ -f pnpm-workspace.yaml.bak ] && mv pnpm-workspace.yaml.bak pnpm-workspace.yaml

WEB_ROOT=/opt/liverscreening-web
WEB_STAGING=/opt/liverscreening-web-staging
WEB_PREV=/opt/liverscreening-web-prev
STAGING_PORT=3026
PROD_PORT=3024
REPO_ROOT=/opt/liverscreening-src

rollback_web() {
  echo "Rolling back web release..." >&2
  sudo systemctl stop liverscreening-web 2>/dev/null || true
  sudo rm -rf "$WEB_ROOT"
  if [ -d "$WEB_PREV" ]; then
    sudo mv "$WEB_PREV" "$WEB_ROOT"
  fi
  sudo systemctl start liverscreening-web || true
}

stop_staging_web() {
  if [ -f /tmp/liverscreening-web-staging.pid ]; then
    sudo kill "$(cat /tmp/liverscreening-web-staging.pid)" 2>/dev/null || true
    rm -f /tmp/liverscreening-web-staging.pid
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
sudo cp -r /opt/liverscreening-src/apps/web/.next/standalone/. "$WEB_STAGING/"
sudo cp -r /opt/liverscreening-src/apps/web/.next/static "$WEB_STAGING/.next/"
sudo cp -r /opt/liverscreening-src/apps/web/public "$WEB_STAGING/public" 2>/dev/null || true
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
echo $! > /tmp/liverscreening-web-staging.pid
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
sudo systemctl stop liverscreening-web 2>/dev/null || true
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
  sudo systemctl start liverscreening-web || true
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
sudo systemctl restart liverscreening-api
sudo systemctl start liverscreening-web
sleep 5

echo "Verifying production web..."
if ! curl -sf -o /dev/null http://127.0.0.1:8089/healthz; then
  echo "ERROR: API healthz failed" >&2
  rollback_web
  exit 1
fi
set -a
eval "$(sudo grep -v '^#' /opt/liverscreening-api/.env | sed 's/^/export /')"
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

if [ -f "${REPO_ROOT}/infra/patch-nginx-buffers.sh" ]; then
  sudo bash "${REPO_ROOT}/infra/patch-nginx-buffers.sh"
fi

sudo rm -rf "$WEB_PREV"

if [ -f "${REPO_ROOT}/infra/install-backup-cron.sh" ]; then
  echo "Installing daily backup cron..."
  sudo bash "${REPO_ROOT}/infra/install-backup-cron.sh"
fi

echo "Deploy build complete (API healthz OK, auth smoke OK, proxy verify OK)"

ML_API_ENV=/opt/liverscreening-ml-api/.env
ML_ROOT=/opt/liverscreening-ml-lab
SCREEN_ROOT=/opt/liverscreening-screening

if [ ! -f "$ML_API_ENV" ]; then
  sudo mkdir -p /opt/liverscreening-ml-api
  echo 'PORT=8001' | sudo tee "$ML_API_ENV" >/dev/null
  echo 'APP_ENV=production' | sudo tee -a "$ML_API_ENV" >/dev/null
  sudo chmod 600 "$ML_API_ENV"
fi

echo "Installing systemd units (liverscreening only)..."
sudo cp "${REPO_ROOT}/infra/liverscreening-api.service" /etc/systemd/system/
sudo cp "${REPO_ROOT}/infra/liverscreening-web.service" /etc/systemd/system/
sudo cp "${REPO_ROOT}/infra/liverscreening-ml-api.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable liverscreening-api liverscreening-web liverscreening-ml-api

echo "Setting up ML API venv..."
cd "${REPO_ROOT}/services/ml-api"
if [ ! -d .venv ]; then
  sudo -u www-data python3 -m venv .venv
fi
sudo -u www-data .venv/bin/pip install -q -r requirements.txt -r requirements-cds.txt
sudo systemctl restart liverscreening-ml-api || sudo systemctl start liverscreening-ml-api

echo "Building ML Lab and public screener..."
cd "${REPO_ROOT}"
if [ -f pnpm-workspace.yaml ] && ! grep -q '^packages:' pnpm-workspace.yaml; then
  mv pnpm-workspace.yaml pnpm-workspace.yaml.bak
fi
NODE_ENV=development pnpm install --frozen-lockfile
[ -f pnpm-workspace.yaml.bak ] && mv pnpm-workspace.yaml.bak pnpm-workspace.yaml

cd "${REPO_ROOT}/apps/ml-lab"
VITE_ML_API_URL="https://${ML_LAB_DOMAIN:-ml.cornea.kz}" \
VITE_PLATFORM_URL="https://${PLATFORM_DOMAIN:-platform.cornea.kz}" \
pnpm build
sudo rm -rf "$ML_ROOT"
sudo mkdir -p "$ML_ROOT"
sudo cp -r dist/. "$ML_ROOT/"
sudo chown -R www-data:www-data "$ML_ROOT"

cd "${REPO_ROOT}/apps/liver-screening"
pnpm build
sudo rm -rf "$SCREEN_ROOT"
sudo mkdir -p "$SCREEN_ROOT"
sudo cp -r dist/. "$SCREEN_ROOT/"
sudo chown -R www-data:www-data "$SCREEN_ROOT"

echo "Installing nginx vhosts (does not modify eyeeye)..."
for site in platform.cornea.kz ml.cornea.kz screening.cornea.kz; do
  sudo cp "${REPO_ROOT}/infra/nginx/${site}.conf" "/etc/nginx/sites-available/${site}"
  sudo ln -sf "/etc/nginx/sites-available/${site}" "/etc/nginx/sites-enabled/${site}"
done
sudo nginx -t
sudo systemctl reload nginx

echo "LiverScreening full deploy complete (platform :3024, API :8089, ML API :8001)"
