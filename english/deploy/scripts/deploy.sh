#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOMAIN="${DOMAIN:?DOMAIN is required}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL is required}"
BACKEND_BIND_PORT="${BACKEND_BIND_PORT:-3302}"
FRONTEND_BIND_PORT="${FRONTEND_BIND_PORT:-3303}"
VOIDDB_BIND_PORT="${VOIDDB_BIND_PORT:-7711}"
BITLLM_BIND_PORT="${BITLLM_BIND_PORT:-8180}"
APP_ENV="${APP_ENV:-main}"

NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://${DOMAIN}}"
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-/api}"
BACKEND_INTERNAL_URL="${BACKEND_INTERNAL_URL:-http://backend:3002}"
CORS_ORIGINS="${CORS_ORIGINS:-${NEXT_PUBLIC_SITE_URL}}"
VOIDDB_API_KEY="${VOIDDB_API_KEY:-english-voiddb-key}"
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME="${NEXT_PUBLIC_TELEGRAM_BOT_USERNAME:-lowkey_english_bot}"

BITNET_MODEL_REPO="${BITNET_MODEL_REPO:-1bitLLM/bitnet_b1_58-large}"
BITNET_MODEL_DIR_NAME="${BITNET_MODEL_DIR_NAME:-bitnet_b1_58-large}"
BITNET_QUANT_TYPE="${BITNET_QUANT_TYPE:-i2_s}"
BITNET_USE_PRETUNED="${BITNET_USE_PRETUNED:-1}"
BITNET_THREADS="${BITNET_THREADS:-4}"
BITNET_CTX_SIZE="${BITNET_CTX_SIZE:-4096}"
BITNET_TEMPERATURE="${BITNET_TEMPERATURE:-0.7}"
BITNET_N_PREDICT="${BITNET_N_PREDICT:-1024}"

render_template() {
  local template_path="$1"
  local target_path="$2"

  sed \
    -e "s/__DOMAIN__/${DOMAIN}/g" \
    -e "s/__BACKEND_PORT__/${BACKEND_BIND_PORT}/g" \
    -e "s/__FRONTEND_PORT__/${FRONTEND_BIND_PORT}/g" \
    "${template_path}" > "${target_path}"
}

write_compose_env() {
  cat > "${ROOT_DIR}/.env.compose" <<EOF
APP_ENV=${APP_ENV}
FRONTEND_BIND_PORT=${FRONTEND_BIND_PORT}
BACKEND_BIND_PORT=${BACKEND_BIND_PORT}
VOIDDB_BIND_PORT=${VOIDDB_BIND_PORT}
BITLLM_BIND_PORT=${BITLLM_BIND_PORT}
VOIDDB_API_KEY=${VOIDDB_API_KEY}
NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL}
CORS_ORIGINS=${CORS_ORIGINS}
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=${NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}
BITNET_MODEL_REPO=${BITNET_MODEL_REPO}
BITNET_MODEL_DIR_NAME=${BITNET_MODEL_DIR_NAME}
BITNET_QUANT_TYPE=${BITNET_QUANT_TYPE}
BITNET_USE_PRETUNED=${BITNET_USE_PRETUNED}
BITNET_THREADS=${BITNET_THREADS}
BITNET_CTX_SIZE=${BITNET_CTX_SIZE}
BITNET_TEMPERATURE=${BITNET_TEMPERATURE}
BITNET_N_PREDICT=${BITNET_N_PREDICT}
EOF
}

write_backend_env() {
  if [[ -z "${JWT_SECRET:-}" && -f "${ROOT_DIR}/backend/.env" ]]; then
    return
  fi

  : "${JWT_SECRET:?JWT_SECRET is required when backend/.env does not exist}"

  cat > "${ROOT_DIR}/backend/.env" <<EOF
HOST=0.0.0.0
PORT=3002
JWT_SECRET=${JWT_SECRET}
VOIDDB_URL=http://voiddb:7700
VOIDDB_API_KEY=${VOIDDB_API_KEY}
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}
TELEGRAM_WEBHOOK_URL=${TELEGRAM_WEBHOOK_URL:-${NEXT_PUBLIC_SITE_URL}}
YOKASSA_SHOP_ID=${YOKASSA_SHOP_ID:-}
YOKASSA_SECRET=${YOKASSA_SECRET:-}
YOKASSA_TEST_SHOP_ID=${YOKASSA_TEST_SHOP_ID:-}
YOKASSA_TEST_SECRET=${YOKASSA_TEST_SECRET:-}
YOKASSA_TEST_MODE=${YOKASSA_TEST_MODE:-true}
BITLLM_URL=http://bitllm:8080
BITLLM_API_KEY=${BITLLM_API_KEY:-}
UPLOADS_DIR=./uploads
FRONTEND_URL=${NEXT_PUBLIC_SITE_URL}
CORS_ORIGINS=${CORS_ORIGINS}
EOF
}

ensure_runtime_dirs() {
  mkdir -p "${ROOT_DIR}/deploy/runtime/${APP_ENV}/uploads"
  mkdir -p "${ROOT_DIR}/deploy/runtime/${APP_ENV}/voiddb"
}

install_nginx_config() {
  local target="/etc/nginx/sites-available/lowkey-english.conf"
  local enabled="/etc/nginx/sites-enabled/lowkey-english.conf"
  local cert_dir="/etc/letsencrypt/live/${DOMAIN}"

  if [[ -f "${cert_dir}/fullchain.pem" && -f "${cert_dir}/privkey.pem" ]]; then
    render_template "${ROOT_DIR}/deploy/nginx-https.conf.template" "${target}"
  else
    render_template "${ROOT_DIR}/deploy/nginx-http.conf.template" "${target}"
  fi

  ln -sf "${target}" "${enabled}"
  nginx -t
  systemctl reload nginx
}

ensure_certificate() {
  local cert_dir="/etc/letsencrypt/live/${DOMAIN}"

  if [[ -f "${cert_dir}/fullchain.pem" && -f "${cert_dir}/privkey.pem" ]]; then
    return
  fi

  certbot certonly \
    --webroot \
    -w /var/www/certbot \
    -d "${DOMAIN}" \
    --non-interactive \
    --agree-tos \
    -m "${LETSENCRYPT_EMAIL}"
}

wait_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"

  for attempt in $(seq 1 "${attempts}"); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      echo "${label} is healthy: ${url}"
      return 0
    fi
    sleep 2
  done

  echo "${label} did not become healthy: ${url}" >&2
  return 1
}

deploy_stack() {
  cd "${ROOT_DIR}"
  local compose_cmd=(docker compose --env-file .env.compose)

  "${compose_cmd[@]}" up -d --build --remove-orphans voiddb bitllm
  wait_http "http://127.0.0.1:${VOIDDB_BIND_PORT}/health" "VoidDB" 90
  wait_http "http://127.0.0.1:${BITLLM_BIND_PORT}/v1/models" "BitLLM" 450

  "${compose_cmd[@]}" run --rm \
    -e VOIDDB_URL=http://voiddb:7700 \
    -e VOIDDB_API_KEY="${VOIDDB_API_KEY}" \
    backend bun run sync-db

  "${compose_cmd[@]}" up -d --build --remove-orphans backend frontend
  wait_http "http://127.0.0.1:${BACKEND_BIND_PORT}/health" "Backend" 90
  wait_http "http://127.0.0.1:${FRONTEND_BIND_PORT}" "Frontend" 180
}

"${ROOT_DIR}/deploy/scripts/provision-server.sh"
write_compose_env
write_backend_env
ensure_runtime_dirs
install_nginx_config
ensure_certificate
install_nginx_config
deploy_stack
