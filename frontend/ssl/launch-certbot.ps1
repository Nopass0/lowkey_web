$ErrorActionPreference = "Stop"

$sslDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configDir = Join-Path $sslDir "certbot-config"
$workDir = Join-Path $sslDir "certbot-work"
$logsDir = Join-Path $sslDir "certbot-logs"
$stdoutLog = Join-Path $sslDir "certbot-stdout.log"
$stderrLog = Join-Path $sslDir "certbot-stderr.log"
$certbot = "C:\Users\Nopass\AppData\Roaming\Python\Python311\Scripts\certbot.exe"

New-Item -ItemType Directory -Path $configDir -Force | Out-Null
New-Item -ItemType Directory -Path $workDir -Force | Out-Null
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

& $certbot `
  certonly `
  --manual `
  --preferred-challenges dns `
  --manual-auth-hook "powershell -ExecutionPolicy Bypass -File C:\Projects\lowkey_web\site\frontend\ssl\manual-auth-hook.ps1" `
  --manual-cleanup-hook "powershell -ExecutionPolicy Bypass -File C:\Projects\lowkey_web\site\frontend\ssl\manual-cleanup-hook.ps1" `
  --agree-tos `
  --manual-public-ip-logging-ok `
  --non-interactive `
  --email "gal.bogdan2015@gmail.com" `
  --server "https://acme-v02.api.letsencrypt.org/directory" `
  --config-dir $configDir `
  --work-dir $workDir `
  --logs-dir $logsDir `
  -d "lowkey.su" `
  -d "*.lowkey.su" `
  1> $stdoutLog `
  2> $stderrLog
