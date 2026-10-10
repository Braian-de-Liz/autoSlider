# Changelog

Mudanças de spec e de comportamento, por versão da especificação (`specs/SPEC.md`).

## v0.6.0 — 09/10/2026 (Fase C: ingestão e gráfico com dados reais)

### Task 6 — contrato de ingestão e CSV (RF-18)

Spec:
- Seção 6.5: regras de normalização do CSV (delimitador, aspas, convenção numérica pt-BR/en, tipos, datas, `null`, limite de 25 MB, ids e origem com SHA-256). O tipo é só inferido; a confirmação pelo usuário segue pendente.
- Seção 6.6: novo código `E_INGEST_INVALIDO`.
- RF-18 passa a `ativo`.

Código e testes:
- `src/ingest/`: `types.ts`, `common.ts` (hash, slug, limite, UTF-8 estrito), `csv.ts` (parser RFC 4180 próprio, sem dependência), `index.ts` (despacho por extensão e `ingestAll` com ids únicos).
- `SourceUnit.title`, `TabularDataset.origin` e `ErrorCode` (`E_INGEST_INVALIDO`, `E_INGEST_LIMITE`).
- Comando `bun run src/cli.ts ingerir <arquivo.csv>` (colunas, tipos, hash e amostra de 5 linhas); `src/commands/result.ts` com o tipo comum de resultado.
- Fixtures determinísticas em `specs/fixtures/ingest/` geradas por `bun run fixtures`: `vendas.csv` (100 linhas, `,`) e `vendas-br.csv` (30 linhas, `;`, BOM, CRLF, `dd/mm/yyyy`, números pt-BR, aspas e acentos).
- `tests/ingest-csv.test.ts` (21 casos): RF-18, limites e erros, RF-11 (só esquema e 5 linhas no prompt) e o comando.

### Task 7 — Markdown e busca lexical (RF-17 parcial, RF-11)

Spec:
- Seção 6.9: regras do Markdown (unidades por seção, tabelas viram datasets com marcador, cercas de código ignoradas), busca BM25 (parâmetros) e bloco `<trechos>` com limites e marcadores explícitos.
- RF-17 passa a `ativo`, cobrindo só Markdown; XLSX e PDF (M2) e DOCX e PPTX (M7) seguem pendentes.
- Questão aberta 10: números em prosa do Markdown não contam como conhecidos; decidir na Task 11.

Código e testes:
- `src/ingest/markdown.ts` (parser próprio, sem dependência), registrado para `.md` e `.markdown`.
- `src/ingest/search.ts`: `tokenize`, `searchUnits` (BM25), `describeExcerptsForPrompt` e `excerptOf`.
- Comando `bun run src/cli.ts buscar "<consulta>" <arquivo...>`: resultados e o bloco exato que iria ao prompt. Cada chamada reingere os arquivos, porque ainda não há Store.
- Fixture `specs/fixtures/ingest/notas.md` (gerada por `bun run fixtures`).
- `tests/ingest-markdown.test.ts` (24 casos): RF-17, RF-11 (ranking, acentos, limites e marcadores, nenhuma linha de tabela no prompt) e o comando.
- Os trechos ainda não alimentam nenhum pipeline: o gráfico usa só datasets, e os trechos entram no prompt do docx na Task 11.

### Task 10 — gráfico com anexos reais (RF-01 parcial, RF-04, RF-05, RF-11, RF-19)

Spec (cabeçalho sobe para v0.6.0):
- Seção 8: anexos do run formam o catálogo do run; o dataset de exemplo não é usado como substituto; erro de ingestão termina o run sem chamar o provedor.
- Seção 11: saídas do `gerar` confinadas por `resolveInside`; registrado que o servidor do desktop ainda não tem autenticação nem proteção de origem/CSRF (M8).
- RF-01 continua `planejado`: só cobre anexos CSV/Markdown no pedido de gráfico.

