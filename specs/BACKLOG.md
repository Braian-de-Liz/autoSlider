# Backlog: o que falta fazer

Atualizado em 10/10/2026, sobre a SPEC v0.8.0. Este documento organiza o trabalho restante; a fonte da verdade dos requisitos continua sendo a `specs/SPEC.md` (IDs RF/RNF) e o que já existe está em `CHANGELOG.md`.

## 1. A meta

> Um assistente de escritório que **trabalhe com qualquer apresentação `.pptx`** (ler, entender, editar e criar) e que **se integre ao MCP do Canva para gerar apresentações no Canva**, além de produzir relatórios (docx, gráficos) a partir dos dados do usuário.

Isso estende o escopo da v0.7: antes, o pptx era um renderer a ser feito (Task 17) e o Canva era um exportador opcional (M7). Agora são trilhas centrais. As mudanças de requisito estão na SPEC v0.8.0 (RF-21 a RF-25, RNF-12 e RNF-13, marcos M9 e M10), todas `planejado`.

**"Qualquer .pptx" precisa de uma definição testável**, senão nunca termina. Proposta (decisão D-5 abaixo): um *corpus* de decks reais e diversos (criados no PowerPoint, exportados do Google Slides, do Canva e do LibreOffice, com e sem notas, tabelas, gráficos, imagens, SmartArt, vídeo e animações). Para cada deck, o sistema precisa (a) abrir sem erro, (b) extrair texto, notas e tabelas, (c) salvar sem edições preservando 100% das partes (RNF-12) e (d) falhar com erro tipado e mensagem clara nos casos que não suporta. O que ele **não** promete: editar visualmente SmartArt, vídeo, animações ou gráficos nativos; esses itens são preservados intactos, não editados.

## 2. Onde estamos (verificado em 10/10/2026)

| Item | Estado |
|---|---|
| Suíte | `bun run check` verde: tsc limpo, 246 testes no Bun (3 opt-in pulados), 247 steps no Deno, trace com 31 requisitos, 14 ativos, 0 lacunas |
| Commit | `55799e5` cobre as Fases A a C. **42 itens ainda sem commit** (documentação, ADR-017 a 021, renderer docx, leitor de ZIP, troca do resvg, scripts do desktop) |
| Gráfico | Pipeline completo com CSV/Markdown e Ollama local (`qwen2.5:7b`, 2 execuções reais); PNG pelo `resvg-wasm` com fonte embutida |
| Docx | Renderer ABNT/livre com texto, tabelas e figuras; **o modelo ainda não escreve o relatório** (a spec é à mão) |
| Ingestão | CSV e Markdown. **Faltam** XLSX, PDF, DOCX e PPTX |
| pptx, xlsx | Nada implementado (só o schema `Slide` no M0) |
| Canva | Nada implementado; só pesquisa (seção 5) |
| Persistência | Nenhuma: runs e artefatos ficam em memória |

### Dívidas de verificação (coisas que parecem prontas e não foram provadas)

- [ ] **App desktop compilado completo.** A troca para o `resvg-wasm` foi provada com um app mínimo dentro do `deno desktop`, mas o app **completo** (`desktop:deno`/`desktop:run`) não foi aberto depois da troca; a tentativa foi interrompida. Rodar `bun run desktop:run` e usar a interface (enviar pedido, ver a timeline, baixar o gráfico).
- [ ] **Visual do `.docx` no Word.** Os testes conferem o XML, não a aparência (fonte, margens, legendas, tabela, gráfico).
- [ ] **A janela do desktop em uso.** O modo Fonte abriu a janela, mas ninguém enviou um pedido por ela.
- [ ] **OpenRouter.** Nunca testado contra o serviço real (precisa de uma chave sua).
- [ ] **`desktop:bun`, `desktop:server`, `desktop:dev`, `desktop:build`** não foram executados.
- [ ] **Commit.** 42 itens sem commit; sugestão de blocos na seção 8.

## 3. Trilhas de trabalho

Legenda: **bloqueia** = não dá para começar antes; **R** = requisito da SPEC; **T** = tarefa numerada do plano anterior.

### Trilha A: núcleo OOXML e leitura de qualquer .pptx (M9) — **a base de tudo que envolve pptx**

Objetivo: abrir qualquer `.pptx` válido, entendê-lo e salvá-lo sem perder nada. R: RF-17 (parte PPTX, antecipada do M7), RNF-12, RNF-13.

