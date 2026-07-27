# VoidDB на production

VoidDB — основная база данных lowkey (документная БД, github.com/Nopass0/void).
Backend подключается к ней через `VOIDDB_URL`.

## Архитектура на 193.41.5.130

```
┌─────────────────────────────────────────────────────────────┐
│  host 193.41.5.130                                          │
│                                                             │
│  ┌──────────────┐    127.0.0.1:7700   ┌─────────────────┐   │
│  │ nginx :80    │ ──────────────────▶ │ voiddb (systemd)│   │
│  │ db.lowkey.su │                     │ /opt/voiddb     │   │
│  └──────┬───────┘                     └─────────────────┘   │
│         │ proxy_pass                        ▲                │
│         │                          127.0.0.1:7700            │
│  ┌──────┴───────────────┐                  │                │
│  │ docker: backend      │ ─────────────────┘                │
│  │ VOIDDB_URL=http://   │   (resolves db.lowkey.su → host)   │
│  │   db.lowkey.su       │                                   │
│  └──────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
```

VoidDB **HTTP-only** (без TLS), потому что трафик intra-host: backend-контейнер
→ host nginx → 127.0.0.1:7700. Публичальный HTTPS для db.lowkey.su не нужен.

## Установка VoidDB (один раз на новый сервер)

VoidDB ставится как systemd-сервис через официальный install-скрипт:

```bash
# На production сервере под root:
curl -sSL https://raw.githubusercontent.com/Nopass0/void/main/scripts/deploy.sh | bash
```

Это:
- ставит Go 1.22 (если нет)
- клонирует void в `/opt/voiddb`
- собирает `voiddb` + `voidcli` бинари
- генерирует случайные `VOID_ADMIN_PASSWORD` и `VOID_JWT_SECRET`
- пишет `/opt/voiddb/.env`, `/opt/voiddb/config.yaml`
- ставит systemd-сервис `voiddb.service` (слушает 0.0.0.0:7700)

**Важно:** install-скрипт генерирует свои креды. Для совпадения с backend'ом
после установки вручную выставить `VOID_ADMIN_PASSWORD` = значению из GitHub
Secret `VOIDDB_PASSWORD`, и перезапустить сервис:

```bash
# /opt/voiddb/.env
VOID_ADMIN_PASSWORD=<должен совпадать с secrets.VOIDDB_PASSWORD в GitHub>
systemctl restart voiddb
```

Username всегда `admin` (захардкожен в VoidDB).

## Создание схемы (БД lowkey + коллекции)

После первого запуска VoidDB пустой. Backend-схема (`backend/.voiddb/schema/app.schema`)
пушится через `@voiddb/orm` CLI:

```bash
cd /opt/lowkey_site/main/backend
# bun должен быть на хосте (если нет: curl -fsSL https://bun.sh/install | bash)
export VOIDDB_URL=http://127.0.0.1:7700
export VOIDDB_USERNAME=admin
export VOIDDB_PASSWORD=<тот же пароль>
[ -d node_modules ] || bun install
bunx vdb push
```

Это создаёт БД `lowkey` (35 коллекций: users, vpn_servers, vpn_tokens, subscriptions,
...) и `ui_check_remote`. Безопасно запускать повторно (идемпотентно).

## Переменные окружения

В GitHub Secrets репозитория `lowkey_site`:
- `VOIDDB_PASSWORD` — пароль admin VoidDB (должен совпадать с `VOID_ADMIN_PASSWORD` на сервере)

В `deploy.yml` (job env):
- `VOIDDB_DOMAIN` = `db.lowkey.su` (main) / `db.dev.lowkey.su` (dev)
- `VOIDDB_URL` = `http://db.lowkey.su` (HTTP, не HTTPS)
- `VOIDDB_USERNAME` = `admin`
- `VOIDDB_TOKEN` = `''` (пусто — ORM падает на username+password fallback)

## DNS

`db.lowkey.su` → A-запись → IP production сервера (193.41.5.130).
Без этой записи backend не достучится (контейнер резолвит db.lowkey.su → host).

## Что делает deploy.sh

`append_voiddb_config()` генерирует nginx server-блок:
```nginx
server {
    listen 80;
    server_name db.lowkey.su;
    location / {
        proxy_pass http://127.0.0.1:7700;
        ...
    }
}
```

Этот блок добавляется в `/etc/nginx/sites-available/lowkey-${APP_ENV}.conf` при
каждом деплое, так что ручная правка nginx не нужна.

## Backup / restore

VoidDB хранит данные в `/opt/voiddb/data/`. Для бэкапа:
```bash
tar czf voiddb-backup-$(date +%F).tar.gz /opt/voiddb/data/
```

Восстановление: остановить сервис, распаковать, запустить.

## Диагностика

```bash
systemctl status voiddb                      # сервис активен?
curl http://127.0.0.1:7700/health             # {"status":"ok",...}
journalctl -u voiddb -n 50 --no-pager         # логи
curl http://db.lowkey.su/health               # через nginx
docker exec lowkey-main-backend-1 sh -c \
  'wget -qO- http://db.lowkey.su/health'      # из контейнера backend'а
docker logs lowkey-main-backend-1 --tail 30   # нет VoidError? значит подключение ок
```
