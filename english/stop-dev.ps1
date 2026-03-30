$root = Split-Path -Parent $MyInvocation.MyCommand.Path
node (Join-Path $root "scripts\dev.js") stop @args
