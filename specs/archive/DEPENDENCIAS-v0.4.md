# Dependências e riscos de implementação — v0.4

## Grafo de dependências

```text
Contratos TypeBox/JSON Schema
  ├── LLMProvider ──► AISDKProvider ──┬── Ollama provider v2
  │                                  └── OpenAICompatible/OpenRouter
  ├── SourceDoc/Dataset ──┬── Ingestores M2
  │                        └── ChartSpec/Renderers
  └── SqliteDriver ── Store M5

Renderers M1 ──► ChartGenerator M3 ──► Router/Docs/LONG_TEXT M4
M4 ──► Store/Patch M5 ──► Endurecimento M6
M6 ──► Canva/Ingestão avançada M7
Contratos runtime-neutros + Orchestrator ──► Desktop/Voz M8
```

## Dependências por área

| Área | Escolha inicial | Risco | Mitigação/critério |
|---|---|---|---|
| Runtime | Bun para CLI, Deno compatível no núcleo | APIs e addons divergentes | proibir `bun:*`; `bun test` e `deno test` no M0 |
| SQLite | `SqliteDriver`; avaliar `node:sqlite` e `better-sqlite3` | addon não carregar no Deno | smoke abre banco, cria tabela, insere e lê nos dois runtimes |
| Schema | TypeBox + JSON Schema gerado | strict OpenAI exige campos adicionais proibidos e `required` completo | transformação por adapter e fixture `ChartSpec`/`Slide` |
| Ollama | endpoint nativo, `format`, `options.num_ctx` | truncamento ou `done_reason=length` | erro explícito; comparar contadores com `num_ctx`; sem retry dentro do adapter |
| OpenRouter | OpenAICompat + `require_parameters` | conformidade varia por upstream | Validator continua autoridade; contrato real opt-in |
| Render chart | Vega-Lite + resvg | addon nativo no Deno | smoke no M0; plano B `resvg-wasm` |
| ZIP | XLSX inicialmente; DOCX/PPTX no M7 | zip bomb, macros e timeout | 25 MB, 2.000 entradas, 200 MB descompactado; Worker e timeout |
| PDF | pdf.js | PDF sem camada de texto | `E_INGEST_SEM_TEXTO`; OCR fora do escopo |
| Desktop | Deno Desktop experimental + WebView do SO | API experimental e CEF pesado | CLI de primeira classe; CEF apenas plano B |
| Voz | WebSpeech; Piper CPU | vozes dependem do SO | `SpeechProvider`, templates determinísticos e comando `ler` |

## Variáveis de configuração

- Primário global: `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`.
- Sobrescrita por etapa: `LLM_ROUTE_*`, `LLM_SPEC_*`, `LLM_PATCH_*`, `LLM_LONG_TEXT_*`.
- Fallback por etapa: `LLM_<ETAPA>_FALLBACK_*`.
- A execução nunca lê uma flag global para decidir fallback: usa exclusivamente `projects.allow_remote_fallback`.

## Segurança operacional

Arquivos de usuário são dados, não instruções. Parser e render não recebem rede. ZIPs são processados em Worker isolado, macros são rejeitadas e caminhos são confinados ao diretório do projeto. Segredos não entram em logs, specs ou `runs`. Toda etapa remota é bloqueada por `localOnly`.


## Vercel AI SDK

Dependências pinadas no `package.json`: `ai@7.0.135`, `@ai-sdk/openai-compatible@3.0.67`, `@ai-sdk/provider-utils@5.0.58` e `ollama-ai-provider-v2@4.0.1`. O Orchestrator usa `AISDKProvider`; o provider comunitário Ollama é isolado atrás dessa interface porque não há pacote oficial `@ai-sdk/ollama` publicado. `generateObject` faz structured output; validação semântica e política de retry continuam fora do SDK.