1. **A1. Escrita de ZIP.** Hoje só existe leitura (`src/fs/zip.ts`). Falta gravar, com ordem de entradas estável e datas fixas, para o resultado ser determinístico (P5). Decisão D-1 (dependência ou código próprio).
2. **A2. Camada XML.** Hoje os testes leem XML por regex, o que não serve para editar. Falta um parser/serializador que preserve namespaces, ordem de atributos e conteúdo desconhecido. Decisão D-1.
3. **A3. Modelo do pacote OPC.** Partes, relações (`.rels`), tipos de conteúdo, caminhos relativos. Verificador de integridade (`pptx lint`): toda relação aponta para uma parte existente, nenhum id duplicado, todo slide da apresentação tem parte, tipos de conteúdo completos.
4. **A4. Teste de ida e volta (RNF-12).** Abrir e salvar sem editar produz o mesmo conteúdo normalizado, para todo deck do corpus. Este é o teste que mais protege o projeto de corromper arquivos do usuário.
5. **A5. Ingestão PPTX (RF-17).** Um `SourceDoc` por arquivo: uma unidade `slide` por slide, em ordem, com título, texto de cada forma (na ordem de leitura), notas do apresentador, tabelas como datasets, lista de imagens e mídias **sem enviar bytes ao prompt** (RF-11), slides ocultos marcados. Limites de ZIP (2.000 entradas, 200 MB) e Worker com timeout.
6. **A6. Erros tipados dos casos que não suporta:** `.pptm` com macro (`E_INGEST_MACRO`), arquivo protegido por senha ou corrompido (`E_INGEST_INVALIDO`), `.ppt` binário antigo e Keynote (mensagem pedindo para exportar como `.pptx`), arquivo acima do limite (`E_INGEST_LIMITE`).
7. **A7. Comando `ingerir deck.pptx`** e busca lexical (BM25) nos slides, reaproveitando `buscar`.

Entrega: `ingerir` e `buscar` funcionam em decks reais; o teste de ida e volta passa em todo o corpus.
**Bloqueia:** corpus de decks (D-5), decisão D-1.

### Trilha B: editar e criar .pptx (M9)

Objetivo: o assistente altera um deck existente sem regenerá-lo e cria decks novos. R: RF-21, RF-22, RF-06 (patch), RF-04.

1. **B1. Operações de edição tipadas e determinísticas**, aplicadas sobre o pacote da Trilha A, sem LLM: `substituir_texto` (por slide e forma), `definir_notas`, `remover_slide`, `duplicar_slide`, `mover_slide`, `substituir_imagem`, `preencher_placeholder`, `adicionar_slide_do_layout`. Tudo que a operação não toca é preservado byte a byte (RF-21). Erro `E_PATCH` quando a operação não se aplica; nada é gravado pela metade.
2. **B2. Criar a partir de uma `PptxSpec`** (os 5 layouts da seção 6.2: título, bullets, duas colunas, gráfico, tabela) com o tema de `theme.ts` (Task 17 do plano). Decisão D-2 (biblioteca de criação).
3. **B3. Criar usando o deck do usuário como base** (RF-22): reaproveitar os *layouts* e o tema de um `.pptx` dele e preencher os placeholders. É o que mais se aproxima do "trabalhar com qualquer apresentação". Spike obrigatório antes de prometer (risco R-3).
4. **B4. Gráficos e tabelas em slides:** gráfico como imagem (PNG do `renderChart`, já determinístico) e tabela nativa do pptx a partir de um dataset.
5. **B5. Notas do apresentador** geradas a partir do texto longo (liga com `LONG_TEXT`, Trilha C).
6. **B6. Verificação visual.** Sem PowerPoint ou LibreOffice no ambiente, só a estrutura é testável. Decisão D-6: instalar o LibreOffice para converter em PDF/imagem nos testes manuais? Sem isso, o usuário precisa abrir o arquivo e conferir.

Entrega: comando `render deck.json` (cria), `editar deck.pptx --ops ops.json` (edita) e `ingerir`, todos com testes de ida e volta e linter do pacote.
**Bloqueia:** Trilha A completa; D-2.

### Trilha C: o modelo trabalha o relatório e a apresentação (M3, M4)

