# Desktop local

O desktop é uma casca fina sobre o servidor Hono. O mesmo entrypoint funciona em Bun e Deno; a lógica de runs permanece em `src/desktop/` e a CLI continua sendo a interface principal.

## Deno Desktop (principal)

Requer Deno 2.9 ou superior. O backend padrão é o WebView do sistema e a porta é escolhida pelo runtime:

```bash
deno task desktop:dev
```

Para gerar o binário Windows configurado em `deno.json`:

```bash
deno task desktop:build
```

O entrypoint chama `Deno.serve(app.fetch)` quando `DENO_SERVE_ADDRESS` está presente, exatamente como exigido pelo Deno Desktop. O runtime mantém o servidor em `127.0.0.1` e o WebView abre a UI automaticamente.

Para testar somente o servidor HTTP Deno sem empacotar:

```bash
deno task desktop:server
```

## WebView nativo com `@webview/webview`

Para o entrypoint que serve `dist` ao lado do executável e abre uma janela WebView explícita:

```bash
deno task desktop:webview
```

Esse modo usa `dirname(Deno.execPath())`, `serveDir`, `Deno.serve({ port: 0 })`, favicon local, título e janela de 1280×800. As rotas `/api/*` e `/events` continuam sendo atendidas pelo Hono; os demais caminhos são arquivos estáticos de `dist`.

O `dist/index.html` e o favicon mínimo são materializados na primeira execução se ainda não existirem. No empacotamento, inclua `dist` como asset ao lado do executável.


```bash
bun install
bun run desktop
```

Abra `http://127.0.0.1:8787`.

## O que já funciona

- UI HTML servida por Hono com HTMX.
- `POST /api/runs` inicia um run pelo Orchestrator configurado em `LLM_*`.
- A geração e validação de `ChartSpec` são reais; erros aparecem como `FALHOU` com código tipado.
- `GET /events` publica os estados via SSE.
- O servidor responde a novas requisições enquanto o run avança.
- Templates de status são determinísticos e escapam HTML.
- Sem provider injetado, os testes ainda podem usar o modo demonstrativo do `RunStore`.

O renderer determinístico de PNG/SVG ainda será conectado no próximo incremento M1; até lá, a execução termina após a validação da spec com mensagem explícita de renderer pendente.
