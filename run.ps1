$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

$backendDir = Join-Path $ROOT "backend"
$frontendDir = Join-Path $ROOT "frontend"

Write-Host ""
Write-Host "  lowkey VPN — Fast Run Script" -ForegroundColor Cyan
Write-Host "  ============================" -ForegroundColor DarkGray
Write-Host ""

if (-not (Test-Path (Join-Path $backendDir ".env"))) {
    Write-Host "  ! Внимание: backend/.env не найден. Рекомендуется сначала выполнить .\start.ps1" -ForegroundColor Yellow
}

Write-Host "  Очистка зависших процессов на портах 3000 и 3001..." -ForegroundColor DarkGray
Get-NetTCPConnection -LocalPort 3000, 3001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { 
    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue 
}

Write-Host ""
Write-Host "  Запуск серверов..." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Backend  -> http://localhost:3001" -ForegroundColor White
Write-Host "  Frontend -> http://localhost:3000" -ForegroundColor White
Write-Host "  Swagger  -> http://localhost:3001/swagger" -ForegroundColor White
Write-Host ""
Write-Host "  Нажми Ctrl+C дважды чтобы остановить оба сервера" -ForegroundColor DarkGray
Write-Host ""

# Запускаем backend в фоне
$backendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    bun run dev
} -ArgumentList $backendDir

Start-Sleep -Seconds 2

# Запускаем frontend в foreground (блокирует терминал)
Push-Location $frontendDir
try {
    bun run dev -- --port 3000
} finally {
    Stop-Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob -ErrorAction SilentlyContinue
    Pop-Location
}
