# DIAL IN - start backend (FastAPI) and frontend (Angular) together.
#
# Usage:
#   ./start.ps1            start both servers in two new PowerShell windows
#   ./start.ps1 -Install   run "pip install" + "npm install" first, then start
#
# Backend  -> http://localhost:8000  (health: /api/health)
# Frontend -> http://localhost:4200
#
# Close the spawned windows (or Ctrl+C in each) to stop the servers.

param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$server = Join-Path $root "server"

if ($Install) {
    Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
    python -m pip install -r (Join-Path $server "requirements.txt")
    Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
    npm install
}

Write-Host "Starting DIAL IN backend + frontend..." -ForegroundColor Cyan

# Backend: FastAPI via uvicorn with auto-reload on :8000
Start-Process powershell -WorkingDirectory $server `
    -ArgumentList '-NoExit', '-Command', 'python -m uvicorn app.main:app --reload --port 8000'

# Frontend: Angular dev server on :4200
Start-Process powershell -WorkingDirectory $root `
    -ArgumentList '-NoExit', '-Command', 'npm start'

Write-Host "Backend  -> http://localhost:8000/api/health" -ForegroundColor Green
Write-Host "Frontend -> http://localhost:4200" -ForegroundColor Green
