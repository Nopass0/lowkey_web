#!/usr/bin/env bash
#
# issue-wildcard-cert.sh — выпуск wildcard-сертификата *.lowkey.su через DNS-01.
#
# Почему DNS-01: wildcard-сертификаты (*.lowkey.su) Let's Encrypt выдаёт ТОЛЬКО
# через DNS-01 challenge (это ограничение ACME, не инструмента). HTTP-01 wildcard
# не поддерживает.
#
# Почему РУЧНОЙ режим (--dns без плагина): у DNS-провайдера aeza нет публичного
# DNS API (их официальный SDK управляет только серверами, не DNS-записями), поэтому
# автоматического плагина certbot/acme.sh для aeza не существует. Этот скрипт
# использует acme.sh в manual-DNS режиме: он печатает TXT-значение, вы добавляете
# запись _acme-challenge вручную в панель aeza, нажимаете Enter — выпуск завершается.
#
# Покрытие сертификата: lowkey.su + *.lowkey.su → закрывает lowkey.su, s1.lowkey.su,
# s2.lowkey.su, ai.lowkey.su, n8n.lowkey.su и любые будущие узлы одним сертификатом.
#
# Поведение после выпуска:
#   - Сертификат сохраняется в /etc/letsencrypt/live/<DOMAIN>/ (fullchain.pem + privkey.pem).
#   - deploy.sh автоматически подхватит его при следующем деплое (ensure_certificate()
#     видит готовый сертификат и пропускает выпуск через HTTP-01).
#   - При наличии WILDCARD_INSTALLED маркера nginx-шаблон использует wildcard cert.
#
# ПЕРЕВЫПУСК: раз в 60 дней. acme.sh ставит cron при --install. Скрипт выводит
# напоминание. Для перевыпуска повторно запустите этот скрипт (он обновит TXT).
#
# Установка acme.sh (если ещё нет):
#   curl https://get.acme.sh -s | sh -s email=<LETSENCRYPT_EMAIL>
#   source ~/.bashrc   # или перелогиниться
#
# Использование (на production сервере, под root):
#   DOMAIN=lowkey.su \
#   LETSENCRYPT_EMAIL=you@example.com \
#   ./deploy/scripts/issue-wildcard-cert.sh
#
# Переменные окружения:
#   DOMAIN            — корневой домен (default: lowkey.su)
#   LETSENCRYPT_EMAIL — email для Let's Encrypt (обязателен)
#   STAGE             — "1" для staging (тестовый cert, не расходует лимиты LE)
#   FORCE             — "1" перевыпустить даже если cert существует
#
set -euo pipefail

DOMAIN="${DOMAIN:-lowkey.su}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
STAGE="${STAGE:-0}"
FORCE="${FORCE:-0}"

if [[ -z "${LETSENCRYPT_EMAIL}" ]]; then
  echo "ERROR: LETSENCRYPT_EMAIL is required (used for Let's Encrypt account)" >&2
  echo 'Usage: DOMAIN=lowkey.su LETSENCRYPT_EMAIL=you@example.com ./issue-wildcard-cert.sh' >&2
  exit 1
fi

CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"

# acme.sh обычно ставится в ~/.acme.sh/
ACME_SH="${ACME_SH:-$HOME/.acme.sh/acme.sh}"
if ! command -v "${ACME_SH}" >/dev/null 2>&1 && ! [[ -x "${ACME_SH}" ]]; then
  echo "ERROR: acme.sh not found at ${ACME_SH}" >&2
  echo "Install it first:" >&2
  echo "  curl https://get.acme.sh -s | sh -s email=${LETSENCRYPT_EMAIL}" >&2
  exit 1
fi

# Если сертификат уже есть и FORCE не задан — выходим, ничего не делаем.
if [[ -f "${CERT_DIR}/fullchain.pem" && -f "${CERT_DIR}/privkey.pem" && "${FORCE}" != "1" ]]; then
  # Проверим что это именно wildcard (содержит *.lowkey.su)
  if openssl x509 -in "${CERT_DIR}/fullchain.pem" -noout -text 2>/dev/null | grep -q "DNS:\*.${DOMAIN}"; then
    echo "Wildcard certificate for *.${DOMAIN} already exists at ${CERT_DIR}"
    echo "Set FORCE=1 to reissue."
    exit 0
  fi
  echo "Existing cert at ${CERT_DIR} is NOT a wildcard. Reissuing as wildcard (FORCE implied)..."
fi

echo "==================================================================="
echo " Issuing WILDCARD certificate for ${DOMAIN} + *.${DOMAIN}"
echo " via DNS-01 (manual TXT record)."
echo "==================================================================="
echo ""
echo "STEP 1 of 3: acme.sh подготовит challenge и покажет TXT-значение."
echo "             НЕ закрывайте этот процесс. Когда увидите значение —"
echo "             добавьте TXT-запись в панель DNS aeza (см. инструкцию ниже),"
echo "             дождитесь распространения (1-5 мин) и нажмите Enter здесь."
echo ""

ACME_ARGS=(
  --issue
  --dns
  -d "${DOMAIN}"
  -d "*.${DOMAIN}"
  --yes-I-know-dns-manual-mode-enough-go-ahead-please
  --accountemail "${LETSENCRYPT_EMAIL}"
  --server letsencrypt
)

if [[ "${STAGE}" == "1" ]]; then
  ACME_ARGS+=(--staging)
  echo "[STAGE mode] — тестовый сертификат (не расходует лимиты Let's Encrypt)."
fi

# Запускаем acme.sh. В manual-DNS режиме он:
#   1) создаёт заказ, получает TXT-значение, сохраняет его в ~/.acme.sh/<domain>/
#   2) ВЫХОДИТ с ненулевым кодом и сообщением "Add the TXT record, then rerun".
# Это нормальное поведение для первого прохода.
set +e
"${ACME_SH}" "${ACME_ARGS[@]}"
ACME_EXIT=$?
set -e

