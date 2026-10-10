# Roadmap de implementação — v0.4

Status: derivado da especificação técnica v0.4 · 08/10/2026

## Ordem e dependências

| Marco | Entrega principal | Depende de | Requisitos | Demonstração |
|---|---|---|---|---|
| M0 | Contratos LLM, `AISDKProvider` com `generateObject`, providers Ollama/OpenAICompat, `SourceDoc`/dataset, JSON Schema por adapter, CLI `probe`, smoke Bun/Deno | — | RF-08, RF-12 | `bun run src/cli.ts probe --schema chart` funciona com Ollama e OpenRouter apenas trocando `LLM_*`; testes mockados e de contrato verdes |
| M1 | Renderers chart/PPTX/DOCX/XLSX com fixtures congeladas | M0 (contratos) | RF-04, RF-05, RNF-03, RNF-05 | Specs manuais + datasets JSON geram artefatos válidos; goldens estruturais passam sem ingestão |
| M2 | Ingestão Markdown, CSV, XLSX e PDF com texto; limites, Worker e seleção lexical | M0 (contratos) | RF-01, RF-11, RF-17, RF-18 | Cada fixture gera `SourceDoc`; PDF sem texto, macro e ZIP excedido falham com erros tipados |
| M3 | SpecGenerator de ChartSpec com dados ingeridos | M1 + M2 | RF-03, RF-05, RF-11, RNF-04 | CSV/XLSX ingerido → ChartSpec validada → PNG e SVG; números sem origem são rejeitados |
| M4 | Router, geração PPTX/DOCX, `LONG_TEXT`, política híbrida e eval set | M1 + M2 + M3 | RF-01, RF-02, RF-03, RF-15, RF-16 | Qwen3 8B local gera spec; texto longo é gravado na spec; primário e fallback são medidos separadamente |
| M5 | Store, versões, patch e auditoria de runs | M4 | RF-06, RF-07, RF-10 | Patch inválido não altera versão; `allow_remote_fallback` é persistido e a combinação com `localOnly` falha na escrita |
| M6 | Endurecimento, Anthropic, logs, xlsx final e documentação | M5 | RF-09, RNF-06, RNF-07, RNF-08 | Suíte passa com integrações externas desativadas; segredo não aparece em logs, specs ou banco |
| M7 | DOCX/PPTX na ingestão e Canva via MCP | M6 | RF-13, RF-14, RF-17 | `tools/list`, confirmação e bloqueio localOnly testados; fallback manual documentado |
| M8 | Deno Desktop, Hono/HTMX, SSE, Workers e voz | M6 + contratos runtime-neutros | RF-19, RF-20, RNF-09 | WebView acompanha estados do run; WebSpeech/Piper fala templates e `ler`; CLI continua operante |

## Regras de execução

1. M0 define contratos antes de código de domínio. Cada requisito novo recebe teste de aceitação antes da implementação.
2. M1 roda em série antes de M2, mas os contratos `SourceDoc` e dataset já existem no M0. Goldens usam JSON congelado, nunca a saída mutável de um parser.
3. O núcleo não importa `bun:*`. A suíte deve rodar em Bun e Deno; o driver SQLite e `resvg-js` são decisões técnicas verificadas por smoke test.
4. O fallback só começa depois de 1 tentativa + 2 retentativas do primário. O fallback tem mais 2 retentativas: máximo de 6 chamadas. As métricas RNF-01/RNF-02 do primário não incluem fallback.
5. Toda demonstração deve poder ser repetida offline quando não depender explicitamente de Ollama, OpenRouter, Canva ou TTS remoto.

## Gatilhos de revisão

- Se o smoke test falhar no Deno, manter a interface `SqliteDriver` e trocar apenas o adapter, registrando ADR.
- Se `resvg-js` não carregar, validar `resvg-wasm` antes de alterar o contrato do renderer.
- Se o acesso OAuth do Canva for recusado, manter o exportador desativado e publicar o procedimento manual.
- Se RNF-01/RNF-02 não forem atingidos, registrar a medição e alterar o padrão por decisão explícita, nunca por fallback silencioso.