Código e testes:
- `src/fs/safe-path.ts` (`resolveInside`) e `tests/safe-path.test.ts`.
- **Correção no renderer** (`chart-vega-resvg@1.0.1`): uma coluna com `\` no nome (e, em geral, `.` ou `[`) fazia o Vega-Lite renderizar um gráfico **vazio, sem erro**. Os dados agora vão com apelidos fixos (`x`, `y`, `s`); os títulos continuam vindo da spec. O `id` da spec, que vem do modelo, é saneado antes de virar nome de arquivo (antes `..\..\x` entrava no caminho).
- Orchestrator: `RunRequest.attachments`, catálogo por run, `defaultChartRender` exportado; anexo sem dataset (ex.: Markdown sem tabela) é `E_INGEST_INVALIDO`.
- Comando `bun run src/cli.ts gerar [--kind chart] [--anexo arquivo]... [--out pasta] "pedido"`: grava `grafico-<hash12>.png` e `.svg` em `artifacts/<runId>` (ignorado no git) e informa estados e número de tentativas.
- Desktop: `POST /api/runs` aceita multipart com vários anexos; o formulário ganhou o campo de arquivo e passou a enviar `FormData` (o `URLSearchParams` anterior descartaria os arquivos).
- Testes novos: `tests/gerar.test.ts` (8), `tests/orchestrator.test.ts` (+10, incluindo PNG real das duas fixtures), `tests/desktop.test.ts` (+7), `tests/chart-render.test.ts` (+3).

Verificação (`bun run check`): tsc limpo, 185 testes no Bun (3 opt-in pulados), 186 steps no Deno, TRACE com 31 requisitos, 14 ativos e 0 lacunas.

Demo real, Ollama local com `qwen2.5:7b` (fora do `check`), 1 execução de cada:
- `gerar --anexo vendas.csv "gráfico de barras com a soma do valor por produto"`: `ENTREGUE` na 1ª tentativa; as barras conferem com a soma calculada do CSV (Notebook ≈ 77 mil, Monitor ≈ 23 mil, Cadeira ≈ 18,5 mil, Teclado ≈ 3,4 mil, Mouse ≈ 2 mil).
- `gerar --anexo vendas-br.csv "gráfico de barras com a soma do valor por região"`: `ENTREGUE` na 1ª tentativa; São Paulo ≈ 16,4 mil, Nordeste ≈ 16,1 mil, Sul ≈ 11,4 mil, também conferindo.
- Duas execuções não medem RNF-01/RNF-02; isso é o eval set (Task 16).

### Pendente
- XLSX e PDF (M2) e DOCX/PPTX (M7) ainda não têm ingestor; `ingerir` e `gerar` aceitam só `.csv`, `.md` e `.markdown`.
- Tipos de coluna só são inferidos; a confirmação pelo usuário não existe.
- OpenRouter continua sem teste real (precisa de chave). `generateObject` segue depreciado no `ai@7`.
- O servidor do desktop não tem autenticação nem proteção de origem/CSRF (M8).

## v0.5.2 — 09/10/2026

Primeiro teste contra um Ollama real (Qwen 2.5 7B).

### Código e testes
- **Correção:** `OllamaNative` lia `response` (campo do `/api/generate`) em vez de `message.content` (`/api/chat`), então o `probe` falhava com `E_SPEC_PARSE` contra um Ollama de verdade. Os testes simulavam o formato errado e passavam.
- **Correção:** o prompt de sistema ia em um campo `system` que o `/api/chat` ignora; agora vai como primeira mensagem `role: "system"`. `think: false` passa a ser enviado.
- Testes do adapter agora simulam o formato real do `/api/chat` e conferem o corpo enviado.
- Contrato real opt-in (`M0_CONTRACT=1`) ganhou dois casos: `AISDKProvider` (o caminho do Orchestrator) e o Orchestrator ponta a ponta. Resultado com `qwen2.5:7b` local: ChartSpec válida na 1ª tentativa e artefato entregue, ~2 s por chamada.
- `.gitignore` passa a ignorar `.env` e `.env.local` (RNF-06).

### Pendente
- OpenRouter continua sem teste real (precisa de chave).
- Uma amostra de 1 execução não mede RNF-01/RNF-02; isso é o eval set (Task 16).

## v0.5.1 — 09/10/2026

Task 3 (Fase B): contrato e validador do relatório docx.

### Spec
- Seção 6.3: `TextoLongo` passa a fazer parte da união `Bloco`.
- Seção 6.4: regras do DocxSpec com JSON Pointer (sintaxe, referências e campos, origem dos números); `id` de gráfico duplicado e fonte de texto longo vazia são `E_REF`; `calcId` é `E_REF` até existir `calc/`.
- Seção 6.8: `status = gerado` exige `texto`; `status = pendente` não pode ter `texto` (`E_SPEC_SCHEMA`).
- Seção 3.6: `commands/` e `validate-docx.ts` na estrutura do repositório.
- Questão aberta 10: números incidentais (anos, numeração) em texto.
- RF-16 continua `planejado`: só a validação do bloco existe, não a etapa `LONG_TEXT`.

### Código e testes
- `src/specs/schemas.ts`: `Base`, `TextoLongo`, `Bloco`, `DocxSpec`.
- `src/agent/validate-docx.ts`: `validateDocxSpec`, `validateDocxSemantics`, `validateDocx`.
- `src/agent/validate.ts`: helpers exportados; `validateChartSemantics` aceita `basePath` para gráficos embutidos (comportamento anterior preservado).
- `src/commands/validar.ts` e comando `bun run src/cli.ts validar <arquivo.json>` (exit 0 válida, 1 rejeitada, 2 uso incorreto ou arquivo ilegível). JSON sem `kind` é validado como ChartSpec.
- Fixtures em `specs/fixtures/docx/` (1 válida, 7 inválidas) e `tests/docx-spec.test.ts` (RF-03, RNF-04, RF-16 parcial, RF-12 strict schema).


## v0.5 — 09/10/2026

### Spec
- Projeto renomeado para autoSlider, descrito como assistente de escritório para relatórios.
- `specs/SPEC.md` passa a ser a cópia autoritativa da spec (seção 3.1).
- Novos requisitos: RNF-10 (núcleo runtime-neutral) e RNF-11 (rastreabilidade sem lacunas).
- Seção 3.3: tabela "Status dos requisitos" (`ativo`, `planejado`, `adiado`); só requisitos ativos exigem teste.
- Roadmap "relatório primeiro" (ADR-016); RF-20 (voz) adiado e retirado do M8.
- Canva: modelo de acesso atualizado (Developer Portal com client ID/secret; DCR descontinuado); cliente MCP na linha v2 (`@modelcontextprotocol/client`).
- Anthropic: structured output nativo via `@ai-sdk/anthropic`.
- ADR-015: SQLite via `node:sqlite`; ADR-016: roadmap relatório primeiro.

### Código e testes
- Suíte roda em Bun 1.4.2 e Deno 2.9.5 (`bun run test:all`); shim de `bun:test` para Deno em `tests/support/`.
- Smoke de `node:sqlite` e `@resvg/resvg-js` nos dois runtimes (RNF-10).
- Teste que proíbe `bun:*` em `src/` (RNF-10).
- `scripts/trace.ts` gera `specs/TRACE.md` e falha com lacunas (RNF-11); `bun run check` roda typecheck, testes nos dois runtimes e trace.
- Todos os blocos de teste passam a citar o ID do requisito.

### Pendências conhecidas
- `generateObject` está depreciado no `ai@7` (aviso em runtime). Migrar para `generateText` com `output` antes do M4.