Hoje o LLM só gera `ChartSpec`. Para o assistente de verdade falta:

1. **C1. Migrar `generateObject`** (depreciado no `ai@7`; emite aviso a cada execução). Fazer antes de tudo abaixo.
2. **C2. Módulo `calc/`** (T14): soma, média, contagem, agrupamento, com `calcId`; hoje todo `calcId` é `E_REF`. Libera RNF-04 de verdade (números calculados com origem).
3. **C3. `KindRegistry`** (T11): schema, prompt, validador e renderer por formato; o Orchestrator vira genérico. Docx primeiro, depois pptx.
4. **C4. Router** (T12): classifica o pedido em chart, docx, pptx, xlsx; kind fora do enum é `E_ROTA`.
5. **C5. Provedor por etapa** (T13): `LLM_ROUTE_*`, `LLM_SPEC_*`, `LLM_PATCH_*`, `LLM_LONG_TEXT_*`, com herança de `LLM_*`.
6. **C6. Etapa `LONG_TEXT`** (T15, RF-16): preenche os blocos `texto_longo`, rejeita número novo (`E_NUMERO_SEM_ORIGEM`). Decisão aberta nº 10 da SPEC (anos e numeração em texto) precisa ser resolvida aqui.
7. **C7. Geração de docx e de pptx pelo modelo** com trechos selecionados por busca lexical no prompt (já existe `describeExcerptsForPrompt`, ainda sem uso).
8. **C8. Eval set** (T16): pelo menos 30 pedidos com expectativas automáticas; mede RNF-01 e RNF-02 por modelo. **Sem isto não se sabe se o Qwen 2.5 7B aguenta um relatório ou uma apresentação** (só foi provado um gráfico simples).

### Trilha D: Canva via MCP (M10)

Detalhes e riscos na seção 5. Resumo do que falta, em ordem:

1. **D0. Você cria o app no Developer Portal** (client ID e secret). Só você pode fazer. Bloqueia todo o resto da trilha.
2. **D1. Spike (T27):** conectar com `@modelcontextprotocol/client` v2 (OAuth, redirect em loopback), gravar o `tools/list` real e responder as perguntas da seção 5.3.
3. **D2. Exportador `design_from_spec`** (T28, RF-13, RF-14): converter a `PptxSpec` em *brief* + *outline* e chamar `create-design`; consultar o job até concluir; guardar URL e ferramentas usadas (RNF-07). Bloqueado em projeto `localOnly`; confirmação mostrando o que será enviado.
4. **D3. Ler designs do Canva** (RF-23): `search-designs`, `get-design-content`, `get-design-pages`, `get-presenter-notes` viram `SourceDoc`.
5. **D4. Editar um design do Canva por transação** (RF-24): `start-editing-transaction`, `perform-editing-operations`, `commit` ou `cancel`, com pré-visualização e confirmação antes do `commit`.
6. **D5. Exportar do Canva** (RF-25): `get-export-formats` e `export-design`; verificar se `.pptx` é um formato disponível. Fecha o ciclo Canva → pptx → edição local.
7. **D6 (opcional, plano Pro):** `autofill-design` e modelos de marca.

### Trilha E: ingestão e formatos restantes (M2, M6, M7)

| Tarefa | Requisito | Observação |
|---|---|---|
| T8: XLSX (ExcelJS), com limites de ZIP, macros e Worker | RF-17 | Reaproveita `src/fs/zip.ts` e `inferTable` |
| T9: PDF com camada de texto (`pdfjs-dist` ou `unpdf`, escolher por smoke nos dois runtimes) | RF-17 | `E_INGEST_SEM_TEXTO` para PDF de imagem |
| T26: DOCX na ingestão | RF-17 | O PPTX foi antecipado para a Trilha A |
| T19: renderer e pipeline de xlsx | RF-04 | Fórmulas nunca geradas pelo modelo |

### Trilha F: persistência, edição por instrução e robustez (M5, M6)

