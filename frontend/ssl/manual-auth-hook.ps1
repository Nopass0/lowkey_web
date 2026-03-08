$ErrorActionPreference = "Stop"

$sslDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateDir = Join-Path $sslDir ".certbot-state"
$recordsFile = Join-Path $stateDir "dns-records.txt"
$continueFile = Join-Path $stateDir "continue.txt"

New-Item -ItemType Directory -Path $stateDir -Force | Out-Null

$domain = $env:CERTBOT_DOMAIN
$validation = $env:CERTBOT_VALIDATION
$remaining = [int]$env:CERTBOT_REMAINING_CHALLENGES

Add-Content -Path $recordsFile -Value ("{0}|{1}" -f $domain, $validation)

if ($remaining -eq 0) {
    Write-Host "DNS records collected in $recordsFile"
    Write-Host "Waiting for $continueFile before continuing validation"
    while (-not (Test-Path $continueFile)) {
        Start-Sleep -Seconds 2
    }
}
