#!/usr/bin/env bash
#
# dev.sh — local development launcher (Linux / macOS / Git Bash on Windows).
#
# Brings up a complete local stack with HOT RELOAD:
#   - VoidDB server (docker, http://localhost:7700)  — persisted in ./.devdata
#   - Backend  (bun run --watch, http://localhost:3001, hot reload on file change)
#   - Frontend (next dev,     http://localhost:3000, hot reload)
#
# First run: clones github.com/Nopass0/void next to this repo (../void) and
# builds the docker image (~2-5 min). Subsequent runs reuse the image.
#
# Requirements: docker, bun (https://bun.sh). Optional: dig/curl already present.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${ROOT}/backend"
FRONTEND_DIR="${ROOT}/frontend"
VOID_REPO_PATH="${VOID_REPO_PATH:-${ROOT}/../void}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
VOIDDB_PORT="${VOIDDB_PORT:-7700}"

log()  { printf '\033[1;34m[dev]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[dev]\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31m[dev]\033[0m %s\n' "$*" >&2; }

# ─── Preflight checks ───────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || { err "docker not found. Install Docker first."; exit 1; }
command -v bun    >/dev/null 2>&1 || { err "bun not found. Install: https://bun.sh"; exit 1; }

# ─── Clone VoidDB server if missing ─────────────────────────────────────
if [[ ! -d "${VOID_REPO_PATH}" || ! -f "${VOID_REPO_PATH}/Dockerfile" ]]; then
  log "VoidDB sources not found at ${VOID_REPO_PATH}, cloning github.com/Nopass0/void ..."
  mkdir -p "$(dirname "${VOID_REPO_PATH}")"
  git clone --depth 1 https://github.com/Nopass0/void.git "${VOID_REPO_PATH}"
fi

# ─── Ensure backend/.env exists (copy from example on first run) ────────
if [[ ! -f "${BACKEND_DIR}/.env" ]]; then
  if [[ -f "${BACKEND_DIR}/.env.example" ]]; then
    cp "${BACKEND_DIR}/.env.example" "${BACKEND_DIR}/.env"
    log "Created backend/.env from example (edit VOIDDB_PASSWORD etc. if needed)."
  else
    warn "backend/.env missing and no .env.example found — backend may fail to boot."
  fi
fi
if [[ ! -f "${FRONTEND_DIR}/.env.local" ]]; then
  [[ -f "${FRONTEND_DIR}/.env.example" ]] && cp "${FRONTEND_DIR}/.env.example" "${FRONTEND_DIR}/.env.local"
fi

# Read VOIDDB creds from backend/.env so docker VoidDB matches what backend expects.
read_env() { grep -E "^$1=" "${BACKEND_DIR}/.env" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
VOIDDB_USERNAME="$(read_env VOIDDB_USERNAME)"; VOIDDB_USERNAME="${VOIDDB_USERNAME:-admin}"
VOIDDB_PASSWORD="$(read_env VOIDDB_PASSWORD)"; VOIDDB_PASSWORD="${VOIDDB_PASSWORD:-admin}"

# ─── Start VoidDB container (rebuild if image missing) ──────────────────
log "Starting VoidDB on 127.0.0.1:${VOIDDB_PORT} (first build may take a few minutes)..."
VOID_REPO_PATH="${VOID_REPO_PATH}" \
VOIDDB_USERNAME="${VOIDDB_USERNAME}" \
VOIDDB_PASSWORD="${VOIDDB_PASSWORD}" \
VOIDDB_PORT="${VOIDDB_PORT}" \
  docker compose -f "${ROOT}/docker-compose.dev.yml" up -d --build voiddb

# ─── Wait for VoidDB to be ready ────────────────────────────────────────
log "Waiting for VoidDB to accept logins ..."
for attempt in $(seq 1 60); do
  if curl -fsS -o /dev/null \
        -X POST "http://127.0.0.1:${VOIDDB_PORT}/v1/auth/login" \
        -H 'Content-Type: application/json' \
        -d "{\"username\":\"${VOIDDB_USERNAME}\",\"password\":\"${VOIDDB_PASSWORD}\"}" 2>/dev/null; then
    log "VoidDB ready (after ${attempt}s)."
    break
  fi
  if (( attempt == 60 )); then
    err "VoidDB did not become ready in 60s. Check: docker compose -f docker-compose.dev.yml logs voiddb"
    exit 1
  fi
  sleep 1
done

# ─── Push schema (create collections) — idempotent ─────────────────────
# `vdb push` reads backend/.voiddb/schema/app.schema and creates the `lowkey`
# database + collections in VoidDB. Safe to run on every start.
log "Pushing schema to VoidDB (creates collections if missing)..."
(
  cd "${BACKEND_DIR}"
  VOIDDB_URL="http://localhost:${VOIDDB_PORT}" \
  VOIDDB_USERNAME="${VOIDDB_USERNAME}" \
  VOIDDB_PASSWORD="${VOIDDB_PASSWORD}" \
    bunx vdb push 2>&1 | tail -8 || warn "schema push failed — you may need to run it manually: cd backend && bunx vdb push"
)

# ─── Install deps if node_modules missing ──────────────────────────────
[[ -d "${BACKEND_DIR}/node_modules" ]]  || { log "Installing backend deps..."; (cd "${BACKEND_DIR}" && bun install); }
[[ -d "${FRONTEND_DIR}/node_modules" ]] || { log "Installing frontend deps..."; (cd "${FRONTEND_DIR}" && bun install); }

# ─── Start backend + frontend with hot reload ──────────────────────────
log "Starting backend (hot reload) on http://localhost:${BACKEND_PORT} ..."
(
  cd "${BACKEND_DIR}"
  exec env VOIDDB_URL="http://localhost:${VOIDDB_PORT}" \
           VOIDDB_USERNAME="${VOIDDB_USERNAME}" \
           VOIDDB_PASSWORD="${VOIDDB_PASSWORD}" \
           bun run dev
) &
BACKEND_PID=$!

# Give backend a head start so the frontend's first API calls can succeed.
sleep 2

log "Starting frontend (hot reload) on http://localhost:${FRONTEND_PORT} ..."
(
  cd "${FRONTEND_DIR}"
  exec bun run dev --port "${FRONTEND_PORT}"
) &
FRONTEND_PID=$!

# ─── Cleanup on exit (Ctrl+C / kill). VoidDB is left running. ──────────
cleanup() {
  log "Stopping backend + frontend ..."
  kill "${BACKEND_PID}"  2>/dev/null || true
  kill "${FRONTEND_PID}" 2>/dev/null || true
  wait "${BACKEND_PID}"  "${FRONTEND_PID}" 2>/dev/null || true
  log "VoidDB container left running. Stop it with: docker compose -f docker-compose.dev.yml down"
}
trap cleanup EXIT INT TERM

log ""
log "╔══════════════════════════════════════════════════════════════╗"
log "║  LOWKEY dev stack is up.                                     ║"
log "║    Frontend : http://localhost:${FRONTEND_PORT}                            ║"
log "║    Backend  : http://localhost:${BACKEND_PORT}                            ║"
log "║    Swagger  : http://localhost:${BACKEND_PORT}/swagger                      ║"
log "║    VoidDB   : http://localhost:${VOIDDB_PORT}  (admin UI at :7700)        ║"
log "║                                                              ║"
log "║  Press Ctrl+C to stop backend + frontend.                    ║"
log "╚══════════════════════════════════════════════════════════════╝"
log ""

# Wait for either process; when one exits, cleanup fires.
wait -n "${BACKEND_PID}" "${FRONTEND_PID}" 2>/dev/null || true
