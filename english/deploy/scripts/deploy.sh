#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOMAIN="${DOMAIN:?DOMAIN is required}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL is required}"
BACKEND_BIND_PORT="${BACKEND_BIND_PORT:-3302}"
FRONTEND_BIND_PORT="${FRONTEND_BIND_PORT:-3303}"
APP_ENV="${APP_ENV:-main}"

NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://${DOMAIN}}"
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-/api}"
BACKEND_INTERNAL_URL="${BACKEND_INTERNAL_URL:-http://backend:3002}"
CORS_ORIGINS="${CORS_ORIGINS:-${NEXT_PUBLIC_SITE_URL}}"
VOIDDB_URL="${VOIDDB_URL:-https://db.lowkey.su}"
VOIDDB_DATABASE="${VOIDDB_DATABASE:-english}"
VOIDDB_USERNAME="${VOIDDB_USERNAME:-}"
VOIDDB_PASSWORD="${VOIDDB_PASSWORD:-}"
VOIDDB_TOKEN="${VOIDDB_TOKEN:-}"
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME="${NEXT_PUBLIC_TELEGRAM_BOT_USERNAME:-lowkey_english_bot}"
OPENROUTER_URL="${OPENROUTER_URL:-https://openrouter.ai/api/v1}"
OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-}"
OPENROUTER_MODEL="${OPENROUTER_MODEL:-openai/gpt-4o-mini}"
OPENROUTER_SITE_URL="${OPENROUTER_SITE_URL:-${NEXT_PUBLIC_SITE_URL}}"
OPENROUTER_SITE_NAME="${OPENROUTER_SITE_NAME:-LowKey English}"
OPENROUTER_TEMPERATURE="${OPENROUTER_TEMPERATURE:-0.7}"
OPENROUTER_MAX_TOKENS="${OPENROUTER_MAX_TOKENS:-2048}"

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
VOIDDB_URL=${VOIDDB_URL}
VOIDDB_DATABASE=${VOIDDB_DATABASE}
VOIDDB_USERNAME=${VOIDDB_USERNAME}
VOIDDB_PASSWORD=${VOIDDB_PASSWORD}
VOIDDB_TOKEN=${VOIDDB_TOKEN}
NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL}
CORS_ORIGINS=${CORS_ORIGINS}
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=${NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}
OPENROUTER_URL=${OPENROUTER_URL}
OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
OPENROUTER_MODEL=${OPENROUTER_MODEL}
OPENROUTER_SITE_URL=${OPENROUTER_SITE_URL}
OPENROUTER_SITE_NAME=${OPENROUTER_SITE_NAME}
OPENROUTER_TEMPERATURE=${OPENROUTER_TEMPERATURE}
OPENROUTER_MAX_TOKENS=${OPENROUTER_MAX_TOKENS}
EOF
}

has_voiddb_auth() {
  [[ -n "${VOIDDB_TOKEN:-}" ]] || {
    [[ -n "${VOIDDB_USERNAME:-}" ]] && [[ -n "${VOIDDB_PASSWORD:-}" ]]
  }
}

write_backend_env() {
  if [[ -f "${ROOT_DIR}/backend/.env" ]] && { [[ -z "${JWT_SECRET:-}" ]] || ! has_voiddb_auth; }; then
    return
  fi

  : "${JWT_SECRET:?JWT_SECRET is required when backend/.env does not exist}"
  if ! has_voiddb_auth; then
    echo "Set VOIDDB_TOKEN or VOIDDB_USERNAME/VOIDDB_PASSWORD for English deploy." >&2
    exit 1
  fi

  cat > "${ROOT_DIR}/backend/.env" <<EOF
HOST=0.0.0.0
PORT=3002
JWT_SECRET=${JWT_SECRET}
VOIDDB_URL=${VOIDDB_URL}
VOIDDB_DATABASE=${VOIDDB_DATABASE}
VOIDDB_USERNAME=${VOIDDB_USERNAME}
VOIDDB_PASSWORD=${VOIDDB_PASSWORD}
VOIDDB_TOKEN=${VOIDDB_TOKEN}
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}
TELEGRAM_WEBHOOK_URL=${TELEGRAM_WEBHOOK_URL:-${NEXT_PUBLIC_SITE_URL}}
YOKASSA_SHOP_ID=${YOKASSA_SHOP_ID:-}
YOKASSA_SECRET=${YOKASSA_SECRET:-}
YOKASSA_TEST_SHOP_ID=${YOKASSA_TEST_SHOP_ID:-}
YOKASSA_TEST_SECRET=${YOKASSA_TEST_SECRET:-}
YOKASSA_TEST_MODE=${YOKASSA_TEST_MODE:-true}
OPENROUTER_URL=${OPENROUTER_URL}
OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
OPENROUTER_MODEL=${OPENROUTER_MODEL}
OPENROUTER_SITE_URL=${OPENROUTER_SITE_URL}
OPENROUTER_SITE_NAME=${OPENROUTER_SITE_NAME}
OPENROUTER_TEMPERATURE=${OPENROUTER_TEMPERATURE}
OPENROUTER_MAX_TOKENS=${OPENROUTER_MAX_TOKENS}
UPLOADS_DIR=./uploads
FRONTEND_URL=${NEXT_PUBLIC_SITE_URL}
CORS_ORIGINS=${CORS_ORIGINS}
EOF
}

ensure_runtime_dirs() {
  mkdir -p "${ROOT_DIR}/deploy/runtime/${APP_ENV}/uploads"
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

  "${compose_cmd[@]}" run --rm backend bun run sync-db
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
