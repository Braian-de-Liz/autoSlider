# ADR-019 — Dados do Vega-Lite com apelidos de coluna

Status: aceita · 09/10/2026 · Requisitos: RF-05, P6

## Contexto

O renderer de gráfico passava os nomes reais das colunas ao Vega-Lite. Colunas de CSV real contêm caracteres que o Vega-Lite interpreta: `.` e `[` viram caminho aninhado (`vl.total` procura `vl` → `total`) e `\` é escape. Num teste, uma coluna chamada `a\b` produziu um gráfico **vazio, sem nenhum erro**, o que viola a falha explícita (P6). Além disso, o `id` da spec, que vem do modelo, entrava no nome do arquivo gravado.

## Decisão

- Os dados vão ao Vega-Lite com apelidos fixos: `x`, `y` e `s` (série). Todo texto visível (título, eixos, legenda) vem da spec, não do nome da coluna.
- O `id` da spec é saneado (`[A-Za-z0-9_-]`, até 60 caracteres) antes de compor o nome do arquivo.
- `CHART_RENDERER_VERSION` sobe para `chart-vega-resvg@1.0.1` (RNF-07).

## Alternativa rejeitada

Escapar os nomes (`.`, `[`, `]`, `\`). Funcionou para `.` e `[`, mas continuou gerando gráfico vazio para `\`; a lista de caracteres problemáticos não é confiável.

## Consequências

- O nome da coluna deixa de influenciar o desenho; só o título da série aparece na legenda.
- Testes cobrem `.`, `[`, `\` e o `id` com separadores de caminho.
- Qualquer renderer futuro que use uma linguagem de gráfico baseada em nomes de campo deve seguir o mesmo princípio.
