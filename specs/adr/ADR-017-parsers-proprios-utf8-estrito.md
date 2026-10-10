# ADR-017 — Parsers próprios de CSV e Markdown; UTF-8 estrito

Status: aceita · 09/10/2026 · Requisitos: RF-17, RF-18, RF-11

## Contexto

A ingestão (M2) precisa transformar CSV e Markdown em `SourceDoc` e datasets rastreáveis, com erros tipados (P6) e com as convenções brasileiras de número e data (`1.234,50`, `dd/mm/aaaa`). Bibliotecas genéricas de CSV e Markdown não conhecem essas convenções, não produzem os erros do projeto e acrescentam dependências (a spec manda fixar versões e minimizar superfície).

## Decisão

- Parser CSV próprio (RFC 4180: aspas, `""`, quebra de linha em aspas, CRLF/LF/CR) e parser Markdown próprio (seções ATX e tabelas GFM; cercas de código ignoradas), sem dependência nova.
- **UTF-8 estrito**, com BOM aceito. Outra codificação (como Windows-1252 do Excel) termina em `E_INGEST_INVALIDO` pedindo para salvar como UTF-8. Não há conversão automática, porque adivinhar a codificação pode trocar caracteres em silêncio (P6).
- Tipo inferido por coluna (`boolean`, `number`, `date`, `string`); coluna mista é texto; célula vazia é `null`.
- A convenção numérica deriva do delimitador no CSV (`;` → pt-BR, demais → en); no Markdown cada coluna tenta pt-BR e depois en.
- Registro com número de colunas diferente do cabeçalho é erro; nada é preenchido nem cortado.

## Consequências

- Casos raros de CSV ou Markdown podem exigir ajuste nos parsers. Reavaliar (inclusive adotar biblioteca) se aparecerem arquivos reais que falhem.
- Quem exporta do Excel em Windows-1252 precisa escolher "CSV UTF-8".
- Moeda (`R$ 10`), `%` e notação científica permanecem texto; tratá-los exige mudança de spec.
- O mesmo `inferTable` serve ao XLSX e ao PDF quando entrarem (Tasks 8 e 9).
