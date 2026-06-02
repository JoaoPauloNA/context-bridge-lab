# Política de Segurança

O Context Bridge Lab é um **laboratório experimental** que executa CLIs locais (Gemini e Claude
Code) por meio de um servidor MCP. Como ele roda comandos e grava arquivos na sua máquina, leve a
parte de segurança a sério.

## Modelo de execução (o que o bridge faz)

- Executa o Gemini CLI como subprocesso (`spawn`, sem `shell` quando possível) a partir do
  diretório do projeto.
- Em `mode=research` instrui o Gemini a operar **somente leitura** e usa `approval_mode=plan`.
  Isso é uma **garantia operacional/instrucional, não um sandbox**: não há isolamento real de
  sistema de arquivos. Para evidência objetiva, o servidor compara o estado do `git` antes/depois
  e registra os arquivos realmente alterados.
- O modo `yolo` (executar tudo sem confirmação) fica **desabilitado por padrão** e só é aceito
  quando `ALLOW_GEMINI_YOLO=1` está definido no ambiente.
- Caminhos de `output_file`/`summary_file` são resolvidos e **bloqueados se saírem da raiz** do
  projeto (proteção contra path traversal).

## Segredos, tokens e dados privados

> **Nunca** inclua segredos, tokens, credenciais, `.env`, caminhos locais ou conteúdo de projetos
> proprietários em código, commits, issues, PRs **ou nos relatórios gerados**.

- As saídas do Gemini (`docs/gemini-output/`, incluindo `_metrics/gemini-runs.jsonl`) são geradas
  localmente e ficam **fora do controle de versão** (veja `.gitignore`). Elas podem refletir
  trechos e caminhos do projeto onde foram executadas — trate-as como dados locais.
- Antes de compartilhar qualquer relatório ou métrica publicamente, **revise e anonimize** o
  conteúdo.
- A autenticação do Gemini e do Claude é responsabilidade das respectivas CLIs; este projeto não
  armazena nem registra credenciais.

## Versões suportadas

Por ser experimental, apenas a versão mais recente em `main` recebe correções. Não há suporte de
longo prazo (LTS) para versões anteriores.

## Como reportar uma vulnerabilidade

1. **Não** abra uma issue pública para vulnerabilidades sensíveis.
2. Use o canal **GitHub Security Advisories** (aba _Security_ → _Report a vulnerability_) do
   repositório, ou abra uma issue mínima pedindo um canal privado de contato (sem detalhes
   sensíveis).
3. Inclua passos de reprodução, impacto e versões — **sem** anexar segredos reais.

Como é um projeto de laboratório mantido em tempo limitado, não há SLA de resposta. Esforço de
melhor empenho (_best-effort_).
