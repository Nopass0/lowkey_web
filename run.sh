#!/bin/bash
# lowkey VPN — Fast Run Script (Linux/macOS)
# Запускает бэк и фронт без проверок и настройки .env

set -e

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"

echo ""
echo -e "\033[36m  ██╗      ██████╗ ██╗    ██╗██╗  ██╗███████╗██╗   ██╗\033[0m"
echo -e "\033[36m  ██║     ██╔═══██╗██║    ██║██║ ██╔╝██╔════╝╚██╗ ██╔╝\033[0m"
echo -e "\033[36m  ██║     ██║   ██║██║ █╗ ██║█████╔╝ █████╗   ╚████╔╝ \033[0m"
echo -e "\033[36m  ██║     ██║   ██║██║███╗██║██╔═██╗ ██╔══╝    ╚██╔╝  \033[0m"
echo -e "\033[36m  ███████╗╚██████╔╝╚███╔███╔╝██║  ██╗███████╗   ██║   \033[0m"
echo -e "\033[36m  ╚══════╝ ╚═════╝  ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝   ╚═╝   \033[0m"
echo ""
echo -e "\033[1;37m  VPN — Fast Run (Bash)\033[0m"
echo -e "\033[90m  ══════════════════════════════════════════\033[0m"
echo ""

if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo -e "\033[33m  ! Внимание: backend/.env не найден. Сервер может не запуститься.\033[0m"
    echo -e "\033[33m  Рекомендуется сначала выполнить ./start.sh\033[0m"
fi

echo -e "\033[36m  Запуск серверов...\033[0m"
echo ""
echo -e "  Backend  → http://localhost:3001"
echo -e "  Frontend → http://localhost:3000"
echo -e "  Swagger  → http://localhost:3001/swagger"
echo ""
echo -e "\033[90m  Нажми Ctrl+C чтобы остановить оба сервера\033[0m"
echo ""

# Запускаем backend в фоне
cd "$BACKEND_DIR"
bun run dev &
BACKEND_PID=$!

# Небольшая пауза
sleep 2

# Запускаем frontend в foreground
cd "$FRONTEND_DIR"
bun run dev --port 3000

# Если frontend остановлен (Ctrl+C), убиваем backend
kill $BACKEND_PID 2>/dev/null