if [[ ${ACME_EXIT} -ne 0 ]]; then
  # acme.sh в manual режиме всегда выходит с ошибкой после подготовки challenge.
  # Печатаем инструкцию и просим оператора добавить TXT, затем повторяем --renew.
  echo ""
  echo "STEP 2 of 3: Добавьте TXT-запись в DNS."
  echo ""
  echo "acme.sh подготовил challenge. Найдите TXT-значение командой:"
  echo ""
  echo "  grep -- '-' ~/.acme.sh/${DOMAIN}*/$(echo "${DOMAIN}" | tr '.' '_')_wildcard/${DOMAIN}.conf 2>/dev/null || \\"
  echo "  cat ~/.acme.sh/account.conf | grep -i txt"
  echo ""
  echo "или посмотрите последний вывод acme.sh выше (там есть строка вида):"
  echo '  Domain:   _acme-challenge.lowkey.su'
  echo '  TXT value: <RANDOM_STRING>'
  echo ""
  echo "В панели aeza:"
  echo "  1. Раздел DNS / Управление зоной lowkey.su"
  echo "  2. Добавить запись:"
  echo "       Тип:   TXT"
  echo "       Имя:   _acme-challenge"
  echo "       Значение: <RANDOM_STRING из вывода acme.sh>"
  echo "       TTL:   60 (минимум)"
  echo "  3. Сохранить."
  echo ""
  echo "Проверьте распространение (ждите пока не увидите своё значение):"
  echo "  dig +short TXT _acme-challenge.${DOMAIN} @8.8.8.8"
  echo "  # или: nslookup -type=TXT _acme-challenge.${DOMAIN} 1.1.1.1"
  echo ""
  read -r -p "TXT-запись добавлена и проверена через dig? Нажмите Enter для продолжения..."

  # Повторяем --renew — теперь acme.sh проверит TXT и выпустит сертификат.
  echo ""
  echo "STEP 3 of 3: Проверяем challenge и выпускаем сертификат..."
  "${ACME_SH}" --renew -d "${DOMAIN}" -d "*.${DOMAIN}" --yes-I-know-dns-manual-mode-enough-go-ahead-please --force
fi

# acme.sh сохраняет сертификат в ~/.acme.sh/<domain>_wildcard/. Копируем в
# стандартное место /etc/letsencrypt/live/<DOMAIN>/, которое читает nginx-шаблон.
ACME_CERT_DIR=""
for candidate in \
  "$HOME/.acme.sh/${DOMAIN}_wildcard" \
  "$HOME/.acme.sh/${DOMAIN}e" \
  "$HOME/.acme.sh/*.${DOMAIN}_wildcard"; do
  # shellcheck disable=SC2086
  if [[ -f "${candidate}/fullchain.cer" ]]; then
    ACME_CERT_DIR="${candidate}"
    break
  fi
done

if [[ -z "${ACME_CERT_DIR}" ]]; then
  # fallback: ищем рекурсивно
  ACME_CERT_DIR="$(find "$HOME/.acme.sh" -name 'fullchain.cer' -path "*${DOMAIN}*" 2>/dev/null | head -1 | xargs dirname 2>/dev/null || true)"
fi

if [[ -z "${ACME_CERT_DIR}" || ! -f "${ACME_CERT_DIR}/fullchain.cer" ]]; then
  echo "ERROR: не удалось найти выпущенный сертификат acme.sh." >&2
  echo "       Поищите вручную: find ~/.acme.sh -name 'fullchain.cer'" >&2
  exit 1
fi

mkdir -p "${CERT_DIR}"
cp -f "${ACME_CERT_DIR}/fullchain.cer" "${CERT_DIR}/fullchain.pem"
cp -f "${ACME_CERT_DIR}/${DOMAIN}.key" "${CERT_DIR}/privkey.pem" 2>/dev/null \
  || cp -f "${ACME_CERT_DIR}"/*.key "${CERT_DIR}/privkey.pem"
chmod 644 "${CERT_DIR}/fullchain.pem"
chmod 600 "${CERT_DIR}/privkey.pem"

# Маркер для deploy.sh — nginx использует wildcard cert.
touch "${CERT_DIR}/.wildcard"

# Установка install-cert для авто-reload через acme.sh (обновляет при перевыпуске).
"${ACME_SH}" --install-cert -d "${DOMAIN}" -d "*.${DOMAIN}" \
  --key-file "${CERT_DIR}/privkey.pem" \
  --fullchain-file "${CERT_DIR}/fullchain.pem" \
  --reloadcmd "nginx -t && systemctl reload nginx || true" \
  2>/dev/null || true

echo ""
echo "==================================================================="
echo " ✓ Wildcard сертификат установлен: ${CERT_DIR}"
echo "   Покрытие: ${DOMAIN}, *.${DOMAIN} (s1, s2, ai, n8n и т.д.)"
echo "==================================================================="
echo ""
echo "Проверка:"
echo "  openssl x509 -in ${CERT_DIR}/fullchain.pem -noout -text | grep -A1 'Subject Alternative Name'"
echo ""
echo "ПЕРЕВЫПУСК: acme.sh добавил cron-задачу. При истечении он попытается"
echo "авто-renew, но для manual-DNS нужно заново обновить TXT-запись."
echo "За 7 дней до истечения запустите этот скрипт повторно (он обновит TXT)."
echo "  DOMAIN=${DOMAIN} LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL} ./issue-wildcard-cert.sh"
echo ""
echo "Теперь сделайте git push (или дождитесь деплоя) — deploy.sh подхватит"
echo "wildcard сертификат автоматически."
