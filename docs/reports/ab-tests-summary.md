# Resumo dos Testes A/B (dados agregados e sanitizados)

> Cada teste executou a **mesma tarefa** duas vezes — Claude **com** e **sem** o Gemini —
> medindo o consumo de tokens do Claude. Os dados abaixo são agregados; nenhum dado local,
> caminho de máquina ou conteúdo de projeto privado é incluído.

## Metodologia

- Mesma tarefa nos dois casos; medição via execução headless do Claude com saída estruturada.
- O caso "sem Gemini" usa o Claude lendo/gerando diretamente.
- O caso "com Gemini" delega a parte operacional ao Gemini (modo `research` ou `development`).
- O repositório usado no Teste 2 é um **app real Next.js (sanitizado)**; nenhum arquivo `.env`,
  segredo ou caminho local foi utilizado na medição publicada.

## Teste A/B 1 — geração pequena de código

- Tarefa: gerar um sistema simples de to-do em código.
- Economia de tokens: **≈15,1%**
- Economia de custo: **≈0,7%**
- Conclusão: delegar geração pequena de código ao Gemini **não trouxe ganho relevante** — o
  overhead de revisão e de definições de ferramenta reduz o benefício.

## Teste A/B 2 — leitura pesada (repositório real sanitizado)

- Alvo: app Next.js com cerca de **100 arquivos** e **~1 MB de código** (sem `node_modules`,
  `.git`, `.next` ou `.env`).
- Tarefa: analisar o repositório e produzir um resumo técnico (arquitetura, módulos, rotas,
  entidades, dependências, riscos).

| Métrica          | Sem Gemini | Com Gemini |   Economia |
| ---------------- | ---------: | ---------: | ---------: |
| Tokens do Claude |  1.183.094 |    137.185 | **≈88,4%** |
| Custo            |          — |          — | **≈60,7%** |

- Conclusão: o bridge é **eficiente para leitura pesada, análise de repositório e contexto amplo**.
  A meta de 65% de economia de tokens foi **superada** neste cenário.

## Leitura conjunta

| Cenário                       | Economia de tokens | Economia de custo |
| ----------------------------- | -----------------: | ----------------: |
| Geração de código pequeno     |             ≈15,1% |             ≈0,7% |
| Leitura pesada de repositório |             ≈88,4% |            ≈60,7% |

**Mensagem principal:** o maior valor não é "o Gemini codar tudo", e sim **"o Gemini ler tudo"**.
O Gemini atua como motor de contexto; o Claude permanece como motor de decisão, revisão e qualidade.

## Limitações da medição

Estes números são **indicativos**, não conclusivos. Antes de generalizar:

- **Amostra pequena:** uma medição por cenário. Variação entre execuções não foi quantificada.
- **Dependência de contexto:** os ganhos variam com o tamanho do repositório, o tipo de tarefa e
  o estado do cache de contexto do Claude no momento da medição.
- **Custo ≠ tokens:** a economia de custo (≈60,7% no Teste 2) difere da economia de tokens
  (≈88,4%) porque envolve modelos e preços diferentes entre as duas camadas; trate as duas
  métricas separadamente.
- **Sem intervalo de confiança:** a meta de ≥65% de economia segue como **hipótese de trabalho**,
  não como resultado estatisticamente validado.

Mais execuções, em cenários variados, são necessárias para consolidar os KPIs.
