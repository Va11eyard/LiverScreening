param(
  [switch]$ApiOnly,
  [ValidateSet("all", "web", "ml-lab")]
  [string]$Frontend = "all"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

Write-Host "Starting postgres + ml-api + api (Docker)..."
docker compose up -d --build postgres ml-api api
if ($LASTEXITCODE -ne 0) {
  throw "docker compose up failed"
}

if ($ApiOnly) {
  Write-Host "API:    http://localhost:8088/healthz"
  Write-Host "ML API: http://localhost:8000/health"
  exit 0
}

$webDir = Join-Path $root "apps\web"
$envLocal = Join-Path $webDir ".env.local"
if (-not (Test-Path $envLocal)) {
  Copy-Item (Join-Path $webDir ".env.local.example") $envLocal
  Write-Host "Created apps/web/.env.local"
}

$mlLabDir = Join-Path $root "apps\ml-lab"
$mlLabEnv = Join-Path $mlLabDir ".env"
if (-not (Test-Path $mlLabEnv)) {
  Copy-Item (Join-Path $mlLabDir ".env.example") $mlLabEnv
  Write-Host "Created apps/ml-lab/.env"
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing frontend dependencies..."
  pnpm install
}

Write-Host ""
Write-Host "Web:    http://localhost:3004"
Write-Host "ML Lab: http://localhost:3005"
Write-Host "Screening: http://localhost:3006"
Write-Host "API:    http://localhost:8088"
Write-Host "ML API: http://localhost:8000"
Write-Host "Press Ctrl+C to stop dev servers (Docker keeps running)."
Write-Host ""

switch ($Frontend) {
  "web" { pnpm dev:web }
  "ml-lab" { pnpm dev:ml-lab }
  default { pnpm dev }
}
