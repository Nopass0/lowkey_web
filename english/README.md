# lowkey-english

Standalone LowKey English app for `english.lowkey.su`.

## Stack

- Frontend: Next.js 14
- Backend: Bun + Elysia
- Database: VoidDB in a dedicated container
- AI: BitNet / BitLLM in a dedicated container

## Local development

Requirements:

- Node.js 20+
- Bun
- Docker

Start the full local stack:

```bash
npm run dev
```

Platform wrappers:

- Windows PowerShell: `./start-dev.ps1`
- Windows cmd: `start-dev.bat`
- Linux/macOS: `./start-dev.sh`

What the script does:

1. Creates `backend/.env` and `frontend/.env.local` from examples when missing.
2. Installs backend and frontend dependencies when `node_modules` are missing.
3. Starts VoidDB on `http://localhost:7701`.
4. Restarts the running VoidDB container when needed and sync-checks the schema from `backend/.voiddb/schema/english.schema`.
5. Downloads/builds and starts BitLLM on `http://localhost:8080` if it is not already running.
6. Starts backend on `http://localhost:3002`.
7. Starts frontend on `http://localhost:3003`.

Stop the local stack:

```bash
npm run stop
```

Status:

```bash
npm run status
```

## Database sync

Manual schema sync:

```bash
npm run sync-db
```

The schema file now uses the official VoidDB ORM format with `database { name = "english" }`, `model ...`, and `@@map(...)`.
`npm run sync-db` restarts the local VoidDB container if it exists, waits for health, and verifies every mapped collection from the schema through the API.
For a read-only check without restart, run `cd backend && bun run sync-db:verify`.

## BitLLM

Manual commands:

```bash
npm run bitllm:download
npm run bitllm:start
npm run bitllm:status
npm run bitllm:stop
```

The Docker image is built from `./bitnet`, so the first build downloads Microsoft BitNet and the selected model automatically.

## Production

The production stack is defined in `docker-compose.yml`. It expects:

- frontend on `127.0.0.1:${FRONTEND_BIND_PORT}`
- backend on `127.0.0.1:${BACKEND_BIND_PORT}`
- VoidDB on `127.0.0.1:${VOIDDB_BIND_PORT}`
- BitLLM on `127.0.0.1:${BITLLM_BIND_PORT}`

Example compose env file:

```bash
cp .env.compose.example .env.compose
```

Then:

```bash
npm run compose:up
```

## GitHub deploy

If `english/` is used as a standalone repository, `main` can be deployed by its own `.github/workflows/deploy.yml`.
When `english/` lives inside the main `site` repository, deployment should be triggered by the root workflow at `site/.github/workflows/deploy.yml`, which reuses the main repository SSH and production secrets and then runs `english/deploy/scripts/deploy.sh` on the server.

Required GitHub secrets:

- `SSH_SERVER`
- `SSH_USER`
- `SSH_PASSWORD`
- `LETSENCRYPT_EMAIL`
- `JWT_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_URL`
- `YOKASSA_SHOP_ID`
- `YOKASSA_SECRET`
- `YOKASSA_TEST_SHOP_ID`
- `YOKASSA_TEST_SECRET`
- `BITLLM_API_KEY`

The workflow uploads the repo to `/opt/lowkey-english` on the server, writes runtime env files, installs nginx/certbot/docker when needed, issues the certificate for `english.lowkey.su`, and runs `docker compose up -d --build`.
