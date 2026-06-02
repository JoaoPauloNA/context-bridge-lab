# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue, de forma leve, o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o versionamento é compatível com [SemVer](https://semver.org/lang/pt-BR/). Por ser um
laboratório experimental, datas e granularidade podem variar.

## [Não lançado]

### Planejado

- `policy-engine.json` com regras de delegação configuráveis (`delegate_research`,
  `delegate_frontend`, `delegate_security: false`).
- Ampliar a base de execuções e mais testes A/B para consolidar os KPIs com amostra maior.

## [3.1.0]

### Adicionado

- Gravação automática de métricas a cada execução em
  `docs/gemini-output/_metrics/gemini-runs.jsonl` (camada MCP).
- Evidência real de mudanças via `git` (`status --porcelain` antes/depois,
  `diff --name-only`, `diff --stat`) como fonte primária dos arquivos alterados, complementada
  pelo briefing do Gemini.
- Política operacional em `CLAUDE.md` (classificação, delegação, revisão, handoff).
- Gating de segurança do modo `yolo` via `ALLOW_GEMINI_YOLO=1`.

### Alterado

- No Windows, execução do bundle `gemini.js` diretamente via Node (mantendo `shell:false`) para
  evitar `spawn EINVAL` ao chamar `.cmd` em Node 18.20+/20.12+/22+.

### Segurança

- Proteção contra path traversal em `output_file` / `summary_file` (caminhos restritos à raiz
  do projeto).
