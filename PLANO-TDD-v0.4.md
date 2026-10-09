# Plano TDD e critérios de demonstração — v0.4

Regra: nenhum código antes do requisito e do teste de aceitação. Cada teste deve carregar o ID, conter caso feliz e falha prevista, e alimentar a matriz de rastreabilidade.

## M0 — contratos e adapters

- Definir `LLMProvider`, `AISDKProvider`, `Msg`, `caps`, configuração, erros e `SourceDoc`/dataset; cobrir RF-08, RF-12, RF-17 e RF-18.
- Testar `generateObject` mockado com ChartSpec/Slide, opções `think=false`/`num_ctx`, OpenRouter `require_parameters` e normalização de erros.
- Gerar e testar `ChartSpec` e union `Slide`, incluindo strict OpenAI (`additionalProperties: false` e todos os campos em `required`).
- Mockar Ollama para timeout, modelo inexistente, `done_reason=length`, contexto excedido e JSON inválido. O adapter não retenta.
- Testar OpenAICompat/OpenRouter com `response_format.json_schema` e `provider.require_parameters`; contrato real é opt-in.
- `bun run src/cli.ts probe --schema chart` deve imprimir objeto validado e metadados, sem fallback.
- Rodar `bun test` e `deno test`; abrir SQLite e carregar `resvg-js` nos dois runtimes.

**Demo M0:** trocar somente `LLM_*` entre Qwen3 8B local e OpenRouter; ambos retornam ChartSpec validada. Chave/modelo inválido, contexto excedido e truncamento exibem erro explícito.

## M1 — renderers

Testes RF-04/RF-05 com specs manuais e datasets JSON congelados; validar estruturalmente PPTX/DOCX/XLSX e SVG/PNG, medir RNF-03 e cobertura RNF-05. Demo: uma spec manual por kind gera artefato sem rede.

## M2 — ingestão

Testar RF-17/RF-18 para Markdown, CSV, XLSX e PDF com texto. Cobrir PDF sem texto (`E_INGEST_SEM_TEXTO`), macro, limites de ZIP (`E_INGEST_LIMITE`), timeout de Worker e path traversal. Verificar RF-11: somente esquema/amostra de até 5 linhas entra no prompt. Demo: fixtures viram `SourceDoc` e datasets rastreáveis, com busca lexical.

## M3 — gráfico

Testar RF-03, RF-05, RF-11 e RNF-04: ChartSpec, JSON Pointer em erros, números sem origem (`E_NUMERO_SEM_ORIGEM`) e geração de PNG/SVG a partir de dados ingeridos. Demo: CSV → dataset → geração local → ChartSpec → render.

## M4 — documentos, política híbrida e eval

Testar RF-01/RF-02/RF-03, RF-15 e RF-16. A sequência é 1 tentativa + 2 retentativas do primário, depois 1 + 2 do fallback, no máximo 6. `LONG_TEXT` só roda com bloco pendente, grava o texto na spec e rejeita número novo. Eval set ≥30 pedidos compara Qwen3 8B (raciocínio desligado) e Qwen2.5 7B; fallback fica fora de RNF-01/RNF-02. Demo: geração local, preenchimento do bloco pendente e render da versão persistida.

## M5 — Store e patch

Cobrir RF-06/RF-07/RF-10, patch atômico (`E_PATCH`), persistência de `allow_remote_fallback=false`, alteração somente por comando, rejeição de `localOnly=true` com fallback verdadeiro e campos `etapa`, `tentativa`, `fallback_usado` em `runs`.

## M6 — endurecimento

Testar RF-09, RNF-06, RNF-07 e RNF-08: nenhum request remoto em localOnly, ausência de segredos, renderer/spec version e pipeline íntegro com integrações remotas desativadas.

## M7 — ingestão avançada e Canva

Testar DOCX/PPTX com unidades por parágrafo/slide e defesas ZIP; RF-13/RF-14 com OAuth, `tools/list`, confirmação, `E_EXPORT`, `E_MCP_AUTH` e bloqueio localOnly. Documentar e testar fallback manual.

## M8 — desktop e voz

Testar RF-19 (WebView, Hono/HTMX, SSE e Workers) e RF-20 (WebSpeech/Piper, templates determinísticos e `ler`). Smoke da CLI após empacotamento; reconhecimento de voz permanece fora da v1.

## Definition of Done

Schema/contrato atualizado; teste de aceitação com sucesso e falha; erro tipado; changelog e ADR quando estrutural; matriz de rastreabilidade sem requisitos ou testes órfãos; demonstração reproduzível registrada.
