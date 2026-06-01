#!/usr/bin/env bash
# Instala o MCP Gemini Bridge no Claude Code (Linux / macOS).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="$ROOT/server"
INDEX="$SERVER/index.js"

echo "== MCP Gemini Bridge :: install =="
echo "Repo:   $ROOT"
echo "Server: $SERVER"

command -v node >/dev/null 2>&1 || { echo "Node.js nao encontrado no PATH."; exit 1; }
[ -f "$INDEX" ] || { echo "server/index.js nao encontrado."; exit 1; }

echo
echo "[1/2] Instalando dependencias do bridge..."
( cd "$SERVER" && npm install )

echo
echo "[2/2] Registrando o servidor no Claude Code (escopo user)..."
claude mcp add --transport stdio --scope user gemini-bridge -- node "$INDEX"

echo
echo "Concluido. Valide com: scripts/health-check.sh"
