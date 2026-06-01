#requires -version 5
# Instala o MCP Gemini Bridge no Claude Code (Windows / PowerShell).
$ErrorActionPreference = "Stop"

$root   = Split-Path -Parent $PSScriptRoot
$server = Join-Path $root "server"
$index  = Join-Path $server "index.js"

Write-Host "== MCP Gemini Bridge :: install ==" -ForegroundColor Cyan
Write-Host "Repo:   $root"
Write-Host "Server: $server"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js nao encontrado no PATH." }
if (-not (Test-Path $index)) { throw "server/index.js nao encontrado." }

Write-Host "`n[1/2] Instalando dependencias do bridge..." -ForegroundColor Yellow
Push-Location $server
npm install
Pop-Location

Write-Host "`n[2/2] Registrando o servidor no Claude Code (escopo user)..." -ForegroundColor Yellow
claude mcp add --transport stdio --scope user gemini-bridge -- node "$index"

Write-Host "`nConcluido. Valide com: scripts\health-check.ps1" -ForegroundColor Green
