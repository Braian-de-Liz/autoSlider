# Changelog

Mudanças de spec e de comportamento, por versão da especificação (`specs/SPEC.md`).

## v0.8.0 — 10/10/2026 (escopo: qualquer .pptx e Canva; planejamento)

Mudança de **escopo**, sem código novo. O objetivo declarado passou a ser um assistente de escritório que trabalhe com qualquer apresentação `.pptx` e gere apresentações no Canva pelo MCP. O trabalho restante está em [`specs/BACKLOG.md`](specs/BACKLOG.md).

### Spec
- Novos requisitos, todos `planejado`: RF-21 (editar `.pptx` existente por operações tipadas, preservando o que não é tocado), RF-22 (criar `.pptx`, opcionalmente sobre os layouts do deck do usuário), RF-23 (ler design do Canva), RF-24 (editar design do Canva por transação com confirmação), RF-25 (exportar design do Canva), RNF-12 (ida e volta do pptx preserva todas as partes) e RNF-13 (cobertura do corpus de decks).
- Roadmap: **M9** (apresentações pptx: núcleo OOXML, leitura, edição e criação) e **M10** (Canva avançado). A ingestão de PPTX saiu do M7 para o M9.
- Seção 10.1 (Canva) atualizada com as ferramentas reais do servidor MCP lidas na documentação oficial em 10/10/2026: `create-design` com `outline` (assíncrono), `generate-design` com candidatos, edição por transação, leitura, exportação, limites de taxa e o que exige plano Pro. **Restrição encontrada:** `import-design-from-url` só aceita URL HTTPS pública, o que conflita com o local-first.
- Questões abertas 11 a 17: biblioteca do pacote pptx, criação de pptx do zero, corpus de aceite, formatos fora do escopo, Canva e arquivo local, plano do Canva e verificação visual.

### Documentação
- `specs/BACKLOG.md` novo: estado verificado, dívidas de verificação, trilhas A a F, ordem proposta, o que a pesquisa do Canva mostrou, riscos, decisões em aberto e blocos de commit sugeridos.

### Não verificado
- O app desktop **completo** compilado com o `resvg-wasm` ainda não foi aberto (a prova foi com um app mínimo).
- O visual do `.docx` no Word.
- Nenhuma ferramenta do MCP do Canva foi chamada: tudo o que está na seção 10.1 vem da documentação, não de uma conexão real.

## v0.7.1 — 09/10/2026 (resvg-wasm no lugar do resvg-js)

Motivo: o app compilado com `deno desktop` (`desktop:deno`) caía ao iniciar, com `Must load N-API bindings`, por causa do `@resvg/resvg-js` (addon nativo). Decisão e evidências na [ADR-021](specs/adr/ADR-021-resvg-wasm-com-fonte-embutida.md).

### Spec
- Seção 10: o renderer de gráfico converte SVG em PNG com `@resvg/resvg-wasm` 2.6.2 (versão exata) e a fonte DejaVu Sans embutida, com as regras do novo `svgToPng`. Seção 5.1, M0, RNF-10, árvore do repositório e seção 14 atualizadas; cabeçalho v0.7.1.
- ADR-021 nova; nota de atualização na ADR-015.
- O gatilho de revisão do roadmap antigo ("se `resvg-js` não carregar, validar `resvg-wasm`") foi acionado; o contrato de `renderChart` não mudou.

### Código e testes
- `src/render/png.ts` (novo): `svgToPng` com wasm iniciado uma vez, fonte embutida e `verifyFont`, que recusa (`E_RENDER`) uma fonte que não desenha texto. Isso importa porque o `resvg-wasm` não lê fontes do sistema e, sem fonte, desenha o gráfico **sem rótulos e sem erro** (medido: o PNG fica idêntico ao do SVG sem texto).
- `assets/fonts/DejaVuSans.ttf` (757 KB, sem modificação) e `assets/fonts/LICENSE-DejaVu.txt`; há um teste que garante que a licença acompanha a fonte.
- `src/render/chart.ts`: usa `svgToPng` e define `config.font` no Vega-Lite. `chart-vega-resvg@1.0.1` → `chart-vega-resvg-wasm@2.0.0`: **os pixels dos gráficos mudam** (outra fonte).
- `src/render/docx.ts`: `docx-abnt@1.1.0` → `1.2.0`, porque as figuras embutidas mudam.
- `@resvg/resvg-js` removido de `package.json`, `bun.lock` e `deno.json`; entra `@resvg/resvg-wasm@2.6.2` (mesma versão e licença, MPL-2.0).
- `tests/png.test.ts` (9 casos): texto desenhado, acentos, família genérica `sans-serif`, determinismo com hash de referência fixo, chamadas simultâneas, fonte válida, `verifyFont`, SVG inválido e licença. O smoke do M0 passa a testar o wasm; `tests/chart-render.test.ts` ganhou 2 casos (textos do gráfico são desenhados; SVG usa a fonte embutida).

### Medições (Windows, Bun 1.4.2, Deno 2.9.5)
- O mesmo SVG de teste dá o **mesmo PNG** (SHA-256 começando em `2321ca0b0cf9`) no Bun, no Deno e dentro do app compilado com `deno desktop`; sem fonte, `a476ff12bafb` (idêntico ao do SVG sem texto).
- Um app compilado mínimo com wasm e fonte (`--include assets/fonts`) inicia o servidor e abre a janela; com o `resvg-js` o mesmo app caía.

## v0.7.0 — 09/10/2026 (Fase B: renderer docx)