| Tarefa | Requisito | Observação |
|---|---|---|
| T20: Store com `node:sqlite` (ADR-015), projetos, datasets, versões, artefatos, runs | RF-07, RNF-07 | Hoje tudo é em memória; fechar o desktop perde os runs |
| T21: versões, comparação, restauração e exportação | RF-07, RF-10 | |
| T22: edição por patch (JSON Patch validado por inteiro, `E_PATCH`) | RF-06 | **É o que permite "troque o slide 3 por um gráfico"** em linguagem natural; depende da Trilha B |
| T23: fallback remoto por etapa com opt-in persistido (máx. 6 chamadas) | RF-15 | Diferente da seleção por etapa (C5) |
| T24: adapter Anthropic (`@ai-sdk/anthropic`) | RF-08 | Só se for usar o Claude |
| T25: segurança, logs sem segredos, cobertura de 90% em render e calc | RF-09, RNF-05, RNF-06, RNF-08 | |
| T29: desktop sobre o pipeline completo, Workers, proteção de origem e CSRF | RF-19, RNF-09 | Hoje o servidor local não tem autenticação |

## 4. Ordem proposta

A ordem busca entregar valor cedo e reduzir o risco do que é incerto (OOXML e Canva) antes de gastar tempo com o modelo.

| # | Fase | Por que nesta posição |
|---|---|---|
| 0 | **Fechar as dívidas da seção 2** e fazer os commits | Pouco trabalho; sem isso não se sabe em que base se está construindo |
| 1 | **D0 (você) e D1 (spike do Canva)**, em paralelo com a Fase 2 | O spike pode derrubar premissas (importação, exportação em pptx, plano). Quanto antes, melhor |
| 2 | **Trilha A** (núcleo OOXML e leitura de qualquer pptx) | Base de tudo em pptx; já entrega `ingerir` e `buscar` em decks |
| 3 | **C1 e C2** (`generateObject`, `calc/`) | Curtos e destravam o resto da Trilha C |
| 4 | **Trilha B** (editar e criar pptx), começando pelo spike de template (B3) | Entrega o "trabalhar com qualquer pptx" de forma determinística, sem depender do modelo |
| 5 | **Trilha C** (C3 a C8) | O modelo passa a escrever relatório e apresentação; o eval set mede se funciona |
| 6 | **T20 a T22** (Store, versões, patch) | Edição por instrução em linguagem natural |
| 7 | **Trilha D** (D2 a D5) | O exportador usa a `PptxSpec` e o pipeline já prontos |
| 8 | **Trilha E**, **T23 a T25**, **T29** | Completam a v1 |

Observação sobre a ordem anterior: a ingestão de XLSX/PDF (T8, T9) estava logo depois do docx. Agora elas vêm depois da Trilha A porque a meta mudou para apresentações; se você preferir manter os dados de planilha e PDF primeiro, a Trilha E pode subir sem quebrar nenhuma dependência.

## 5. Canva MCP: o que a pesquisa mostrou

Fonte: documentação oficial em `canva.dev/docs/apps/mcp/`, lida em 10/10/2026. A lista de ferramentas é a de hoje; o código deve descobri-las com `tools/list` em tempo de execução (SPEC 10.1), não fixar nomes.

### 5.1 Ferramentas que importam

| Objetivo | Ferramenta | Observações |
|---|---|---|
| Gerar uma apresentação a partir de texto | `create-design` | Recebe `brief`, `format` e, para apresentações, um `outline` com `sections`. **Assíncrona**: devolve `job_id` e `continuation_token`; esperar ao menos 15 s e consultar `get-create-design-async-job` |
| Gerar candidatos para o usuário escolher | `generate-design` e `create-design-from-candidate` | A doc manda **apresentar os candidatos ao usuário**, não escolher sozinho; exige passo de confirmação na interface |
| Transformar um arquivo em design | `import-design-from-url` | Aceita PPTX, PDF, DOCX etc., mas **só por URL HTTPS pública** e "não é para arquivos locais, privados ou gerados por agente" |
| Ler um design | `get-design`, `get-design-pages`, `get-design-content`, `get-presenter-notes`, `search-designs` | Todos os planos, 100 req/min |
| Editar um design | `start-editing-transaction`, `perform-editing-operations`, `commit-editing-transaction`, `cancel-editing-transaction` | Operações `{type, element_id, text}` (por exemplo `replace_text`; em página responsiva, `find_and_replace_text`). As edições ficam em rascunho até o `commit` |
| Imagens | `upload-asset-from-url`, `create-upload-url`, `get-assets` | Para usar imagem numa edição, primeiro subir o asset e usar o `asset_id` |
| Exportar | `get-export-formats`, `export-design` | Devolve URLs de download (assíncrono). **Não confirmei que `.pptx` está entre os formatos** |
| Combinar | `merge-designs`, `copy-design`, `resize-design` | `resize-design` é Pro |
| Marca e modelos | `autofill-design`, `search-brand-templates`, `create-design-from-brand-template`, `list-brand-kits` | **Plano Pro ou superior** |

