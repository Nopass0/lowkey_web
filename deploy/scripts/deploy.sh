#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_ENV="${APP_ENV:?APP_ENV is required}"
DOMAIN="${DOMAIN:?DOMAIN is required}"
AI_DOMAIN="${AI_DOMAIN:-}"
N8N_DOMAIN="${N8N_DOMAIN:-}"
BACKEND_BIND_PORT="${BACKEND_BIND_PORT:?BACKEND_BIND_PORT is required}"
FRONTEND_BIND_PORT="${FRONTEND_BIND_PORT:?FRONTEND_BIND_PORT is required}"
N8N_BIND_PORT="${N8N_BIND_PORT:?N8N_BIND_PORT is required}"
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:?NEXT_PUBLIC_API_URL is required}"
NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://${DOMAIN}}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL is required}"
SERVER_NAMES="${DOMAIN}${AI_DOMAIN:+ ${AI_DOMAIN}}"

require_backend_env() {
  local key="$1"
  local value="${!key:-}"

  [[ -n "${value}" ]]
}

render_template() {
  local template_path="$1"
  local target_path="$2"

  sed \
    -e "s/__DOMAIN__/${DOMAIN}/g" \
    -e "s/__SERVER_NAMES__/${SERVER_NAMES}/g" \
    -e "s/__BACKEND_PORT__/${BACKEND_BIND_PORT}/g" \
    -e "s/__FRONTEND_PORT__/${FRONTEND_BIND_PORT}/g" \
    "${template_path}" > "${target_path}"
}

ensure_server_packages() {
  "${ROOT_DIR}/deploy/scripts/provision-server.sh"
}

