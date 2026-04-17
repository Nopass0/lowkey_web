#!/usr/bin/env bash
# =============================================================================
# redeploy.sh — Автоматический редеплой jopad на VPS
# =============================================================================
#
# Использование:
#   ./deployments/redeploy.sh [ветка]
#
# Аргументы:
#   ветка — git-ветка для pull (по умолчанию: main)
#
# Что делает скрипт:
#  1. Переходит в директорию /opt/jopa-server (или APP_DIR)
#  2. Делает git pull для получения последней версии кода
#  3. Собирает новый бинарник Go (go build -o jopad ./cmd/jopad)
#  4. Останавливает PM2-процесс "jopa-server" (если запущен)
#  5. Запускает PM2 заново через ecosystem config
#  6. Проверяет, что сервер отвечает на /api/v1/status
#
# Требования:
#   - Go 1.22+ установлен и доступен в PATH
#   - PM2 установлен глобально (npm i -g pm2)
#   - Репозиторий уже склонирован в APP_DIR
#   - .env файл уже настроен (скрипт НЕ перезаписывает его)
#
# Rollback при ошибке сборки:
#   Если `go build` падает, скрипт завершается с кодом 1 до перезапуска PM2.
#   Старый бинарник (jopad.bak) сохраняется и может быть восстановлен вручную:
#     cp /opt/jopa-server/jopad.bak /opt/jopa-server/jopad && pm2 restart jopa-server
# =============================================================================

set -euo pipefail

# ─── Настройки ───────────────────────────────────────────────────────────────

# Директория, где живёт jopad на сервере.
APP_DIR="${APP_DIR:-/opt/jopa-server}"

# PM2-имя процесса (должно совпадать с name в pm2.ecosystem.config.cjs).
PM2_NAME="${PM2_NAME:-jopa-server}"

# HTTP-адрес для проверки работоспособности после деплоя.
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:9109/api/v1/status}"

# Ветка для pull (первый аргумент или "main").
GIT_BRANCH="${1:-main}"

# ─── Цвета для читаемого вывода ───────────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[redeploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[redeploy]${NC} $*"; }
err()  { echo -e "${RED}[redeploy]${NC} $*" >&2; }

# ─── Проверяем зависимости ────────────────────────────────────────────────────

command -v go  >/dev/null 2>&1 || { err "Go не найден в PATH. Установите Go 1.22+"; exit 1; }
command -v pm2 >/dev/null 2>&1 || { err "PM2 не найден. Запустите: npm i -g pm2"; exit 1; }
command -v git >/dev/null 2>&1 || { err "Git не найден в PATH."; exit 1; }

# ─── Переходим в директорию проекта ─────────────────────────────────────────

if [ ! -d "$APP_DIR" ]; then
    err "Директория $APP_DIR не существует."
    err "Сначала выполните первоначальный деплой: deployments/deploy-linux.sh"
    exit 1
fi

cd "$APP_DIR"
log "Рабочая директория: $(pwd)"

# ─── Шаг 1: Получаем последнюю версию кода ───────────────────────────────────

log "Обновляем код из ветки '$GIT_BRANCH'..."
git fetch origin
git checkout "$GIT_BRANCH"
git reset --hard "origin/$GIT_BRANCH"
log "Код обновлён. Последний коммит: $(git log --oneline -1)"

# ─── Шаг 2: Обновляем Go-зависимости ─────────────────────────────────────────

log "Синхронизируем go.mod / go.sum..."
go mod tidy

# ─── Шаг 3: Собираем новый бинарник ──────────────────────────────────────────

log "Сборка jopad..."

# Сохраняем резервную копию текущего бинарника (для rollback).
if [ -f jopad ]; then
    cp jopad jopad.bak
    log "Резервная копия сохранена: jopad.bak"
fi

# Флаги сборки:
#   -trimpath  — убираем пути разработчика из бинарника (безопасность)
#   -ldflags   — убираем отладочные символы (меньший размер)
if ! go build -trimpath -ldflags="-s -w" -o jopad ./cmd/jopad; then
    err "Сборка провалилась! Старый бинарник (jopad.bak) не тронут."
    err "Для отката вручную: cp jopad.bak jopad && pm2 restart $PM2_NAME"
    exit 1
fi

log "Бинарник собран: $(du -sh jopad | cut -f1)"

# ─── Шаг 4: Останавливаем старый PM2-процесс ─────────────────────────────────

log "Останавливаем PM2-процесс '$PM2_NAME'..."
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
    pm2 stop "$PM2_NAME"
    pm2 delete "$PM2_NAME"
    log "Процесс '$PM2_NAME' остановлен и удалён из PM2."
else
    warn "Процесс '$PM2_NAME' не найден в PM2 — запускаем первый раз."
fi

# ─── Шаг 5: Запускаем новый PM2-процесс ──────────────────────────────────────

# Убеждаемся, что директория логов существует.
mkdir -p "$APP_DIR/logs"

log "Запускаем '$PM2_NAME' через ecosystem config..."
pm2 start deployments/pm2.ecosystem.config.cjs
pm2 save  # сохраняем список процессов для pm2 startup (автозапуск после ребута)

log "PM2 список процессов:"
pm2 list

# ─── Шаг 6: Проверяем работоспособность ──────────────────────────────────────

log "Ожидаем старта сервера (до 15 сек)..."
RETRIES=15
for i in $(seq 1 $RETRIES); do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
        log "✓ Сервер отвечает на $HEALTH_URL"
        # Показываем JSON-ответ для подтверждения.
        curl -s "$HEALTH_URL" | python3 -m json.tool 2>/dev/null || curl -s "$HEALTH_URL"
        echo ""
        break
    fi
    if [ "$i" -eq "$RETRIES" ]; then
        err "✗ Сервер не ответил за ${RETRIES} секунд."
        err "Логи: pm2 logs $PM2_NAME --lines 50"
        err "Rollback: cp jopad.bak jopad && pm2 restart $PM2_NAME"
        exit 1
    fi
    sleep 1
done

# ─── Финальный отчёт ──────────────────────────────────────────────────────────

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Деплой завершён успешно!"
log "  Ветка:    $GIT_BRANCH"
log "  Коммит:   $(git log --oneline -1)"
log "  Процесс:  $PM2_NAME (pm2 logs $PM2_NAME)"
log "  Health:   $HEALTH_URL"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
