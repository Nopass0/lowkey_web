$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
node (Join-Path $root "scripts\bitllm.js") @args
