param(
  [switch]$Build,
  [switch]$Down
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

if ($Down) {
  docker compose down
  exit 0
}

$args = @("compose", "up", "-d", "postgres", "ml-api", "api")
if ($Build) {
  $args = @("compose", "up", "-d", "--build", "postgres", "ml-api", "api")
}

Write-Host "Starting backends (postgres + ml-api + api)..."
docker @args

Write-Host ""
Write-Host "API:    http://localhost:8088/healthz"
Write-Host "ML API: http://localhost:8000/health"
Write-Host ""
Write-Host "Frontends (host):"
Write-Host "  pnpm install"
Write-Host "  pnpm dev          # :3004 + :3005 + :3006"
Write-Host "  pnpm dev:web      # LiverScreening only"
Write-Host "  pnpm dev:ml-lab   # ML Lab only"
Write-Host "  pnpm dev:screening # patient screener :3006"
Write-Host ""
Write-Host "Or: .\deploy\dev-web.ps1"
Write-Host ""
Write-Host "Seed users:"
Write-Host "  coordinator@liver.kz / ChangeMe123!"
Write-Host "  doctor@liver.kz / Doctor123!"
Write-Host ""
Write-Host "Logs:    docker compose logs -f"
Write-Host "Rebuild: .\deploy\dev-apps.ps1 -Build"
Write-Host "Stop:    .\deploy\dev-apps.ps1 -Down"
