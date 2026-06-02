# Contribuindo

Obrigado pelo interesse no **Context Bridge Lab**. Este é um projeto **experimental**
(laboratório operacional), então a barra é simplicidade e honestidade técnica, não burocracia.

## Antes de começar

- Leia o [`README.md`](README.md) e a [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- A proposta central não muda: **Claude decide, Gemini executa, MCP registra.** Mudanças que
  contrariem esse princípio provavelmente não serão aceitas.
- O projeto é assumidamente experimental. Evite linguagem de marketing ou promessas absolutas
  (especialmente sobre economia de tokens — trate como hipótese medida, não garantia).

## Ambiente

| Ferramenta | Versão de referência |
| ---------- | -------------------- |
| Node.js    | 18+ (validado em 22) |
| npm        | acompanha o Node     |

Para o smoke test completo você também precisa do Gemini CLI e do Claude Code CLI autenticados,
mas eles **não** são necessários para as checagens de código/formatação.

## Fluxo de contribuição

1. Faça um fork e crie um branch a partir de `main`.
2. Faça a mudança no menor escopo possível.
3. Rode a validação local:

   ```bash
   npm install
   npm run validate          # multiplataforma (Prettier + node --check)
   npm run validate:linux    # inclui validação dos scripts shell (precisa de bash)
   ```

   No Windows, `validate:linux`/`check:sh` exigem WSL ou Git Bash; use `npm run validate:windows`
   se não tiver bash disponível. Detalhes em [`docs/VALIDATION.md`](docs/VALIDATION.md).

4. Abra o PR usando o template. Descreva o "porquê", não só o "o quê".

## Estilo

- Formatação via **Prettier** (`npm run format` aplica, `npm run format:check` valida).
- Fim de linha conforme [`.gitattributes`](.gitattributes): LF para código/docs, CRLF para `.ps1`.
- Comentários devem explicar intenção/trade-off, não narrar o óbvio.

## Segurança e privacidade

- Nunca inclua tokens, segredos, `.env`, caminhos locais de máquina ou conteúdo de projetos
  privados em código, commits, issues ou PRs.
- Não versione `docs/gemini-output/` nem `ignorar_git/` (já ignorados).
- Para vulnerabilidades, veja [`SECURITY.md`](SECURITY.md).

## O que costuma ser aceito

- Correções de bug com escopo claro.
- Melhorias de documentação e exemplos.
- Mais testes A/B / medições reprodutíveis (aumentar a amostra).
- Melhorias de portabilidade (Windows/Linux/macOS).

## O que exige discussão prévia (abra uma issue antes)

- Mudanças de arquitetura ou no contrato da ferramenta `gemini_run`.
- Qualquer coisa que afete o gating de segurança (ex.: modo `yolo`).
