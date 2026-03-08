$ErrorActionPreference = "Stop"

$sslDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateDir = Join-Path $sslDir ".certbot-state"
$continueFile = Join-Path $stateDir "continue.txt"

if (Test-Path $continueFile) {
    Remove-Item $continueFile -Force
}
