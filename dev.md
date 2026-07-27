# Локальная разработка (dev-окружение)

Быстрый старт полного стека с **hot reload** и локальной БД одной командой.

## Что поднимается

| Сервис     | URL                        | Как                          |
|------------|----------------------------|------------------------------|
| Frontend   | http://localhost:3000      | `next dev` (нативно)         |
| Backend    | http://localhost:3001      | `bun run --watch` (нативно)  |
| Swagger    | http://localhost:3001/swagger | бэкенд                     |
| VoidDB API | http://localhost:7700      | docker-контейнер             |

БД (VoidDB) работает в docker, данные персистятся в `./.devdata/voiddb` — не теряются между перезапусками. Backend и frontend запускаются **нативно** (не в docker), чтобы работал hot reload: меняете код — изменения видны мгновенно.

## Требования

- **Docker** (Docker Desktop на Windows, либо docker engine на Linux/macOS)
- **Bun** — https://bun.sh (`powershell -c "irm bun.sh/install.ps1|iex"` на Windows, `curl -fsSL https://bun.sh/install | bash` на Linux)
- **Git** (для авто-клонирования VoidDB при первом запуске)

## Запуск

**Linux / macOS / Git Bash:**
```bash
./dev.sh
```

**Windows PowerShell:**
```powershell
.\dev.ps1
```

При **первом запуске** скрипт:
1. Клонирует `github.com/Nopass0/void` рядом с репо (в `../void`).
2. Собирает docker-образ VoidDB (~2–5 минут первый раз, потом мгновенно).
3. Создаёт `backend/.env` и `frontend/.env.local` из примеров (если их нет).
4. Пушит схему в VoidDB (`bunx vdb push`) — создаёт коллекции.
5. Запускает backend (hot reload) и frontend (hot reload).

При последующих запусках шаги 1–2 пропускаются, старт за секунды.

## Остановка

`Ctrl+C` — останавливает backend и frontend. **VoidDB-контейнер остаётся работать** (чтобы данные сохранялись).

Полная остановка БД:
```bash
docker compose -f docker-compose.dev.yml down
# удалить данные БД полностью:
# rm -rf .devdata   (Linux)   /   Remove-Item -Recurse .devdata   (Windows)
```

## Конфигурация

Переменные читаются из `backend/.env` (создаётся из `backend/.env.example`).

Основные:
- `VOIDDB_URL` / `VOIDDB_USERNAME` / `VOIDDB_PASSWORD` — подключение к локальной БД. Docker-контейнер VoidDB создаётся с теми же кредами, что указаны в `backend/.env`, так что они всегда синхронны.
- `JWT_SECRET` — секрет для подписи JWT (минимум 32 символа).
- `BACKEND_SECRET` — общий секрет для запросов от VPN-узлов (`X-Server-Secret`).

## Если VoidDB уже стоит в другом месте

Укажите путь к её исходникам:
```bash
VOID_REPO_PATH=/path/to/void ./dev.sh
```
или (PowerShell):
```powershell
.\dev.ps1 -VoidRepoPath C:\path\to\void
```

## Ports conflict

Если порты 3000/3001/7700 заняты:
```bash
BACKEND_PORT=3002 FRONTEND_PORT=3001 ./dev.sh
```
```powershell
.\dev.ps1 -BackendPort 3002 -FrontendPort 3001
```

## Старые скрипты

`run.ps1` / `run.sh` всё ещё работают (поднимают только backend+frontend **без** локальной БД). Используйте их, если у вас уже поднят внешний VoidDB и вы просто хотите hot reload кода.