Limites de taxa relevantes: geração e importação 20 req/min; `generate-image` 10 req/min; leitura 100 req/min. Cada usuário autentica individualmente com a própria conta Canva.

### 5.2 O que isso muda no desenho

- **Gerar no Canva é viável**: `create-design` com *brief* e *outline* a partir da `PptxSpec`. O Canva decide o layout, então o resultado **não é determinístico (P5) nem idêntico ao pptx local**; é uma cópia derivada (P1), como a SPEC 10.1 já previa.
- **Mandar o pptx local para o Canva é o ponto frágil.** `import-design-from-url` exige URL pública, o que conflita com o local-first (P7). Opções, a validar no spike: (a) `create-upload-url` aceita arquivo local e o Canva consegue converter em design; (b) hospedar o arquivo temporariamente num endereço seu (por exemplo, um link pré-assinado de curta duração) com confirmação explícita; (c) não oferecer esse caminho e documentar o procedimento manual (abrir o pptx e importar no Canva).
- **Dá para editar um design do Canva já existente**, com transação e `commit`, o que combina com "troque o slide 3": mostrar o rascunho e pedir confirmação antes do `commit` (RF-14).
- **Dá para ler designs do Canva** e usá-los como fonte de um relatório (RF-23).
- A tradução `PptxSpec` → *outline* perde controle fino de layout. O ganho é rapidez e estilo do Canva; o preço é perder a garantia de que cada número e cada texto saiam exatamente como na spec. Por isso o RF-14 mantém a confirmação com o conteúdo exato que será enviado.

### 5.3 Perguntas que o spike (D1) precisa responder

1. O app do Developer Portal consegue autenticar com `redirect` em loopback (`http://127.0.0.1:<porta>`)? O desktop em WebView consegue completar o fluxo?
2. `tools/list` devolve as mesmas ferramentas da documentação para a sua conta (plano Free ou Pro)?
3. `export-design` oferece `.pptx`? E `.pdf`? (`get-export-formats`.)
4. `create-upload-url` permite subir um **arquivo local** e transformá-lo em design? Ou só serve para assets (imagens)?
5. O `create-design` com *outline* de 10 seções gera 10 slides com o texto fornecido, sem reescrevê-lo? (Se o Canva reescrever o texto, os números da spec podem mudar e quebrar RNF-04.)
6. Quanto tempo leva um `create-design` real? (A doc pede 15 s antes da primeira consulta.)
7. Há custo ou limite diário de créditos para geração?
8. O transporte HTTP do SDK funciona no Bun e no Deno? Se não, o plano B é `mcp-remote` via stdio.

## 6. Riscos

| ID | Risco | Probabilidade | Mitigação |
|---|---|---|---|
| R-1 | "Qualquer pptx" é aberto demais; sempre haverá um deck estranho | Alta | Corpus de aceite (D-5), preservar o que não entende, erros tipados claros, prometer ida e volta e não edição de tudo |
| R-2 | Corromper o arquivo do usuário ao salvar | Média, impacto alto | Nunca sobrescrever o original (gravar em `--out`), teste de ida e volta, linter do pacote, comparação por conteúdo normalizado |
| R-3 | Usar os layouts do deck do usuário como base (B3) é bem mais difícil do que parece (placeholders, herança de mestres, fontes) | Alta | Spike antes de prometer; entregar edição e criação do zero primeiro |
| R-4 | Importar pptx local no Canva não ser possível sem URL pública | Média | Spike D1; procedimento manual documentado como alternativa |
| R-5 | O Canva reescrever o texto e quebrar a regra de números com origem | Média | Spike (pergunta 5); validar o conteúdo devolvido pelo Canva contra a spec antes de dar o run por entregue |
| R-6 | Ferramentas do MCP mudarem (a doc é recente e foi reorganizada) | Média | Descoberta por `tools/list`; testes com servidor MCP falso; uma camada de mapeamento por capacidade |
| R-7 | Modelo local de 7B não aguentar a apresentação ou o relatório | Média | Eval set (C8) mede; usar `LONG_TEXT` em modelo remoto por configuração (C5); prompts menores por slide |
| R-8 | Sem PowerPoint/LibreOffice no ambiente, a conferência visual depende de você | Alta | Decisão D-6; checklist visual curto por entrega |
| R-9 | Dependências novas (parser de XML, escrita de ZIP, biblioteca de pptx) com licença ou compatibilidade ruim em Bun/Deno | Média | Smoke nos dois runtimes antes de adotar; versão exata; ADR |
| R-10 | Dados do usuário saindo da máquina para o Canva sem querer | Baixa, impacto alto | `localOnly` bloqueia a exportação (RF-14), confirmação mostra o conteúdo exato, token OAuth em arquivo com permissão restrita (RNF-06) |

