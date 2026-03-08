#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_ENV="${APP_ENV:?APP_ENV is required}"
DOMAIN="${DOMAIN:?DOMAIN is required}"
BACKEND_BIND_PORT="${BACKEND_BIND_PORT:?BACKEND_BIND_PORT is required}"
FRONTEND_BIND_PORT="${FRONTEND_BIND_PORT:?FRONTEND_BIND_PORT is required}"
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:?NEXT_PUBLIC_API_URL is required}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL is required}"

render_template() {
  local template_path="$1"
  local target_path="$2"

  sed \
    -e "s/__DOMAIN__/${DOMAIN}/g" \
    -e "s/__BACKEND_PORT__/${BACKEND_BIND_PORT}/g" \
    -e "s/__FRONTEND_PORT__/${FRONTEND_BIND_PORT}/g" \
    "${template_path}" > "${target_path}"
}

ensure_server_packages() {
  "${ROOT_DIR}/deploy/scripts/provision-server.sh"
}

write_env_files() {
  cat > "${ROOT_DIR}/.env.compose" <<EOF
APP_ENV=${APP_ENV}
BACKEND_BIND_PORT=${BACKEND_BIND_PORT}
FRONTEND_BIND_PORT=${FRONTEND_BIND_PORT}
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
EOF

  cat > "${ROOT_DIR}/.env.backend" <<EOF
DATABASE_URL=${DATABASE_URL}
REDIS_URL=${REDIS_URL}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY=${JWT_EXPIRY}
ADMIN_LOGIN=${ADMIN_LOGIN}
ADMIN_JWT_EXPIRY=${ADMIN_JWT_EXPIRY}
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_ADMIN_CHAT_ID=${TELEGRAM_ADMIN_CHAT_ID}
TOCHKA_API_KEY=${TOCHKA_API_KEY}
TOCHKA_ACCOUNT_ID=${TOCHKA_ACCOUNT_ID}
TOCHKA_MERCHANT_ID=${TOCHKA_MERCHANT_ID}
APP_FILES_DIR=./uploads
PORT=3001
NODE_ENV=production
EOF

  mkdir -p "${ROOT_DIR}/deploy/runtime/${APP_ENV}/uploads"
}

install_nginx_config() {
  local target="/etc/nginx/sites-available/lowkey-${APP_ENV}.conf"
  local enabled="/etc/nginx/sites-enabled/lowkey-${APP_ENV}.conf"
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

deploy_stack() {
  cd "${ROOT_DIR}"
  docker compose --env-file .env.compose -p "lowkey-${APP_ENV}" up -d --build --remove-orphans
}

ensure_server_packages
write_env_files
install_nginx_config
ensure_certificate
install_nginx_config
deploy_stack
