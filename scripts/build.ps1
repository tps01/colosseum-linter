# Build the Colosseum Linter VSIX (Windows).
# Usage (from repo root or anywhere):
#   .\scripts\build.ps1

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExtensionDir = Join-Path $RepoRoot "extension"

Set-Location $ExtensionDir

if (Test-Path "package-lock.json") {
    npm ci
} else {
    npm install
}

npm run compile
npm run package

$Vsix = Get-ChildItem -Filter "colosseum-linter-*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $Vsix) {
    throw "VSIX was not produced in $ExtensionDir"
}

Write-Host "Built $($Vsix.FullName)"
