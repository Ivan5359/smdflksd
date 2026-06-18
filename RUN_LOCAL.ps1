$ErrorActionPreference = "Stop"

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
  $node = $nodeCommand.Source
} else {
  $fallback = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (-not (Test-Path -LiteralPath $fallback)) {
    throw "Node.js не найден. Установи Node.js или запусти проект внутри Codex runtime."
  }
  $node = $fallback
}

Write-Host "Starting SiteMoney Audit on http://127.0.0.1:8787"
& $node server.js
