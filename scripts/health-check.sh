#!/usr/bin/env bash
# Health check do MCP Gemini Bridge (Linux / macOS).
set -uo pipefail

echo "== MCP Gemini Bridge :: health check =="

echo
echo "[1] Versoes"
node --version || true
gemini --version || true
claude --version || true

echo
echo "[2] Teste do Gemini (modo seguro: plan)"
gemini -p "responda apenas: funcionando" --approval-mode plan || true

echo
echo "[3] Servidores MCP registrados"
claude mcp list || true

echo
echo "Esperado: 'gemini-bridge ... Connected'."