## 7. Decisões em aberto (preciso de você)

| ID | Decisão | Opções | Minha recomendação |
|---|---|---|---|
| D-1 | Como ler e gravar o pacote pptx | (a) código próprio sobre `src/fs/zip.ts` + parser XML novo; (b) `jszip` + `fast-xml-parser`; (c) `pptx-automizer` (edita/mescla pptx existentes, baseado em templates) | (b): bibliotecas pequenas e maduras para ZIP e XML, com o modelo de pacote e as operações escritos por nós. Avaliar o `pptx-automizer` só no spike B3. Registrar em ADR depois do smoke em Bun e Deno |
| D-2 | Criar pptx do zero | (a) `pptxgenjs` (prevista na SPEC); (b) gerar pelo nosso núcleo OOXML | (a) para o M9 inicial; trocar só se esbarrar em limite |
| D-3 | Importar pptx local no Canva | (a) URL pública temporária sua; (b) `create-upload-url` se o spike permitir; (c) só manual | Decidir depois do spike D1; (c) é o padrão seguro |
| D-4 | Canva na geração | (a) `create-design` direto; (b) `generate-design` com candidatos e escolha do usuário | (a) por padrão; (b) quando o usuário quiser variações |
| D-5 | Corpus de decks para o aceite | Você fornece 8 a 10 decks reais (anonimizados) de origens variadas, ou eu gero decks sintéticos | Os dois: sintéticos para os testes automáticos e os seus reais para a validação manual |
| D-6 | Verificação visual | Instalar o LibreOffice para converter em PDF/imagem, ou você abre os arquivos | Instalar o LibreOffice (uso só em conferência manual, fora do `check`) |
| D-7 | Seu plano do Canva | Free ou Pro/Teams | Se for Free, `autofill` e modelos de marca ficam fora |
| D-8 | Formatos que ficam fora | `.ppt` antigo, Keynote, Google Slides (exporta pptx), `.pptm` | Fora na v1, com mensagem pedindo para exportar como `.pptx` |
| D-9 | Ordem das fases | A da seção 4 ou manter XLSX/PDF primeiro | A da seção 4 |
| D-10 | Números incidentais em texto (SPEC, questão 10) | Aceitar números do `SourceDoc`, lista permitida na spec, ou continuar rígido | Decidir na Trilha C; afeta toda apresentação com datas e numeração de slides |

## 8. Antes de continuar: commits sugeridos

O que está sem commit se divide naturalmente em blocos, nesta ordem:

1. Documentação e arquivo morto: `README.md`, `DESKTOP.md`, `specs/archive/`, ADR-017 a 020, SPEC.
2. Renderer docx: `src/render/docx.ts`, `theme.ts`, `src/fs/zip.ts`, comando `render`, fixtures e testes.
3. Troca do resvg: `src/render/png.ts`, `assets/fonts/`, ADR-021, `package.json`, `bun.lock`, `deno.json`.
4. Desktop: `scripts/desktop-deno.ps1` e atalhos.
5. Este backlog e a SPEC v0.8.0.

Os blocos 2 e 3 compartilham `chart.ts`/`docx.ts` e os testes, então talvez valha um único commit "renderer docx e troca do resvg".

## 9. Fora de escopo (por enquanto)

Voz (RF-20, adiada), reconhecimento de voz, OCR, multiusuário e autenticação, colaboração em tempo real, geração de imagens por IA como requisito, template institucional do SENAI (ADR-020), edição visual de SmartArt, vídeo, animações e gráficos nativos do PowerPoint (preservados, não editados).
