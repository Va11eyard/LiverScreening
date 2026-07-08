#!/bin/bash
# Resolve smoke-test password for pilot users (never echo to logs in CI).
load_test_password() {
  local email="$1"
  if [ -n "${TEST_PASSWORD:-}" ]; then
    printf '%s' "$TEST_PASSWORD"
    return 0
  fi
  if [ "${email,,}" = "coordinator@eyeeye.kz" ]; then
    if [ -n "${SEED_ADMIN_PASSWORD:-}" ]; then
      printf '%s' "$SEED_ADMIN_PASSWORD"
      return 0
    fi
    local env_file="${ENV_API:-/opt/eyeeye-api/.env}"
    if [ -f "$env_file" ]; then
      local admin_pass=""
      admin_pass=$(grep -m1 '^SEED_ADMIN_PASSWORD=' "$env_file" 2>/dev/null | cut -d= -f2- || true)
      if [ -z "$admin_pass" ] && command -v sudo >/dev/null 2>&1; then
        admin_pass=$(sudo grep -m1 '^SEED_ADMIN_PASSWORD=' "$env_file" 2>/dev/null | cut -d= -f2- || true)
      fi
      if [ -n "$admin_pass" ]; then
        printf '%s' "$admin_pass"
        return 0
      fi
    fi
    local cred_file
    cred_file=$(ls -t /opt/eyeeye-api/credentials-*.txt 2>/dev/null | head -1 || true)
    if [ -n "$cred_file" ] && [ -f "$cred_file" ]; then
      local cred_line
      cred_line=$(grep -i '^coordinator@eyeeye.kz=' "$cred_file" | head -1 || true)
      if [ -n "$cred_line" ]; then
        printf '%s' "${cred_line#*=}"
        return 0
      fi
    fi
  fi
  local file="${DOCTOR_PASSWORDS_FILE:-/opt/eyeeye-api/doctor-passwords.env}"
  if [ -f "$file" ]; then
    local line
    line=$(grep -i "^${email}=" "$file" | head -1 || true)
    if [ -n "$line" ]; then
      printf '%s' "${line#*=}"
      return 0
    fi
  fi
  printf '%s' "Doctor123!"
}
