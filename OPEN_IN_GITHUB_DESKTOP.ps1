$desktop = Join-Path $env:LOCALAPPDATA "GitHubDesktop\GitHubDesktop.exe"
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path -LiteralPath $desktop)) {
  Write-Error "GitHub Desktop was not found at $desktop"
  exit 1
}

Write-Host "Repository folder:"
Write-Host $repo
Write-Host ""
Write-Host "If GitHub Desktop does not open this folder automatically, use:"
Write-Host "File -> Add local repository -> $repo"

Start-Process -FilePath $desktop -ArgumentList "`"$repo`""