append_n8n_http_config() {
  local target_path="$1"

  [[ -n "${N8N_DOMAIN}" ]] || return

  cat >> "${target_path}" <<EOF

server {
    listen 80;
    listen [::]:80;
    server_name ${N8N_DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:${N8N_BIND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
}

append_n8n_https_config() {
  local target_path="$1"

  [[ -n "${N8N_DOMAIN}" ]] || return

  cat >> "${target_path}" <<EOF

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${N8N_DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${N8N_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${N8N_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_prefer_server_ciphers off;

    client_max_body_size 25m;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:${N8N_BIND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
}

write_compose_env_file() {
  local compose_tmp

  compose_tmp="$(mktemp)"

  cat > "${compose_tmp}" <<EOF
APP_ENV=${APP_ENV}
BACKEND_BIND_PORT=${BACKEND_BIND_PORT}
FRONTEND_BIND_PORT=${FRONTEND_BIND_PORT}
N8N_BIND_PORT=${N8N_BIND_PORT}
GENERIC_TIMEZONE=${GENERIC_TIMEZONE:-Asia/Yekaterinburg}
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
EOF
  mv "${compose_tmp}" "${ROOT_DIR}/.env.compose"
}

write_backend_env_file() {
  local backend_tmp

  if ! require_backend_env DATABASE_URL ||
    ! require_backend_env REDIS_URL ||
    ! require_backend_env JWT_SECRET ||
    ! require_backend_env JWT_EXPIRY ||
    ! require_backend_env ADMIN_LOGIN ||
    ! require_backend_env ADMIN_JWT_EXPIRY ||
    ! require_backend_env TELEGRAM_BOT_TOKEN ||
    ! require_backend_env TELEGRAM_ADMIN_CHAT_ID ||
    ! require_backend_env TOCHKA_API_KEY ||
    ! require_backend_env TOCHKA_ACCOUNT_ID ||
    ! require_backend_env TOCHKA_MERCHANT_ID; then
    if [[ -s "${ROOT_DIR}/.env.backend" ]]; then
      return
    fi

    echo "Missing backend environment variables and no existing .env.backend found" >&2
    exit 1
  fi

  backend_tmp="$(mktemp)"

  cat > "${backend_tmp}" <<EOF
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
BLOB_READ_WRITE_TOKEN=${BLOB_READ_WRITE_TOKEN:-}
OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-}
OPENROUTER_DEFAULT_MODEL=${OPENROUTER_DEFAULT_MODEL:-openai/gpt-4o-mini}
AI_LOCAL_BASE_URL=${AI_LOCAL_BASE_URL:-http://ollama:11434}
AI_LOCAL_MODEL=${AI_LOCAL_MODEL:-qwen3.5:0.8b}
APP_FILES_DIR=./uploads
PORT=3001
NODE_ENV=production
EOF
  mv "${backend_tmp}" "${ROOT_DIR}/.env.backend"
}

write_n8n_env_file() {
  local n8n_tmp
  local n8n_encryption_key

  n8n_encryption_key="${N8N_ENCRYPTION_KEY:-${JWT_SECRET:-}}"

  if [[ -z "${n8n_encryption_key}" && -s "${ROOT_DIR}/.env.n8n" ]]; then
    return
  fi

  n8n_tmp="$(mktemp)"

  cat > "${n8n_tmp}" <<EOF
N8N_HOST=${N8N_DOMAIN}
N8N_PORT=5678
N8N_PROTOCOL=https
N8N_EDITOR_BASE_URL=https://${N8N_DOMAIN}
WEBHOOK_URL=https://${N8N_DOMAIN}/
N8N_ENCRYPTION_KEY=${n8n_encryption_key}
NODE_ENV=production
N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
N8N_RUNNERS_ENABLED=true
N8N_DIAGNOSTICS_ENABLED=false
N8N_PERSONALIZATION_ENABLED=false
NODE_FUNCTION_ALLOW_BUILTIN=*
NODE_FUNCTION_ALLOW_EXTERNAL=axios,lodash,dayjs,moment,uuid,zod,cheerio
GENERIC_TIMEZONE=${GENERIC_TIMEZONE:-Asia/Yekaterinburg}
TZ=${GENERIC_TIMEZONE:-Asia/Yekaterinburg}
N8N_BASIC_AUTH_ACTIVE=${N8N_BASIC_AUTH_ACTIVE:-false}
N8N_BASIC_AUTH_USER=${N8N_BASIC_AUTH_USER:-}
N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD:-}
EOF
  mv "${n8n_tmp}" "${ROOT_DIR}/.env.n8n"
}

write_env_files() {
  local n8n_runtime_dir="${ROOT_DIR}/deploy/runtime/${APP_ENV}/n8n"

  write_compose_env_file
  write_backend_env_file
  write_n8n_env_file

  mkdir -p "${ROOT_DIR}/deploy/runtime/${APP_ENV}/uploads"
  mkdir -p "${n8n_runtime_dir}"
  chown -R 1000:1000 "${n8n_runtime_dir}"
}

install_nginx_config() {
  local target="/etc/nginx/sites-available/lowkey-${APP_ENV}.conf"
  local enabled="/etc/nginx/sites-enabled/lowkey-${APP_ENV}.conf"
  local cert_dir="/etc/letsencrypt/live/${DOMAIN}"
  local n8n_cert_dir=""

  if [[ -n "${N8N_DOMAIN}" ]]; then
    n8n_cert_dir="/etc/letsencrypt/live/${N8N_DOMAIN}"
  fi

  if [[ -f "${cert_dir}/fullchain.pem" && -f "${cert_dir}/privkey.pem" ]]; then
    render_template "${ROOT_DIR}/deploy/nginx-https.conf.template" "${target}"
  else
    render_template "${ROOT_DIR}/deploy/nginx-http.conf.template" "${target}"
  fi

  append_n8n_http_config "${target}"

  if [[ -n "${n8n_cert_dir}" && -f "${n8n_cert_dir}/fullchain.pem" && -f "${n8n_cert_dir}/privkey.pem" ]]; then
    append_n8n_https_config "${target}"
  fi

  ln -sf "${target}" "${enabled}"
  nginx -t
  systemctl reload nginx
}

ensure_certificate() {
  local cert_dir="/etc/letsencrypt/live/${DOMAIN}"
  local n8n_cert_dir=""
  local needs_expand="false"

  if [[ -n "${N8N_DOMAIN}" ]]; then
    n8n_cert_dir="/etc/letsencrypt/live/${N8N_DOMAIN}"
  fi

  if [[ -f "${cert_dir}/fullchain.pem" && -f "${cert_dir}/privkey.pem" ]]; then
    if [[ -n "${AI_DOMAIN}" ]]; then
      if ! openssl x509 -in "${cert_dir}/fullchain.pem" -noout -text | grep -q "DNS:${AI_DOMAIN}"; then
        needs_expand="true"
      fi
    else
      needs_expand="false"
    fi
  fi

  if [[ ! -f "${cert_dir}/fullchain.pem" || ! -f "${cert_dir}/privkey.pem" || "${needs_expand}" == "true" ]]; then
    local certbot_args=(
      certbot certonly
      --webroot
      -w /var/www/certbot
      -d "${DOMAIN}"
      --non-interactive
      --agree-tos
      -m "${LETSENCRYPT_EMAIL}"
    )

    if [[ -n "${AI_DOMAIN}" ]]; then
      certbot_args+=(-d "${AI_DOMAIN}")
    fi

    if [[ "${needs_expand}" == "true" ]]; then
      certbot_args+=(--expand)
    fi

    "${certbot_args[@]}"
  fi

  if [[ -n "${N8N_DOMAIN}" && ! -f "${n8n_cert_dir}/fullchain.pem" ]]; then
    certbot certonly \
      --webroot \
      -w /var/www/certbot \
      -d "${N8N_DOMAIN}" \
      --cert-name "${N8N_DOMAIN}" \
      --non-interactive \
      --agree-tos \
      -m "${LETSENCRYPT_EMAIL}"
  fi
}

deploy_stack() {
  cd "${ROOT_DIR}"
  local compose_cmd=(docker compose --env-file .env.compose -p "lowkey-${APP_ENV}")

  export DOCKER_BUILDKIT=1
  export COMPOSE_DOCKER_CLI_BUILD=1

  "${compose_cmd[@]}" up -d --remove-orphans ollama backend frontend n8n

  local backend_url="http://127.0.0.1:${BACKEND_BIND_PORT}/"
  local frontend_url="http://127.0.0.1:${FRONTEND_BIND_PORT}/"
  local attempt

  for attempt in {1..24}; do
    if curl -fsS "${backend_url}" >/dev/null; then
      break
    fi
    sleep 5
  done

  if ! curl -fsS "${backend_url}" >/dev/null; then
    echo "Backend did not become healthy: ${backend_url}" >&2
    "${compose_cmd[@]}" ps >&2 || true
    "${compose_cmd[@]}" logs --tail=200 backend >&2 || true
    exit 1
  fi

  for attempt in {1..72}; do
    if curl -fsS "${frontend_url}" >/dev/null; then
      break
    fi
    sleep 5
  done

  if ! curl -fsS "${frontend_url}" >/dev/null; then
    echo "Frontend did not become healthy: ${frontend_url}" >&2
    "${compose_cmd[@]}" ps >&2 || true
    "${compose_cmd[@]}" logs --tail=200 frontend >&2 || true
    exit 1
  fi

  local n8n_url="http://127.0.0.1:${N8N_BIND_PORT}/"

  for attempt in {1..36}; do
    if curl -fsS "${n8n_url}" >/dev/null; then
      "${compose_cmd[@]}" exec -T ollama ollama pull "${AI_LOCAL_MODEL:-qwen3.5:0.8b}" || true
      return
    fi
    sleep 5
  done

  echo "n8n did not become healthy: ${n8n_url}" >&2
  "${compose_cmd[@]}" ps >&2 || true
  "${compose_cmd[@]}" logs --tail=200 n8n >&2 || true
  exit 1
}

ensure_server_packages
write_env_files
install_nginx_config
ensure_certificate
install_nginx_config
deploy_stack