### Documentação
- `README.md` novo (estado atual, instalação, comandos, formato dos CSV, códigos de erro, limitações).
- `DESKTOP.md` reescrito conforme o código: `bun run desktop` chama o Deno (janela WebView sobre um Worker, porta aleatória); o servidor pelo Bun é `desktop:bun`; removida a promessa de renderer "pendente" (já está conectado); documentados os anexos, as rotas e o aviso de segurança. Registrado o que não foi verificado (janela WebView, Deno Desktop).
- Os quatro documentos da v0.4 foram movidos com `git mv` para `specs/archive/` (`SPEC-v0.4.md`, `ROADMAP-v0.4.md`, `PLANO-TDD-v0.4.md`, `DEPENDENCIAS-v0.4.md`), com um `README.md` explicando que foram superados.
- ADR-017 a ADR-020 (parsers próprios e UTF-8 estrito; catálogo por run; apelidos de coluna no Vega-Lite; docx do zero) e índice em `specs/adr/README.md`.
- Questão aberta nº 2 (preset docx) **resolvida**: só `abnt` e `livre`, gerados do zero, sem template institucional na v1.

### Task 4 — renderer docx ABNT (RF-04)

Spec: seção 10 (biblioteca `docx` 9.9.0 com versão exata, presets, blocos, `texto_longo` pendente = `E_RENDER`, determinismo e hash normalizado, comando `render`), seção 3.6 e cabeçalho v0.7.0. RF-04 continua `ativo` e passa a cobrir também o docx.

Código e testes:
- `src/render/theme.ts`: tokens dos presets `abnt` (Times New Roman 12, entrelinha 1,5, margens 3/3/2/2 cm, corpo justificado, recuo de 1,25 cm, número de página no canto superior direito) e `livre` (Calibri 11, entrelinha 1,15, margens de 2,5 cm).
- `src/render/docx.ts`: título, títulos 1 a 3, parágrafos, listas (cada lista numerada recomeça em 1), quebra de página e `texto_longo` gerado. `texto_longo` pendente é `E_RENDER`.
- **Determinismo medido:** duas gerações do mesmo documento com 1,5 s de intervalo diferem só em `docProps/core.xml` (datas) e nos timestamps do ZIP; com imagem, o `id` de `wp:docPr` também varia, por um contador global da biblioteca. O `hash` é o SHA-256 do conteúdo normalizado (entradas ordenadas, sem as datas do `core.xml`); o `id` da imagem é fixado por figura (Task 5).
- `src/fs/zip.ts`: leitor de ZIP próprio (sem dependência), com limites de entradas (2.000) e de tamanho descompactado (200 MB) e proteção contra tamanho declarado falso; será reaproveitado na ingestão de XLSX (Task 8). `tests/support/read-zip.ts` o reexporta.
- Comando `bun run src/cli.ts render <spec.json> [--anexo arquivo]... [--out pasta]` (`src/commands/render.ts`) e `typedFailure` em `src/commands/result.ts`.
- `slugText` em `src/ingest/common.ts`: `slugify` tira diretório e extensão (serve a nomes de arquivo) e transformaria o título `Vendas 01/2024` em `2024`.
- Fixture `specs/fixtures/docx/relatorio.json` (12 blocos, sem tabela nem figura); `minimo.json` segue sendo a fixture do validador.
- `tests/docx-render.test.ts` (30 casos na Task 4): estrutura do ZIP, A4 e margens, fonte e entrelinha, corpo justificado, título, estilos de título, listas, quebra de página, cabeçalho com `PAGE`, caracteres especiais, preset `livre`, erros explícitos, nome de arquivo saneado, determinismo (com intervalo de 1,1 s) e o comando `render`. Roda no Bun e no Deno.

### Task 5 — tabelas e figuras no docx (RF-04, RF-05)

Spec: seção 10 (legenda acima e fonte abaixo, numeração por contador próprio, cabeçalho repetido, só linhas horizontais, formatação só de apresentação, texto alternativo, limitações), nota de cobertura de RF-04 e RF-05 e cabeçalho (Fase B concluída). O renderer sobe para `docx-abnt@1.1.0`.

Código e testes:
- `src/render/docx.ts`: `tabela` e `figura` deixam de ser erro. A tabela traz todas as linhas do dataset; a figura reaproveita `renderChart` e embute o PNG com a proporção preservada e a largura limitada à área útil. `formatNumber`, `formatCell` e `pngSize` exportados e testados.
- Formatação de números própria (pt-BR, casas decimais preservadas), sem `Intl`, para o resultado não depender do ICU do runtime. Nada é calculado nem arredondado.
- O `id` da imagem (`wp:docPr`) é fixado por figura: sem isso, o mesmo relatório gerado duas vezes no mesmo processo teria hashes diferentes.
- Correção: `twipsToPixels` arredonda para baixo; a imagem saía 1 px mais larga que a área útil.
- Fixtures `relatorio-completo.json` (texto, tabela e figura) e `relatorio-vendas-csv.json` (para o CSV de 100 linhas).
- `tests/docx-render.test.ts` passa de 30 para 50 casos: o antigo "tabela e figura ainda não são suportadas" foi substituído pelos erros de dados ausentes; novos grupos de tabelas, formatação, figuras e do comando `render` com o CSV do usuário (100 linhas, valores e datas formatados, gráfico do CSV).

### Pendente
- Ninguém abriu o `.docx` no Word nem no LibreOffice: os testes conferem a estrutura do XML (estilos, bordas, larguras, legendas e imagem), não o visual. **Abrir `artifacts/<hash>/*.docx` e conferir fonte, margens, legendas, tabela e gráfico.**
- Zeros finais de números de um CSV (`3013.80`) se perdem na ingestão e saem `3.013,8` na tabela.
- As legendas não usam o campo `SEQ` do Word e não há lista de tabelas nem de figuras.
- O docx ainda não é gerado pelo modelo (pipeline na Task 11): hoje a spec é escrita à mão.

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
