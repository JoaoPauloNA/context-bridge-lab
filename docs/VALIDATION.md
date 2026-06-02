# Validação — Context Bridge Lab

Este documento descreve como validar o repositório em **Windows** e em **Linux/WSL**, além de um
**smoke test** ponta a ponta e os **critérios de aceite**.

> Pré-requisitos: Node.js 18+ e `npm`. Para o smoke test completo, também Gemini CLI e Claude Code CLI.
> Antes de tudo, instale o tooling do repositório: `npm install` (na raiz).

---

## 1. Windows (PowerShell)

```powershell
# Verifica se os scripts PowerShell têm sintaxe válida (parse sem erro)
[scriptblock]::Create((Get-Content -Raw .\scripts\install.ps1)) > $null
[scriptblock]::Create((Get-Content -Raw .\scripts\health-check.ps1)) > $null

# Verifica a sintaxe do servidor MCP
node --check .\server\index.js

# Roda a checagem agregada do repositório (equivale a check:node)
npm run check

# Opcional: checagem de formatação (Prettier)
npm run format:check
```

---

## 2. Linux / WSL

```bash
# Sintaxe do servidor MCP
node --check server/index.js

# Sintaxe dos scripts shell
bash -n scripts/install.sh
bash -n scripts/health-check.sh

# Checagem agregada do repositório
npm run check

# Sintaxe dos scripts shell via npm
npm run check:sh

# Opcional: checagem de formatação (Prettier)
npm run format:check
```

---

## 3. Smoke test (ponta a ponta)

> Requer Gemini CLI e Claude Code CLI instalados e autenticados.

```bash
# 1) Versões
node --version
gemini --version
claude --version

# 2) Health check (testa o Gemini em modo seguro e lista os MCPs)
#    Windows:
#      ./scripts/health-check.ps1
#    Linux/macOS:
./scripts/health-check.sh

# 3) Verifica se o servidor está registrado e conectado
claude mcp list
# Esperado: gemini-bridge: node .../server/index.js - ✓ Connected
```

### Teste do gating do modo `yolo`

```bash
# Sem a variável, o servidor deve RECUSAR approval_mode=yolo.
# Com a variável, o yolo é aceito:
#   Linux/macOS:  export ALLOW_GEMINI_YOLO=1
#   Windows:      $env:ALLOW_GEMINI_YOLO = "1"
```

### Teste da evidência via git

Em um diretório que seja repositório git, rode uma tarefa `mode="development"` simples e confira a
última linha de `docs/gemini-output/_metrics/gemini-runs.jsonl`: o campo `git_evidence.available`
deve ser `true` e `files_created`/`files_modified` devem refletir o `git status` real.

---

## 4. Critérios de aceite

- [ ] `node --check server/index.js` retorna **exit code 0**.
- [ ] `bash -n scripts/install.sh` e `bash -n scripts/health-check.sh` sem erros (Linux/WSL).
- [ ] `[scriptblock]::Create(...)` dos dois `.ps1` sem exceção (Windows).
- [ ] `npm run check` conclui com sucesso.
- [ ] `npm run format:check` não acusa arquivos fora do padrão (ou `npm run format` corrige).
- [ ] `approval_mode=yolo` é **recusado** sem `ALLOW_GEMINI_YOLO=1` e **aceito** com a variável.
- [ ] Após uma execução em repositório git, as métricas trazem `git_evidence.available: true`.
- [ ] `claude mcp list` mostra `gemini-bridge ... Connected` (smoke test completo).

### Limitações de ambiente

- `bash -n` e `npm run check:sh` exigem `bash` (Linux, macOS ou WSL/Git Bash); não rodam em
  PowerShell puro.
- O smoke test completo depende de Gemini CLI e Claude Code CLI instalados e autenticados.
