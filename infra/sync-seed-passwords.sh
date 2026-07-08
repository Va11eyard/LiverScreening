#!/bin/bash
set -euo pipefail
export PATH="/usr/local/go/bin:$PATH"

ENV_API=/opt/liverscreening-api/.env
cd /opt/liverscreening-src

read_env() {
  sudo grep -m1 "^$1=" "$ENV_API" | cut -d= -f2-
}

export DATABASE_URL="$(read_env DATABASE_URL)"
export SEED_ADMIN_EMAIL="$(read_env SEED_ADMIN_EMAIL)"
export SEED_ADMIN_PASSWORD="$(read_env SEED_ADMIN_PASSWORD)"
export SEED_DOCTOR_PASSWORD="$(read_env SEED_DOCTOR_PASSWORD)"
export SEED_DOCTOR_PASSWORDS_FILE="$(read_env SEED_DOCTOR_PASSWORDS_FILE)"
export SEED_ROTATE_PASSWORDS=1

go run ./scripts/seed-users
echo "Passwords synced from ${ENV_API}"
