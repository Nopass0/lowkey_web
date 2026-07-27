# dev.ps1 - local development launcher (Windows PowerShell).
#
# Brings up a complete local stack with HOT RELOAD:
#   - VoidDB server (docker, http://localhost:7700)  - persisted in .\.devdata
#   - Backend  (bun run --watch, http://localhost:3001, hot reload on file change)
#   - Frontend (next dev,     http://localhost:3000, hot reload)
#
# First run: clones github.com/Nopass0/void next to this repo (..\void) and
# builds the docker image (~2-5 min). Subsequent runs reuse the image.
#
# Requirements: docker, bun (https://bun.sh).
#
[CmdletBinding()]
param(
  [string]$BackendPort  = "3001",
  [string]$FrontendPort = "3000",
  [string]$VoiddbPort   = "7700",
  [string]$VoidRepoPath = ""
)

$ErrorActionPreference = "Stop"
$Root        = $PSScriptRoot
$BackendDir  = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
if ([string]::IsNullOrEmpty($VoidRepoPath)) {
  $VoidRepoPath = Join-Path (Split-Path $Root -Parent) "void"
}

function Log($msg)  { Write-Host "[dev] $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "[dev] $msg" -ForegroundColor Yellow }
function Err($msg)  { Write-Host "[dev] $msg" -ForegroundColor Red }

# ─── Preflight checks ───────────────────────────────────────────────────
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Err "docker not found. Install Docker Desktop first."; exit 1 }
if (-not (Get-Command bun    -ErrorAction SilentlyContinue)) { Err "bun not found. Install: https://bun.sh"; exit 1 }

# ─── Clone VoidDB server if missing ─────────────────────────────────────
if (-not (Test-Path (Join-Path $VoidRepoPath "Dockerfile"))) {
  Log "VoidDB sources not found at $VoidRepoPath, cloning github.com/Nopass0/void ..."
  $voidParent = Split-Path $VoidRepoPath -Parent
  if (-not (Test-Path $voidParent)) { New-Item -ItemType Directory -Path $voidParent -Force | Out-Null }
  git clone --depth 1 https://github.com/Nopass0/void.git $VoidRepoPath
}

# ─── Ensure backend/.env exists (copy from example on first run) ────────
if (-not (Test-Path (Join-Path $BackendDir ".env"))) {
  $ex = Join-Path $BackendDir ".env.example"
  if (Test-Path $ex) { Copy-Item $ex (Join-Path $BackendDir ".env"); Log "Created backend/.env from example." }
  else { Warn "backend/.env missing and no .env.example - backend may fail to boot." }
}
if (-not (Test-Path (Join-Path $FrontendDir ".env.local"))) {
  $ex = Join-Path $FrontendDir ".env.example"
  if (Test-Path $ex) { Copy-Item $ex (Join-Path $FrontendDir ".env.local") }
}

# Read VOIDDB creds from backend/.env so docker VoidDB matches what backend expects.
function Get-EnvVar($file, $key, $default) {
  if (Test-Path $file) {
    $line = Get-Content $file | Where-Object { $_ -match "^$key=" } | Select-Object -Last 1
    if ($line) { return ($line -replace "^$key=", "") }
  }
  return $default
}
$VoiddbUser = Get-EnvVar (Join-Path $BackendDir ".env") "VOIDDB_USERNAME" "admin"
$VoiddbPass = Get-EnvVar (Join-Path $BackendDir ".env") "VOIDDB_PASSWORD" "admin"

# ─── Start VoidDB container (rebuild if image missing) ──────────────────
Log "Starting VoidDB on 127.0.0.1:$VoiddbPort (first build may take a few minutes)..."
$env:VOID_REPO_PATH = $VoidRepoPath
$env:VOIDDB_USERNAME = $VoiddbUser
$env:VOIDDB_PASSWORD = $VoiddbPass
$env:VOIDDB_PORT = $VoiddbPort
docker compose -f (Join-Path $Root "docker-compose.dev.yml") up -d --build voiddb
if ($LASTEXITCODE -ne 0) { Err "VoidDB failed to start."; exit 1 }

# ─── Wait for VoidDB to be ready ────────────────────────────────────────
Log "Waiting for VoidDB to accept logins ..."
$ready = $false
$loginUri = "http://127.0.0.1:$VoiddbPort/v1/auth/login"
for ($attempt = 1; $attempt -le 60; $attempt++) {
  try {
    $bodyObj = @{
      username = $VoiddbUser
      password = $VoiddbPass
    }
    $bodyJson = $bodyObj | ConvertTo-Json -Compress
    $null = Invoke-RestMethod -Method Post -Uri $loginUri -ContentType "application/json" -Body $bodyJson -ErrorAction Stop
    Log ("VoidDB ready (after {0}s)." -f $attempt)
    $ready = $true
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}
if (-not $ready) {
  Err "VoidDB did not become ready in 60s. Check: docker compose -f docker-compose.dev.yml logs voiddb"
  exit 1
}

# ─── Push schema (create collections) - idempotent ─────────────────────
Log "Pushing schema to VoidDB (creates collections if missing)..."
Push-Location $BackendDir
try {
  $env:VOIDDB_URL = "http://localhost:$VoiddbPort"
  $env:VOIDDB_USERNAME = $VoiddbUser
  $env:VOIDDB_PASSWORD = $VoiddbPass
  bunx vdb push 2>&1 | Select-Object -Last 8
} catch {
  Warn "schema push failed - you may need to run it manually: cd backend; bunx vdb push"
} finally {
  Pop-Location
}

# ─── Install deps if node_modules missing ──────────────────────────────
if (-not (Test-Path (Join-Path $BackendDir "node_modules")))  { Log "Installing backend deps...";  Push-Location $BackendDir;  bun install; Pop-Location }
if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) { Log "Installing frontend deps..."; Push-Location $FrontendDir; bun install; Pop-Location }

# ─── Start backend + frontend with hot reload ──────────────────────────
Log "Starting backend (hot reload) on http://localhost:$BackendPort ..."
$backendEnv = @{
  VOIDDB_URL      = "http://localhost:$VoiddbPort"
  VOIDDB_USERNAME = $VoiddbUser
  VOIDDB_PASSWORD = $VoiddbPass
}
# Start backend as a background job.
$backendJob = Start-Job -ScriptBlock {
  param($Dir, $Port, $EnvVars)
  foreach ($k in $EnvVars.Keys) { Set-Item -Path ("Env:" + $k) -Value $EnvVars[$k] }
  Set-Location $Dir
  bun run dev
} -ArgumentList $BackendDir, $BackendPort, $backendEnv

Start-Sleep -Seconds 2

Log "Starting frontend (hot reload) on http://localhost:$FrontendPort ..."
# Run frontend in the FOREGROUND so Ctrl+C is captured naturally.
try {
  Push-Location $FrontendDir
  bun run dev --port $FrontendPort
} finally {
  Pop-Location
  Log "Stopping backend ..."
  if ($backendJob) {
    Stop-Job  $backendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob -Force -ErrorAction SilentlyContinue
  }
  Log "VoidDB container left running. Stop it with: docker compose -f docker-compose.dev.yml down"
}
