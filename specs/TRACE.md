# Matriz de rastreabilidade

Gerado por `bun run trace` a partir de `specs/SPEC.md` e `tests/`. Não edite à mão.

| Requisito | Status | Marco | Testes | Módulos |
|---|---|---|---|---|
| RF-01 | planejado | M2/M4 | tests/orchestrator.test.ts › RF-01: anexos no pedido (parcial) | src/agent/orchestrator.ts<br>src/data/catalog.ts<br>src/desktop/app.ts<br>src/desktop/run-store.ts<br>src/ingest/common.ts<br>src/llm/contracts.ts |
| RF-02 | planejado | M4 | tests/orchestrator.test.ts › RF-02: E_ROTA para formato sem pipeline | src/agent/orchestrator.ts<br>src/data/catalog.ts<br>src/desktop/app.ts<br>src/desktop/run-store.ts<br>src/ingest/common.ts<br>src/llm/contracts.ts |
| RF-03 | ativo | M3 | tests/docx-spec.test.ts › RF-03: DocxSpec (seção 6.3)<br>tests/docx-spec.test.ts › RF-03: comando validar<br>tests/m0-llm.test.ts › RF-08/RF-12: contrato real M0 (opt-in)<br>tests/orchestrator.test.ts › RF-03: Orchestrator com ChartSpec<br>tests/orchestrator.test.ts › RF-03/RNF-04: validação semântica (seção 6.4)<br>tests/orchestrator.test.ts › RF-03: retentativas guiadas pelo erro<br>tests/validate.test.ts › RF-03/RNF-04: validateChartSemantics (seção 6.4) | src/agent/orchestrator.ts<br>src/agent/validate-docx.ts<br>src/agent/validate.ts<br>src/commands/validar.ts<br>src/data/catalog.ts<br>src/desktop/app.ts<br>src/desktop/run-store.ts<br>src/ingest/common.ts<br>src/llm/ai-sdk.ts<br>src/llm/config.ts<br>src/llm/contracts.ts<br>src/llm/ollama.ts<br>src/llm/openai-compat.ts<br>src/llm/schema.ts<br>src/specs/schemas.ts |
| RF-04 | ativo | M1 | tests/docx-render.test.ts › RF-04: renderer docx ABNT (seção 10)<br>tests/docx-render.test.ts › RF-04: preset livre<br>tests/docx-render.test.ts › RF-04: erros explícitos do renderer<br>tests/docx-render.test.ts › RF-04: determinismo do docx (P5)<br>tests/docx-render.test.ts › RF-04: comando render<br>tests/docx-render.test.ts › RF-04: tabelas no docx (seção 10)<br>tests/docx-render.test.ts › RF-04: formatação de números e células<br>tests/docx-render.test.ts › RF-04: relatório completo pelo comando render<br>tests/gerar.test.ts › RF-04: comando gerar<br>tests/orchestrator.test.ts › RF-04: entrega do artefato<br>tests/safe-path.test.ts › RF-04: caminhos confinados ao projeto (seção 11) | src/agent/orchestrator.ts<br>src/agent/validate-docx.ts<br>src/commands/gerar.ts<br>src/commands/render.ts<br>src/data/catalog.ts<br>src/desktop/app.ts<br>src/desktop/run-store.ts<br>src/fs/safe-path.ts<br>src/ingest/common.ts<br>src/ingest/index.ts<br>src/llm/contracts.ts<br>src/render/docx.ts<br>src/render/theme.ts |
| RF-05 | ativo | M1 | tests/chart-render.test.ts › RF-05: renderer ChartSpec<br>tests/docx-render.test.ts › RF-05: figuras no docx (seção 10)<br>tests/orchestrator.test.ts › RF-05: gráfico com anexo e render real<br>tests/png.test.ts › RF-05: conversão de SVG em PNG com fonte embutida (ADR-021) | src/agent/orchestrator.ts<br>src/agent/validate-docx.ts<br>src/commands/render.ts<br>src/data/catalog.ts<br>src/desktop/app.ts<br>src/desktop/run-store.ts<br>src/ingest/common.ts<br>src/ingest/index.ts<br>src/llm/contracts.ts<br>src/render/chart.ts<br>src/render/docx.ts<br>src/render/png.ts<br>src/render/theme.ts |
| RF-06 | planejado | M5 | — | — |
| RF-07 | planejado | M5 | — | — |
| RF-08 | ativo | M0 | tests/ai-sdk.test.ts › RF-08: Vercel AI SDK bridge: Ollama<br>tests/m0-llm.test.ts › RF-08: contratos e seleção por configuração<br>tests/m0-llm.test.ts › RF-08: falhas explícitas dos adapters<br>tests/m0-llm.test.ts › RF-08/RF-12: contrato real M0 (opt-in) | src/agent/orchestrator.ts<br>src/desktop/run-store.ts<br>src/llm/ai-sdk.ts<br>src/llm/config.ts<br>src/llm/contracts.ts<br>src/llm/ollama.ts<br>src/llm/openai-compat.ts<br>src/llm/schema.ts<br>src/specs/schemas.ts |
| RF-09 | ativo | M6 | tests/orchestrator.test.ts › RF-09: localOnly | src/agent/orchestrator.ts<br>src/data/catalog.ts<br>src/desktop/app.ts<br>src/desktop/run-store.ts<br>src/ingest/common.ts<br>src/llm/contracts.ts |
| RF-10 | planejado | M5 | — | — |
| RF-11 | ativo | M2 | tests/ingest-csv.test.ts › RF-11: ingestão de CSV mantém só esquema e amostra no prompt<br>tests/ingest-markdown.test.ts › RF-11: busca lexical e trechos para o prompt<br>tests/orchestrator.test.ts › RF-11: só esquema e amostra entram no prompt | src/agent/orchestrator.ts<br>src/commands/buscar.ts<br>src/commands/ingerir.ts<br>src/data/catalog.ts<br>src/desktop/app.ts<br>src/desktop/run-store.ts<br>src/ingest/common.ts<br>src/ingest/csv.ts<br>src/ingest/index.ts<br>src/ingest/markdown.ts<br>src/ingest/search.ts<br>src/llm/contracts.ts |
| RF-12 | ativo | M0 | tests/ai-sdk.test.ts › RF-12: Vercel AI SDK bridge: OpenAI-compatible<br>tests/docx-spec.test.ts › RF-12: DocxSpec no schema strict da OpenAI<br>tests/m0-llm.test.ts › RF-12: OpenAICompat/OpenRouter<br>tests/m0-llm.test.ts › RF-08/RF-12: contrato real M0 (opt-in)<br>tests/schema.test.ts › RF-12: schema strict da OpenAI (seção 7, regra 3)<br>tests/schema.test.ts › RF-12: stripNullOptionals | src/agent/orchestrator.ts<br>src/agent/validate-docx.ts<br>src/commands/validar.ts<br>src/data/catalog.ts<br>src/desktop/run-store.ts<br>src/llm/ai-sdk.ts<br>src/llm/config.ts<br>src/llm/contracts.ts<br>src/llm/ollama.ts<br>src/llm/openai-compat.ts<br>src/llm/schema.ts<br>src/specs/schemas.ts |
| RF-13 | planejado | M7 | — | — |
| RF-14 | planejado | M7 | — | — |
| RF-15 | planejado | M4/M5 | — | — |
| RF-16 | planejado | M4 | tests/docx-spec.test.ts › RF-16: texto_longo (seção 6.8, validação parcial) | src/agent/validate-docx.ts<br>src/commands/validar.ts<br>src/data/catalog.ts<br>src/llm/contracts.ts<br>src/llm/schema.ts<br>src/specs/schemas.ts |
| RF-17 | ativo | M2 | tests/ingest-markdown.test.ts › RF-17: ingestão de Markdown (seção 6.9)<br>tests/ingest-markdown.test.ts › RF-17: comando buscar | src/commands/buscar.ts<br>src/ingest/index.ts<br>src/ingest/markdown.ts<br>src/ingest/search.ts<br>src/llm/contracts.ts |
| RF-18 | ativo | M2 | tests/ingest-csv.test.ts › RF-18: ingestão de CSV (seção 6.9)<br>tests/ingest-csv.test.ts › RF-18: limites e erros do CSV<br>tests/ingest-csv.test.ts › RF-18: comando ingerir | src/commands/ingerir.ts<br>src/data/catalog.ts<br>src/ingest/common.ts<br>src/ingest/csv.ts<br>src/ingest/index.ts<br>src/llm/contracts.ts |
| RF-19 | ativo | M8 | tests/desktop-runtime.test.ts › RF-19: runtime Deno Desktop<br>tests/desktop.test.ts › RF-19: desktop local Hono/HTMX/SSE<br>tests/desktop.test.ts › RF-19: upload de anexos no desktop<br>tests/orchestrator.test.ts › RF-19: interface reflete o projeto real | src/agent/orchestrator.ts<br>src/data/catalog.ts<br>src/desktop/app.ts<br>src/desktop/run-store.ts<br>src/desktop/runtime.ts<br>src/ingest/common.ts<br>src/llm/contracts.ts |
| RF-20 | adiado | — | — | — |
| RF-21 | planejado | M9 | — | — |
| RF-22 | planejado | M9 | tests/pptx-spec.test.ts › RF-22: PptxSpec (seção 6.2)<br>tests/probe-deck.test.ts › RF-22: sonda de apresentação (runDeckProbe)<br>tests/probe-deck.test.ts › RF-22: comando probe --schema deck | src/agent/probe-deck.ts<br>src/agent/validate-pptx.ts<br>src/commands/probe-deck.ts<br>src/data/catalog.ts<br>src/llm/contracts.ts |
| RF-23 | planejado | M10 | — | — |
| RF-24 | planejado | M10 | — | — |
| RF-25 | planejado | M10 | — | — |
| RNF-01 | planejado | M4 | — | — |
| RNF-02 | planejado | M4 | — | — |
| RNF-03 | planejado | M1 | — | — |
| RNF-04 | ativo | M3 | tests/docx-spec.test.ts › RNF-04: origem dos números em docx<br>tests/orchestrator.test.ts › RF-03/RNF-04: validação semântica (seção 6.4)<br>tests/pptx-spec.test.ts › RNF-04: números do pptx têm origem nos datasets referenciados<br>tests/probe-deck.test.ts › RNF-04: a sonda barra número sem origem<br>tests/validate.test.ts › RF-03/RNF-04: validateChartSemantics (seção 6.4) | src/agent/orchestrator.ts<br>src/agent/probe-deck.ts<br>src/agent/validate-docx.ts<br>src/agent/validate-pptx.ts<br>src/agent/validate.ts<br>src/commands/probe-deck.ts<br>src/commands/validar.ts<br>src/data/catalog.ts<br>src/desktop/app.ts<br>src/desktop/run-store.ts<br>src/ingest/common.ts<br>src/llm/contracts.ts<br>src/llm/schema.ts<br>src/specs/schemas.ts |
| RNF-05 | planejado | M1 | — | — |
| RNF-06 | planejado | M6 | — | — |
| RNF-07 | planejado | M6 | — | — |
| RNF-08 | planejado | M6 | — | — |
| RNF-09 | ativo | M8 | tests/desktop.test.ts › RNF-09: servidor não bloqueante | src/agent/orchestrator.ts<br>src/desktop/app.ts<br>src/desktop/run-store.ts<br>src/llm/contracts.ts |
| RNF-10 | ativo | M0 | tests/runtime-neutral.test.ts › RNF-10: núcleo runtime-neutral<br>tests/runtime-smoke.test.ts › RNF-10: smoke de runtime (${runtime}) | — |
| RNF-11 | ativo | M0 | tests/trace.test.ts › RNF-11: matriz de rastreabilidade | scripts/trace.ts |
| RNF-12 | planejado | M9 | — | — |
| RNF-13 | planejado | M9 | — | — |

Sem lacunas.
