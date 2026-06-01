#requires -version 5
# Health check do MCP Gemini Bridge (Windows / PowerShell).
$ErrorActionPreference = "Continue"

Write-Host "== MCP Gemini Bridge :: health check ==" -ForegroundColor Cyan

Write-Host "`n[1] Versoes" -ForegroundColor Yellow
node --version
gemini --version
claude --version

Write-Host "`n[2] Teste do Gemini (modo seguro: plan)" -ForegroundColor Yellow
gemini -p "responda apenas: funcionando" --approval-mode plan

Write-Host "`n[3] Servidores MCP registrados" -ForegroundColor Yellow
claude mcp list

Write-Host "`nEsperado: 'gemini-bridge ... Connected'." -ForegroundColor Green
