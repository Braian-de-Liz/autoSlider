# Desktop local

O desktop é uma casca fina sobre um servidor [Hono](https://hono.dev) com HTMX e SSE. Toda a lógica de runs está em `src/desktop/` e no `Orchestrator`, o mesmo usado pela CLI, que continua sendo a interface principal.

> **Segurança.** O servidor escuta apenas em `127.0.0.1`, mas **não tem autenticação nem proteção de origem/CSRF**. Qualquer página aberta no mesmo computador poderia disparar pedidos a ele. Não exponha a porta na rede. A proteção está planejada para o marco M8.

## Como iniciar

Os comandos abaixo existem em `package.json` e `deno.json`. A coluna "Testado" diz o que foi executado de fato (Windows 11, Deno 2.9.5, 09/10/2026).

| Comando | O que roda | Testado |
|---|---|---|
| `bun run desktop` (ou `deno task desktop:webview`) | **Deno** abre uma janela WebView (1280×800) sobre um servidor num Worker, porta aleatória | **Funciona**: abre a janela "Gerador de Artefatos" |
| `bun run desktop:run:fonte` | O mesmo, pelo script `scripts/desktop-deno.ps1 -Modo Fonte` (carrega o `.env` antes) | **Funciona** |
| `bun run desktop:bun` | Servidor com o Bun (`src/desktop/main.ts`), sem janela, em `http://127.0.0.1:8787` (porta de `PORT`) | Não executado |
| `deno task desktop:server` | O mesmo `main.ts`, com o Deno, sem janela | Não executado |
| `bun run desktop:deno` | `deno desktop --backend webview src/desktop/main.ts`: **compila** o app em `dist/autoSlider/` (`autoSlider.exe` + `autoSlider.dll`) | Compila, mas o app **não inicia** (veja abaixo) |
| `bun run desktop:run` | O app compilado, pelo script `scripts/desktop-deno.ps1` | Detecta a queda e orienta o modo Fonte |
| `deno task desktop:dev`, `desktop:build` | Variações do Deno Desktop (`--hmr` e `--output`) | Não executados |

### O app compilado (`desktop:deno`) não inicia hoje

O `@resvg/resvg-js`, que desenha os gráficos, é um addon nativo (N-API). Dentro do runtime do `deno desktop` ele derruba o processo com `Must load N-API bindings`. Foi isolado com um app mínimo que só importa o `resvg-js` (cai igual) e um controle sem ele (abre). Enquanto isso não mudar, use o modo Fonte. Outras armadilhas encontradas ao tentar rodar o compilado, já tratadas pelo script `scripts/desktop-deno.ps1`:

- **Permissões:** o `desktop:deno` não passa nenhuma; o app morre com `Requires sys access to "hostname"`. O script compila com `--allow-net --allow-env --allow-sys --allow-read --allow-write --allow-ffi`.
- **Acento no caminho:** o lançador lê o caminho do runtime em Latin-1, então `Usuário` vira `UsuÃ¡rio` e a DLL não carrega. O script usa o caminho curto 8.3 e passa `--runtime <dll>` (sem isso o lançador diz `No runtime library found`).
- **`WebView2Loader.dll`** precisa estar ao lado do `.exe`; sem ela o processo sai com código 1, sem mensagem.
- **`.env`:** o app compilado não o lê; o script o carrega no ambiente.

Para tentar de novo depois de atualizar o Deno: `powershell -ExecutionPolicy Bypass -File scripts\desktop-deno.ps1 -Build`.

Observações:

- `bun run desktop` **chama o Deno**, apesar do prefixo `bun run`. Para abrir o servidor pelo Bun use `desktop:bun`.
- A janela usa a biblioteca `@webview/webview` (JSR) e, no Windows, o WebView2 do sistema (`WebView2Loader.dll` fica na raiz do repositório).
- O Bun lê o `.env` sozinho. O Deno não o carrega automaticamente: com os comandos do Deno, defina as variáveis `LLM_*` e `PROJECT_*` no ambiente (o script `desktop-deno.ps1` faz isso).
- Com `DENO_SERVE_ADDRESS` definido (Deno Desktop), `main.ts` chama `Deno.serve(app.fetch)` sem porta, como o Deno Desktop exige. Sem ele, usa a porta de `PORT` (padrão 8787).

## O que a interface faz

- **Novo pedido:** texto do pedido, formato de saída e anexos. Hoje só o formato "Gráfico (PNG/SVG)" tem pipeline; os outros aparecem desabilitados ("em breve").
- **Anexos (CSV ou Markdown):** aceita vários arquivos. **Com anexos, o gráfico usa somente os dados deles**; sem anexos, usa o dataset de exemplo `vendas`, só para demonstração. O modelo recebe o esquema das colunas e até 5 linhas de amostra de cada dataset.
- **Execução:** a timeline mostra `RECEBIDO → ROTEADO → SPEC_GERADA → VALIDADA → RENDERIZADA → ENTREGUE` por SSE (`GET /events`). Se a spec for inválida, o run tenta de novo (até 2 vezes) e a timeline passa por `SPEC_INVALIDA`. Falhas terminam em `FALHOU` com o código do erro tipado (por exemplo `E_INGEST_INVALIDO` para um anexo quebrado).
- **Resultado:** pré-visualização do gráfico e links para baixar o PNG e o SVG.
- **Projeto atual:** mostra se o projeto é `localOnly`, o provedor e o modelo, e os datasets disponíveis.

## Rotas do servidor

| Rota | Função |
|---|---|
| `GET /` | Página (HTML) |
| `POST /api/runs` | Inicia um run. Aceita `multipart/form-data` (campo `anexo`, vários arquivos), `application/x-www-form-urlencoded` e JSON (`prompt`, `kind`) |
| `GET /api/runs` | Lista os runs |
| `GET /api/runs/:runId/artifact/png` e `/svg` | Baixa o artefato |
| `GET /api/runs/:runId/candidate` | Última spec candidata, para depuração |
| `GET /events` | Fluxo SSE com os estados do run |

## Limitações

- Runs, specs e artefatos ficam **só em memória**: fechar o programa os perde (a persistência chega com a Store, Task 20 do plano).
- Um anexo grande é lido inteiro em memória antes de a ingestão checar o limite de 25 MB.
- A interface ainda se chama "Gerador de Artefatos" e exibe uma versão antiga no rodapé; não foi renomeada para autoSlider.
- Sem autenticação nem proteção de origem (veja o aviso no topo).

## O que não foi verificado

Os testes automáticos cobrem as rotas do `app.ts` (inclusive o upload de anexos), a escolha do modo de servidor em `runtime.ts` e o fluxo completo com um provedor falso. Foram executados à mão, em 09/10/2026: a janela WebView do modo Fonte (abriu com o título "Gerador de Artefatos") e a compilação do `desktop:deno` (ver acima). **Não foram executados:** `desktop:bun`, `desktop:server`, `desktop:dev` e `desktop:build`; e ninguém usou a interface na janela (enviar um pedido, ver a timeline, baixar o gráfico). Se algum comando falhar no seu ambiente, trate como defeito da documentação e avise.
