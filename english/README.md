# lowkey-english

Standalone LowKey English app for `english.lowkey.su`.

## Stack

- Frontend: Next.js 14
- Backend: Bun + Elysia
- Database: shared VoidDB instance at `db.lowkey.su`, using a dedicated database named `english`
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
2. Reuses shared VoidDB credentials from `../.env.backend` when that file exists, otherwise from `english/backend/.env`.
3. Installs backend and frontend dependencies when `node_modules` are missing.
4. Syncs the `english` database schema against the configured VoidDB server.
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

The schema file uses the official VoidDB ORM format with `database { name = "english" }`, `model ...`, and `@@map(...)`.
`npm run sync-db` authenticates to the configured VoidDB server, creates the `english` database if it does not exist, pushes the schema, and verifies the mapped collections.

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
- shared VoidDB at `${VOIDDB_URL}` with database `${VOIDDB_DATABASE}`
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
- `VOIDDB_PASSWORD` or `VOIDDB_TOKEN`
- `JWT_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_URL`
- `YOKASSA_SHOP_ID`
- `YOKASSA_SECRET`
- `YOKASSA_TEST_SHOP_ID`
- `YOKASSA_TEST_SECRET`
- `BITLLM_API_KEY`

The workflow uploads the repo to `/opt/lowkey-english` on the server, writes runtime env files, installs nginx/certbot/docker when needed, issues the certificate for `english.lowkey.su`, and runs `docker compose up -d --build`.
