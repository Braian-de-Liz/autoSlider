# autoSlider — Assistente de escritório para relatórios · Especificação Técnica

Versão 0.8.0 · 10/10/2026 · Autor: Braian de Liz · Metodologia: spec-driven · Status: M0 fechado; Fase C concluída (ingestão de CSV e Markdown e gráfico com dados reais); Fase B concluída (renderer docx com texto, tabelas e figuras)

> Esta é a cópia versionada e autoritativa (seção 3.1). Mudanças desde a v0.4 estão no `CHANGELOG.md`.

## 1. Resumo e escopo

O autoSlider é um assistente de escritório pessoal e local-first que ajuda a produzir relatórios. Recebe informações (texto, CSV, XLSX, PDF, Markdown) e entrega relatórios (.docx), apresentações (.pptx), planilhas (.xlsx) e gráficos (.png/.svg). O LLM (Ollama por padrão; qualquer outro provedor via chave de API) **não produz arquivos**: produz uma **spec** tipada e validada, e renderizadores determinísticos convertem a spec em arquivo.

**Motivação:** utilidade pessoal (trabalhos técnicos, relatórios, apresentações). Não é um produto multiusuário.

**Dentro do escopo (v1):** CLI; geração e edição de pptx, docx, xlsx e gráficos; versionamento de specs; troca de provedor por configuração (incluindo OpenRouter); exportação opcional para o Canva via MCP; modo localOnly.

**Fora do escopo (v1):** autenticação e multiusuário; interface web; OCR e imagens como entrada; colaboração em tempo real; geração de imagens por IA; deploy em nuvem.

## 2. Princípios de projeto

| ID | Princípio | Consequência prática |
| --- | --- | --- |
| P1 | A spec é a fonte da verdade | O arquivo é derivado; o que se versiona é a spec |
| P2 | O LLM propõe, o código dispõe | Toda saída do modelo passa por validação sintática e semântica antes de qualquer efeito |
| P3 | Aritmética em código | Nenhum número é calculado pelo modelo; cálculos são funções puras testadas |
| P4 | Provedor intercambiável | Nenhuma regra de negócio conhece o provedor de LLM |
| P5 | Render determinístico | Mesma spec + mesma versão do renderer = mesmo resultado |
| P6 | Falha explícita | Erros tipados; nunca truncamento, fallback ou correção silenciosa |
| P7 | Local-first | Dados não saem da máquina sem consentimento por projeto |

## 3. Metodologia spec-driven

### 3.1 Hierarquia de autoridade

1. Este documento e os schemas em `specs/schemas/`.
2. Testes de aceitação em `specs/acceptance/`.
3. Código em `src/`.

Em conflito, vence o nível superior. Código que contradiz a spec é bug; spec que contradiz a realidade é corrigida por mudança explícita de spec, nunca por desvio no código.

### 3.2 Fluxo de mudança

1. Propor a mudança na spec (commit em `specs/`), com ID de requisito novo ou alterado.
2. Escrever ou atualizar os critérios de aceitação (testes que falham).
3. Implementar até os testes passarem.
4. Registrar no `CHANGELOG.md` e, se for decisão estrutural, em `specs/adr/`.

Regra: **nenhuma funcionalidade existe sem ID de requisito, e nenhum ID existe sem teste de aceitação.**

### 3.3 Rastreabilidade

Cada bloco de teste (`describe` de nível superior) carrega ao menos um ID no título (`RF-04: renderiza docx válido a partir de spec mínima`); os `it` herdam o ID e podem citar outros. O script `scripts/trace.ts` (`bun run trace`) gera `specs/TRACE.md` com a matriz requisito → teste → módulo e **falha o CI** quando há bloco de teste sem ID, ID inexistente na spec, requisito sem status ou requisito `ativo` sem teste.

Cada requisito tem um status na tabela abaixo. `planejado` e `adiado` podem não ter teste; um requisito passa a `ativo` na mesma mudança que entrega seu teste de aceitação. Teste parcial de requisito `planejado` é permitido e aparece na matriz.

#### Status dos requisitos

| ID | Status | Marco |
|---|---|---|
| RF-01 | planejado | M2/M4 |
| RF-02 | planejado | M4 |
| RF-03 | ativo | M3 |
| RF-04 | ativo | M1 |
| RF-05 | ativo | M1 |
| RF-06 | planejado | M5 |
| RF-07 | planejado | M5 |
| RF-08 | ativo | M0 |
| RF-09 | ativo | M6 |
| RF-10 | planejado | M5 |
| RF-11 | ativo | M2 |
| RF-12 | ativo | M0 |
| RF-13 | planejado | M7 |
| RF-14 | planejado | M7 |
| RF-15 | planejado | M4/M5 |
| RF-16 | planejado | M4 |
| RF-17 | ativo | M2 |
| RF-18 | ativo | M2 |
| RF-19 | ativo | M8 |
| RF-20 | adiado | — |
| RF-21 | planejado | M9 |
| RF-22 | planejado | M9 |
| RF-23 | planejado | M10 |
| RF-24 | planejado | M10 |
| RF-25 | planejado | M10 |
| RNF-01 | planejado | M4 |
| RNF-02 | planejado | M4 |
| RNF-03 | planejado | M1 |
| RNF-04 | ativo | M3 |
| RNF-05 | planejado | M1 |
| RNF-06 | planejado | M6 |
| RNF-07 | planejado | M6 |
| RNF-08 | planejado | M6 |
| RNF-09 | ativo | M8 |
| RNF-10 | ativo | M0 |
| RNF-11 | ativo | M0 |
| RNF-12 | planejado | M9 |
| RNF-13 | planejado | M9 |

`ativo` significa que há teste de aceitação verde, não que o requisito esteja completo em todos os formatos: RF-03 e RNF-04 cobrem hoje ChartSpec e DocxSpec (validação, sem geração por LLM do docx); RF-04 e RF-05, o renderer de gráfico (a partir de anexos reais, pelo comando `gerar` e pelo desktop) e o renderer de docx com texto, tabelas e gráficos embutidos (pelo comando `render`; ainda sem geração do documento pelo modelo); RF-01, `planejado` e coberto só em parte (anexos CSV/Markdown no pedido de gráfico); RF-09 e RF-11, o pipeline de gráfico e a ingestão de CSV e Markdown; RF-17, só Markdown (XLSX e PDF no M2, DOCX no M7, PPTX no M9); RF-18, o CSV completo; RF-19, a casca do desktop com upload de anexos. Cada marco amplia os testes do requisito.

### 3.4 Versionamento

- Schemas seguem SemVer. Todo documento persistido carrega `specVersion`.
- Mudança incompatível exige migração em `specs/migrations/` e teste de migração com fixtures da versão anterior.
- Renderers registram sua própria versão em cada artefato gerado (RNF-07).

### 3.5 Definition of Done (por requisito)

- Schema atualizado e JSON Schema regenerado.
- Teste de aceitação verde, incluindo ao menos um caso de falha.
- Erro tipado definido para cada falha prevista.
- Entrada no changelog; matriz de rastreabilidade sem lacunas.

### 3.6 Estrutura do repositório

```
specs/
  SPEC.md            # este documento (cópia versionada)
  schemas/           # TypeBox (fonte) + JSON Schema gerado
  acceptance/        # testes de aceitação (RF-xx, RNF-xx)
  fixtures/          # specs válidas, inválidas e goldens
  adr/               # decisões arquiteturais
  migrations/        # migrações de specVersion
src/
  llm/               # provider.ts, ollama.ts, openai-compat.ts, anthropic.ts
  agent/             # route.ts, generate.ts, validate.ts, validate-docx.ts, patch.ts
  commands/          # comandos da CLI (validar, ingerir, ...)
  ingest/            # Ingestores (csv.ts, ...), busca lexical e helpers comuns
  fs/                # safe-path.ts (caminhos confinados) e zip.ts (leitor de ZIP com limites)
  render/            # docx.ts, theme.ts, chart.ts e png.ts prontos; pptx.ts e xlsx.ts a fazer
  calc/              # funções puras de cálculo e agregação
  store/             # Drizzle + SqliteDriver runtime-neutral
  cli.ts
assets/
  fonts/             # DejaVuSans.ttf e sua licença, usadas na conversão SVG→PNG (ADR-021)
```

## 4. Requisitos

### 4.1 Funcionais

| ID | Requisito |
| --- | --- |
| RF-01 | Criar um projeto a partir de pedido em linguagem natural e anexos opcionais (CSV, XLSX, texto) |
| RF-02 | Classificar o pedido em um tipo de saída: pptx, docx, xlsx ou chart |
| RF-03 | Gerar a spec do tipo escolhido, validada contra o schema, com no máximo 2 retentativas guiadas pelo erro |
| RF-04 | Renderizar a spec em arquivo e devolver o caminho |
| RF-05 | Gráficos: gerar ChartSpec e renderizar em PNG e SVG, com dados lidos do dataset por referência |
| RF-06 | Editar por instrução (ex.: troque o slide 3 por um gráfico de barras) via patch sobre a spec, sem regenerar o restante |
| RF-07 | Versionar toda spec; listar, comparar e restaurar versões |
| RF-08 | Trocar o provedor de LLM somente por configuração |
| RF-09 | Recusar o envio a provedor remoto quando o projeto está marcado localOnly |
| RF-10 | Exportar a spec (JSON) e o arquivo gerado |
| RF-11 | Dados tabulares extensos nunca entram no prompt; apenas esquema e amostra |
| RF-12 | Suportar o OpenRouter como provedor pelo adapter OpenAICompat, apenas com configuração (base URL, chave e identificador de modelo), roteando somente para endpoints que aceitem saída estruturada |
| RF-13 | Exportar a spec de pptx e de chart como design no Canva, com o sistema atuando como cliente do servidor MCP do Canva; operação opcional, acionada explicitamente a cada execução |
| RF-14 | Tratar a exportação ao Canva como operação remota: bloqueada em projetos localOnly e confirmada pelo usuário antes de qualquer envio |
| RF-15 | Selecionar o provedor por etapa via configuração fixa (`LLM_<ETAPA>_*`, com `LLM_*` como padrão); permitir um fallback remoto por etapa somente com opt-in persistido no projeto, após as 2 retentativas do primário, com no máximo 6 chamadas por etapa e registro da troca |
| RF-16 | Executar a etapa `LONG_TEXT` apenas quando houver bloco `texto_longo` pendente; gravar o texto gerado na spec e validar que nenhum número novo seja introduzido |
| RF-17 | Ingerir arquivos PDF, DOCX, XLSX, PPTX e Markdown em `SourceDoc`, com texto por unidade rastreável e datasets para tabelas |
| RF-18 | Ingerir CSV, respeitando limites de tamanho, segurança de arquivos compactados quando aplicável e amostra limitada no prompt |
| RF-19 | Disponibilizar desktop leve com WebView do sistema, Hono/HTMX, SSE e processamento pesado em Workers, mantendo a CLI como interface de primeira classe |
| RF-20 | (Adiado na v0.5, fora do roadmap atual.) Falar confirmações de evento e blocos `texto_longo` por `SpeechProvider`, usando templates determinísticos e sem reconhecimento de voz |
| RF-21 | Editar um `.pptx` existente por operações tipadas e determinísticas (substituir texto, definir notas, remover, duplicar e mover slides, substituir imagem, preencher placeholder, adicionar slide a partir de um layout), preservando sem alteração tudo que a operação não toca; nunca sobrescrever o arquivo original |
| RF-22 | Criar um `.pptx` a partir de uma `PptxSpec`, opcionalmente usando como base os layouts e o tema de um `.pptx` fornecido pelo usuário |
| RF-23 | Ler um design do Canva (conteúdo das páginas, notas do apresentador) como `SourceDoc`, via MCP e somente com autenticação e confirmação do usuário |
| RF-24 | Editar um design existente no Canva por transação (iniciar, operar, confirmar ou cancelar), mostrando o resultado em rascunho e exigindo confirmação antes do `commit` |
| RF-25 | Exportar um design do Canva para arquivo (`.pptx` ou `.pdf`, conforme os formatos que o servidor MCP oferecer) e devolver o caminho local |

### 4.2 Não funcionais

| ID | Requisito | Meta |
| --- | --- | --- |
| RNF-01 | Spec válida na 1ª tentativa, modelo local 7-8B, eval set | ≥ 85% |
| RNF-02 | Spec válida em até 3 tentativas | ≥ 97% |
| RNF-03 | Render de pptx de até 20 slides, sem rede | < 5 s |
| RNF-04 | Todo número em um artefato tem origem rastreável (dado do usuário ou função de cálculo) | 100% |
| RNF-05 | Cobertura de linhas em renderers e calc | ≥ 90% |
| RNF-06 | Segredos nunca em logs, specs ou banco | 0 ocorrências |
| RNF-07 | Cada run registra provedor, modelo, parâmetros, seed (se suportado), versão da spec e dos renderers | 100% |
| RNF-08 | Integrações externas (OpenRouter e Canva MCP) ficam atrás de interfaces e podem ser desativadas por configuração sem afetar o pipeline principal | Suíte de aceitação passa com ambas desativadas |
| RNF-09 | O desktop não bloqueia o event loop durante ingestão/render e mantém a CLI funcional | SSE atualiza estados e smoke da CLI passa |
| RNF-10 | Núcleo runtime-neutral: `src/` não importa `bun:*`; a suíte, o driver SQLite e o conversor SVG→PNG (`resvg-wasm`, sem addon nativo) passam em Bun e Deno nas versões fixadas (ADR-013, ADR-015, ADR-021) | `bun test` e `deno task test` verdes |
| RNF-11 | Rastreabilidade: todo bloco de teste cita requisito existente e todo requisito `ativo` tem teste (seção 3.3) | `bun run trace` sem lacunas |
| RNF-12 | Ida e volta do pptx: abrir e salvar um `.pptx` sem edições preserva todas as partes do pacote (comparação por conteúdo normalizado) | 100% dos decks do corpus de aceite (mínimo de 10, de origens variadas) |
| RNF-13 | Cobertura do corpus: todo deck do corpus abre sem erro e tem texto, notas e tabelas extraídos; o que não é suportado falha com erro tipado e mensagem acionável | 100% dos decks do corpus |

As metas de RNF-01 e RNF-02 são hipóteses a validar no M4; podem ser revistas por mudança de spec com base nos dados medidos. O eval set compara Qwen3 8B com raciocínio desligado e Qwen2.5 7B; Qwen3 8B é o padrão provisório do M0.

## 5. Arquitetura

```
CLI
  │
Orchestrator ──► Router ──► SpecGenerator ──► Validator ──► Renderer ──► Storage
                   │             │
                   └─────────────┴──► LLMProvider ──► AISDKProvider ──► Ollama provider | OpenAICompatible/OpenRouter
```

| Componente | Responsabilidade | Não faz |
| --- | --- | --- |
| Orchestrator | Controla o fluxo, estados e retentativas | Não chama LLM nem renderer diretamente fora do fluxo |
| Router | Classifica o pedido em kind (saída restrita a enum) | Não gera conteúdo |
| SpecGenerator | Monta o prompt por kind e obtém o objeto tipado | Não valida regras semânticas |
| Validator | Validação sintática (TypeBox) e semântica (regras da seção 6.4) | Não corrige a spec |
| Renderer | Função pura spec → arquivo | Não acessa rede nem LLM |
| Storage | Projetos, datasets, versões, artefatos, runs | Não contém regra de negócio |
| Exporter (opcional) | Depois da entrega, envia a spec ou o artefato a um destino remoto (Canva, via cliente MCP) | Não participa do render, não altera a spec e não roda em projeto localOnly |

### 5.1 Desktop leve (M8)

O núcleo não importa módulos `bun:*` e é executável em Bun e Deno. A CLI em Bun permanece a interface de primeira classe. O desktop é uma casca fina baseada no Deno Desktop experimental, com WebView do sistema por padrão e CEF somente como plano B; Hono serve HTML e HTMX, e SSE publica os estados do run. Parsing, render e demais operações pesadas rodam em Workers para não bloquear o event loop.

O desktop chama o mesmo Orchestrator da CLI e não contém regra de negócio. A versão do Deno é fixada. Compatibilidade de SQLite e de conversão SVG→PNG deve passar pelo smoke test dos dois runtimes e ser revalidada antes do M8. O `resvg-js` (addon nativo) não funcionou dentro do app compilado com `deno desktop` e foi trocado pelo `resvg-wasm` com fonte embutida (ADR-021).


`RECEBIDO → ROTEADO → SPEC_GERADA → VALIDADA → RENDERIZADA → ENTREGUE`

Desvios: `SPEC_GERADA → SPEC_INVALIDA → (retry, máx. 2) → SPEC_GERADA` ou `FALHOU`. Todo estado terminal grava o run com erro tipado ou caminho do artefato.

## 6. Contratos de dados (specs)

Os schemas abaixo são normativos. A fonte é TypeBox em `specs/schemas/`; o JSON Schema é gerado e usado nos provedores.

### 6.1 Campos comuns

```ts
const Base = {
  specVersion: Type.Literal('1.0'),
  title: Type.String({ minLength: 1, maxLength: 120 }),
  lang: Type.Literal('pt-BR')
}
```

### 6.2 PptxSpec

```ts
const Slide = Type.Union([
  Type.Object({ layout: Type.Literal('titulo'), titulo: Type.String(), subtitulo: Type.Optional(Type.String()) }),
  Type.Object({ layout: Type.Literal('bullets'), titulo: Type.String(),
    itens: Type.Array(Type.String({ maxLength: 120 }), { minItems: 1, maxItems: 6 }) }),
  Type.Object({ layout: Type.Literal('duas_colunas'), titulo: Type.String(),
    esquerda: Type.Array(Type.String()), direita: Type.Array(Type.String()) }),
  Type.Object({ layout: Type.Literal('grafico'), titulo: Type.String(), chartId: Type.String() }),
  Type.Object({ layout: Type.Literal('tabela'), titulo: Type.String(), datasetId: Type.String() })
])

const PptxSpec = Type.Object({
  ...Base,
  kind: Type.Literal('pptx'),
  charts: Type.Array(ChartSpec),
  slides: Type.Array(Slide, { minItems: 1, maxItems: 30 }),
  notas: Type.Optional(Type.Record(Type.String(), Type.String()))
})
```

### 6.3 DocxSpec, XlsxSpec e ChartSpec

```ts
const Bloco = Type.Union([
  Type.Object({ tipo: Type.Literal('heading'), nivel: Type.Integer({ minimum: 1, maximum: 3 }), texto: Type.String() }),
  Type.Object({ tipo: Type.Literal('paragrafo'), texto: Type.String() }),
  Type.Object({ tipo: Type.Literal('lista'), ordenada: Type.Boolean(), itens: Type.Array(Type.String(), { minItems: 1 }) }),
  Type.Object({ tipo: Type.Literal('tabela'), datasetId: Type.String(), legenda: Type.String() }),
  Type.Object({ tipo: Type.Literal('figura'), chartId: Type.String(), legenda: Type.String() }),
  Type.Object({ tipo: Type.Literal('quebra_pagina') }),
  TextoLongo // seção 6.8
])
const DocxSpec = Type.Object({ ...Base, kind: Type.Literal('docx'),
  preset: Type.Union([Type.Literal('abnt'), Type.Literal('livre')]),
  charts: Type.Array(ChartSpec), blocos: Type.Array(Bloco, { minItems: 1 }) })

const XlsxSpec = Type.Object({ ...Base, kind: Type.Literal('xlsx'),
  abas: Type.Array(Type.Object({
    nome: Type.String({ maxLength: 31 }),
    datasetId: Type.String(),
    colunas: Type.Array(Type.Object({ campo: Type.String(), titulo: Type.String(),
      formato: Type.Optional(Type.String()) }), { minItems: 1 })
  }), { minItems: 1 }) })

const ChartSpec = Type.Object({
  id: Type.String(),
  tipo: Type.Union([Type.Literal('bar'), Type.Literal('line'), Type.Literal('scatter'), Type.Literal('area')]),
  datasetId: Type.String(),
  x: Type.Object({ campo: Type.String(), titulo: Type.String() }),
  y: Type.Object({ campo: Type.String(), titulo: Type.String(),
    agregacao: Type.Optional(Type.Union([Type.Literal('sum'), Type.Literal('mean'), Type.Literal('count')])) }),
  serie: Type.Optional(Type.String()),
  titulo: Type.String()
})
```

O ChartSpec é um subconjunto próprio, compilado para Vega-Lite pelo renderer (ver ADR-004). O modelo nunca escreve Vega-Lite diretamente.

### 6.4 Regras semânticas do Validator

Além do schema, a validação rejeita a spec quando:

- Qualquer `datasetId` ou `chartId` referenciado não existe no projeto (`E_REF`).
- Um campo citado em `x`, `y`, `serie` ou `colunas` não existe no dataset, ou o tipo é incompatível com o uso (ex.: média de coluna textual) (`E_CAMPO`).
- Um pptx não começa com layout `titulo`, ou tem `chartId` declarado e não usado.
- Há valores numéricos literais no texto que não aparecem em dataset nem no resultado de uma função de `calc/` (`E_NUMERO_SEM_ORIGEM`, RNF-04).
- Há mais de 50 pontos de dados inline (RF-11).

**Regras do DocxSpec (v0.5.1).** A validação roda em duas passagens e para na primeira violação, sempre com JSON Pointer:

1. Sintaxe (`E_SPEC_SCHEMA`). Em bloco inválido, o erro aponta o campo do bloco (`/blocos/N/texto`), escolhendo o ramo da união pelo `tipo`; `tipo` desconhecido aponta `/blocos/N/tipo` e lista os tipos válidos. Um bloco `texto_longo` com `status = gerado` exige `texto` não vazio, e com `status = pendente` não pode ter `texto` (ambos em `/blocos/N/texto`).
2. Referências e campos, em ordem do documento (`E_REF`, `E_CAMPO`): `id` de gráfico duplicado (`/charts/N/id`); gráfico embutido validado como ChartSpec, com os caminhos prefixados por `/charts/N`; `datasetId` de `tabela` (`/blocos/N/datasetId`); `chartId` de `figura` ausente em `charts` (`/blocos/N/chartId`); fonte de `texto_longo` sem `datasetId` nem `calcId` (`/blocos/N/fontes/M`), com `datasetId` inexistente ou com `calcId` desconhecido. Enquanto `calc/` não existir, todo `calcId` é `E_REF`.
3. Origem dos números (`E_NUMERO_SEM_ORIGEM`): `title`, `heading`, `paragrafo`, itens de `lista` e legendas só podem conter números presentes nos datasets referenciados pelo documento. O `texto` de um `texto_longo` só pode conter números dos datasets listados nas `fontes` do próprio bloco.

### 6.5 Datasets

Um dataset registra: `id`, `nome`, `origem` (caminho e hash SHA-256 do arquivo), `colunas` (nome, tipo inferido e confirmado) e `linhas` (armazenadas fora do prompt). O LLM recebe apenas `id`, `colunas` e uma amostra de até 5 linhas.

**Normalização do CSV (v0.6.0, RF-18).** O Ingestor lê o arquivo como UTF-8 estrito (BOM removido; outra codificação é `E_INGEST_INVALIDO`, sem conversão silenciosa) e aplica, nesta ordem:

- Delimitador: o mais frequente entre `,` `;` e tab na primeira linha lógica, fora de aspas (empate: `,`, depois `;`, depois tab). Aspas RFC 4180, `""` escapado, quebra de linha dentro de aspas e CRLF/LF/CR. Linhas em branco são ignoradas.
- Cabeçalho: nome vazio, nome duplicado, arquivo vazio, só cabeçalho e registro com número de colunas diferente do cabeçalho são `E_INGEST_INVALIDO`, citando o registro. Nada é preenchido nem cortado.
- Convenção numérica pelo delimitador: `;` usa pt-BR (`1.234,50`), os demais usam en (`1,234.50`). Zeros à esquerda (`00123`), moeda (`R$ 10`), `%` e notação científica permanecem texto.
- Tipo por coluna, sobre as células não vazias: `boolean` (`true`/`false`), `number`, `date` (`YYYY-MM-DD`, e `dd/mm/yyyy` em pt-BR, validados no calendário e guardados como `YYYY-MM-DD`) ou `string`. Coluna mista é `string`. Célula vazia é `null`.
- Limite de 25 MB por arquivo (`E_INGEST_LIMITE`), verificado antes da leitura.
- O `id` do dataset é o nome do arquivo sem acento nem extensão (`vendas`); repetido no mesmo conjunto, ganha sufixo (`vendas-2`). A origem guarda o caminho informado e o SHA-256 dos bytes.

O tipo é hoje apenas **inferido**: a confirmação pelo usuário prevista no parágrafo anterior ainda não existe.

### 6.6 Erros tipados

| Código | Significado |
| --- | --- |
| E\_ROTA | Pedido não classificável em um kind suportado |
| E\_SPEC\_SCHEMA | Saída viola o schema |
| E\_SPEC\_SEMANTICA | Saída viola regra da seção 6.4 (subcódigos E\_REF, E\_CAMPO, E\_NUMERO\_SEM\_ORIGEM) |
| E\_PROVIDER | Falha de rede, autenticação, limite de taxa ou timeout do provedor |
| E\_LOCAL\_ONLY | Projeto localOnly com provedor remoto ativo |
| E\_RENDER | Falha na geração do arquivo |
| E\_PATCH | Patch inválido ou que gera spec inválida |
| E\_EXPORT | Falha na exportação: capacidade ausente no servidor MCP, resposta inválida ou design não criado |
| E\_MCP\_AUTH | Autenticação OAuth com o servidor MCP ausente, expirada ou recusada |
| E\_INGEST\_SEM\_TEXTO | PDF não contém camada de texto e OCR está fora do escopo |
| E\_INGEST\_INVALIDO | Arquivo ilegível, vazio, malformado, fora de UTF-8 ou de formato não suportado |
| E\_INGEST\_LIMITE | Arquivo, ZIP, entradas ou tamanho descompactado excede o limite |
| E\_INGEST\_MACRO | Arquivo com macro não é aceito |
| E\_CONFIG\_INVALIDA | Combinação inválida, incluindo localOnly com fallback remoto |
| E\_SPEECH | Falha no provedor de voz |

### 6.7 Contratos auxiliares

Os contratos de configuração, mensagens e datasets são compartilhados pelos adapters e pelo Ingestor.

### 6.8 Bloco de texto longo

O contrato de texto longo é um bloco versionado dentro da spec do documento:

```ts
const TextoLongo = Type.Object({
  tipo: Type.Literal('texto_longo'),
  papel: Type.Union([Type.Literal('resumo'), Type.Literal('conclusao')]),
  status: Type.Union([Type.Literal('pendente'), Type.Literal('gerado')]),
  texto: Type.Optional(Type.String()),
  fontes: Type.Array(Type.Object({
    datasetId: Type.Optional(Type.String()),
    calcId: Type.Optional(Type.String())
  }))
})
```

A geração da spec local pode produzir o bloco `pendente`; `LONG_TEXT` só é executada quando ele existe. O texto gerado é persistido na spec, antes do render, e usa somente números de datasets e resultados de `calc/`. O Validator aplica `E_NUMERO_SEM_ORIGEM` ao texto. A coerência entre `status` e `texto` é invariante do contrato e falha como `E_SPEC_SCHEMA` (seção 6.4). Na v0.5.1 o Validator já cobre essas regras (RF-16 parcial); a etapa `LONG_TEXT` que preenche o bloco ainda não existe. O bloco entra inicialmente no `DocxSpec`; layout equivalente no `PptxSpec` fica para o M4.

### 6.9 SourceDoc e ingestão

A ingestão converte Markdown, CSV, XLSX, PDF, DOCX e PPTX em `SourceDoc`, com unidades de texto rastreáveis (`arquivo`, `tipo`, `indice`, `texto`) e datasets tabulares associados. CSV deve constar explicitamente no catálogo de entrada do RF-01. Na primeira fase de ingestão (M2), entram Markdown, CSV, XLSX e PDF com camada de texto; DOCX e PPTX entram no M7.

PDF sem camada de texto termina em `E_INGEST_SEM_TEXTO`; OCR permanece fora do escopo. O Ingestor nunca envia o arquivo inteiro ao prompt: monta estrutura, esquema dos datasets e trechos selecionados por busca lexical; embeddings ficam para depois. ZIPs (XLSX, DOCX e PPTX) têm limites iniciais de 25 MB compactados, 2.000 entradas e 200 MB descompactados; macros são rejeitadas e a extração roda em Worker com timeout. Os limites são hipóteses calibráveis.

**Markdown (v0.6.0, RF-17).** O arquivo é lido como UTF-8 estrito, com o mesmo limite de 25 MB do CSV.

- Unidades: uma por seção ATX (`#` a `######`, com `title` = texto do título e `text` = título + corpo) e uma, sem `title`, para o texto anterior ao primeiro título. `index` começa em 1, `kind = document`. Cercas de código (``` e ~~~) ficam como texto: título e tabela dentro delas não contam.
- Tabelas GFM com ao menos uma linha de dados viram datasets (`<documento>-tabela-N`, nome "Seção (tabela N)"), com o tipo inferido por coluna tentando pt-BR e depois en. Nas células, link, negrito, itálico e código viram texto puro e `\|` vira `|`. Linha com número de células diferente do cabeçalho, coluna sem nome ou duplicada é `E_INGEST_INVALIDO`. Tabela só com cabeçalho permanece texto.
- No texto da unidade cada tabela é trocada por `[tabela: <id> (colunas: a, b; N linhas)]`: os dados da tabela nunca entram nos trechos do prompt (RF-11), e a busca ainda encontra os nomes das colunas.
- Números em prosa não viram números conhecidos; só as tabelas viram datasets (ver questão aberta 10).

**Busca lexical.** BM25 sobre as unidades de todos os documentos (k1 = 1,5; b = 0,75; idf = ln(1 + (N − df + 0,5) / (df + 0,5))). O texto indexado é título + texto, então um termo no título pesa mais que o mesmo termo só no corpo. A tokenização usa minúsculas, remove acentos e ignora tokens de um caractere e stopwords do português. Só há resultado com score > 0, ordenado por score e, no empate, pela ordem do documento. A consulta vazia não devolve nada.

**Trechos no prompt.** O bloco `<trechos>` declara o conteúdo como dado, nunca instrução, e identifica cada trecho por `fonte`, `secao` e `indice`. Cada trecho tem no máximo 1.500 caracteres e o bloco, 6.000; o que passa disso é cortado com `[trecho cortado: N caracteres omitidos]` ou contado em `[N trechos omitidos]`, sem truncamento silencioso. O pipeline de gráfico só usa datasets; os trechos entram no prompt do docx (Task 11).

Bibliotecas candidatas e suas validações de runtime ficam registradas no plano de implementação: parser Markdown, CSV, ExcelJS para XLSX e pdf.js para PDF. Cada adapter de ingestão deve produzir o mesmo contrato `SourceDoc` e testes de fixture, sem contaminar os goldens dos renderers.


### 6.10 Contrato de exportação

A exportação é uma operação separada do render e tem contrato próprio. O pedido só existe depois de a versão estar validada e renderizada.

```ts
const ExportRequest = Type.Object({
  specVersion: Type.Literal('1.0'),
  versionId: Type.String(),
  destino: Type.Literal('canva'),
  modo: Type.Union([Type.Literal('design_from_spec'), Type.Literal('importar_arquivo')]),
  confirmadoEm: Type.String({ format: 'date-time' })
})

const ExportResult = Type.Object({
  destino: Type.Literal('canva'),
  designUrl: Type.String(),
  ferramentasUsadas: Type.Array(Type.String())
})
```

Sem `confirmadoEm` o pedido é inválido (RF-14). Os dois modos são descritos na seção 10.1.

## 7. Provedores de LLM

```ts
interface LLMProvider {
  caps: { constrainedJson: boolean; ctx: number; remote: boolean }
  generate<T extends TSchema>(args: {
    system: string
    messages: Msg[]
    schema: T
    temperature?: number
  }): Promise<Static<T>>
}
```

| Provider | Cobertura | Saída estruturada |
| --- | --- | --- |
| AISDKProvider + `ollama-ai-provider-v2` | Ollama nativo local | `generateObject`, schema JSON, `think: false`, `options.num_ctx` explícito |
| AISDKProvider + `@ai-sdk/openai-compatible` | OpenAI, OpenRouter e similares | `generateObject`, `supportsStructuredOutputs`, `require_parameters` via transformação do request |
| AISDKProvider + `@ai-sdk/anthropic` | API nativa da Anthropic (M6) | Structured output nativo da API, via AI SDK; tool com `tool_choice` forçado fica como alternativa se o modelo escolhido não suportar |

**Configuração** por variáveis de ambiente: `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`. A chave fica em `.env` fora do controle de versão e nunca é registrada (RNF-06).

**Regras de implementação**

1. Validação e retentativas ficam **fora** do adapter, no Orchestrator. O adapter só traduz a chamada.
2. No Ollama, não usar o endpoint `/v1` para geração: ele não aceita `num_ctx` por requisição e o prompt seria truncado em silêncio quando exceder o contexto padrão.
3. Os schemas devem permanecer no subconjunto aceito por todos os adapters: objetos, arrays, enum, `anyOf` curto, sem `oneOf` e sem expressões regulares complexas. O modo strict da OpenAI exige `additionalProperties: false` e todos os campos em `required`; o gerador de JSON Schema aplica essa transformação por adapter.
4. Um teste de contrato roda o mesmo conjunto de schemas e prompts contra cada adapter configurado.
5. O SpecGenerator lê `caps` para ajustar o tamanho da spec pedida (modelos menores recebem prompts e limites mais enxutos).

### 7.2 Política híbrida por etapa

A seleção é fixa e explícita por configuração: `LLM_ROUTE_*`, `LLM_SPEC_*`, `LLM_PATCH_*` e `LLM_LONG_TEXT_*`; `LLM_*` fornece os valores padrão. As capacidades (`caps`) ajustam somente o tamanho pedido da spec, nunca o roteamento. Os padrões são roteamento, spec e patch locais; texto longo usa OpenRouter.

Cada projeto persiste `allow_remote_fallback`, padrão `false`; a execução lê somente o valor persistido. O fallback é configurado por `LLM_<ETAPA>_FALLBACK_*`, ocorre somente depois da tentativa inicial e das 2 retentativas do provedor primário, e inicia uma geração nova. O fallback tem suas próprias 2 retentativas: máximo de 6 chamadas por etapa. A troca e cada tentativa são registradas no run. RNF-01 e RNF-02 medem somente o modelo primário; resultados de fallback são métricas separadas. `localOnly = true` com `allow_remote_fallback = true` é rejeitado na escrita; qualquer etapa remota em projeto localOnly termina com `E_LOCAL_ONLY`.

### 7.3 Voz (adiada na v0.5)

Fora do roadmap atual (RF-20 `adiado`). O contrato abaixo é mantido como referência para quando a voz voltar ao escopo.

```ts
interface SpeechProvider {
  caps: { remote: boolean; offline: boolean }
  speak(texto: string, options: { voz?: string; taxa?: number }): Promise<AudioResult>
}
```

WebSpeech no WebView é o adapter padrão, Piper em subprocesso CPU é a alternativa offline e TTS remoto é opcional e sujeito a `localOnly`. Confirmações de evento usam templates determinísticos; o comando `ler` fala blocos `texto_longo`. Reconhecimento de voz, microfone e Whisper não fazem parte da v1.


### 7.1 OpenRouter

O OpenRouter é atendido pelo adapter OpenAICompat, sem adapter próprio (ADR-008). Configuração:

```
LLM_PROVIDER=openai-compat
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=<provedor>/<modelo>
LLM_API_KEY=<chave do OpenRouter>
```

1. A saída estruturada usa `response_format` com `type: json_schema`, como nos demais provedores compatíveis com OpenAI.
2. O suporte a saída estruturada varia por modelo e por endpoint upstream. O adapter envia `provider: { require_parameters: true }` para que a requisição só seja roteada a endpoints que aceitam os parâmetros enviados; sem isso, o parâmetro pode ser ignorado.
3. A documentação do OpenRouter informa que a garantia de conformidade varia por provedor upstream: alguns impõem o schema estritamente, outros o tratam como orientação. Por isso o Validator continua sendo a autoridade (P2) e a política de retentativa da seção 8 não muda.
4. Modelo sem suporte a saída estruturada faz a requisição falhar; o adapter converte a resposta em `E_PROVIDER`, preservando a mensagem original.
5. `caps.remote` é verdadeiro: em projeto localOnly o OpenRouter é recusado (RF-09), e os dados enviados ficam sujeitos às políticas do provedor upstream que atender a requisição.
6. O eval set registra o identificador do modelo e, quando a resposta informar, o provedor upstream, porque a taxa de spec válida pode diferir entre endpoints do mesmo modelo.

Para requisições sem streaming com `json_schema`, o OpenRouter oferece o plugin Response Healing, que reduz o risco de JSON malformado. Usar apenas como camada extra: ele não substitui o Validator nem as retentativas, e o eval set deve medir a taxa de spec válida com e sem o plugin para que ele não mascare a qualidade real do modelo. A lista de modelos com saída estruturada fica na página de modelos do OpenRouter, filtrada por esse parâmetro.

## 8. Pipeline e política de retentativa

| Etapa | Entrada | Saída | Invariante |
| --- | --- | --- | --- |
| Roteamento | Pedido, metadados dos anexos | `kind` | Saída restrita a enum; sem conteúdo livre |
| Geração | Pedido, kind, esquema dos datasets | Spec candidata | Temperatura ≤ 0.2; schema do kind aplicado |
| Validação | Spec candidata | Spec validada ou erro | Sem alteração da spec |
| Render | Spec validada, datasets | Arquivo e hash | Sem rede, sem LLM |
| Persistência | Spec, arquivo, run | Versão n+1 | Atômica: tudo ou nada |

**Retentativa:** no máximo 2. A mensagem de erro devolvida ao modelo contém o caminho do campo (JSON Pointer) e a regra violada, nada mais. Esgotadas as tentativas, o run termina em `FALHOU` com o erro tipado, e a última spec candidata é preservada para depuração.

**Tratamento de conteúdo de anexos:** texto e dados de anexos entram no prompt delimitados e marcados como dados, nunca como instrução. A defesa principal não é o prompt e sim o desenho: o modelo só pode emitir uma spec que passe no schema, e o único efeito colateral possível é o render dentro do diretório de saída.

**Anexos do run (v0.6.0).** Com anexos, o Orchestrator os ingere depois das verificações de formato e de `localOnly` e antes de `ROTEADO`. O catálogo do run contém **somente** os datasets dos anexos: o dataset de exemplo não é usado como substituto, e uma spec que o cite falha com `E_REF`. Erro de ingestão (`E_INGEST_INVALIDO`, `E_INGEST_LIMITE`) termina o run em `FALHOU` sem chamar o provedor, e anexos sem nenhum dataset (por exemplo, Markdown sem tabela) também. A mensagem de `ROTEADO` lista cada anexo, o id do dataset e o tamanho. Sem anexos, o run usa o catálogo do projeto (hoje, o dataset de exemplo `vendas`). O renderer de gráfico entrega aos dados do Vega-Lite apelidos fixos para as colunas (`x`, `y`, `s`), porque nomes reais de CSV com `.`, `[` ou `\` eram lidos como caminho e podiam gerar um gráfico vazio sem erro; o id da spec, que vem do modelo, é saneado antes de entrar no nome do arquivo (`chart-vega-resvg@1.0.1`).

### 8.1 Etapa LONG_TEXT

Depois da spec inicial validada, o Orchestrator procura blocos `texto_longo` com `status = pendente`. Se não houver bloco, a etapa é pulada. Se houver, usa o provider configurado em `LLM_LONG_TEXT_*`, recebe as fontes já calculadas, valida a saída e grava o texto na spec antes da renderização. A etapa segue a mesma política de 2 retentativas e, quando permitido, fallback com mais 2 retentativas. Números não presentes nas fontes causam `E_NUMERO_SEM_ORIGEM`. Em `localOnly`, provider remoto causa `E_LOCAL_ONLY`.


**Banco:** SQLite por uma interface `SqliteDriver`, sem imports `bun:*`; a implementação concreta (`node:sqlite` ou `better-sqlite3`) deve passar no smoke test em Bun e Deno antes do Store. Drizzle permanece a camada de mapeamento.

| Tabela | Campos principais |
| --- | --- |
| projects | id, nome, local_only, allow_remote_fallback (boolean, padrão false), criado_em |
| datasets | id, project_id, nome, hash, colunas_json, caminho |
| versions | id, project_id, n, spec_json, spec_version, pai_id, origem (gerada, patch, manual), criado_em |
| artifacts | id, version_id, formato, caminho, hash, renderer_version |
| runs | id, version_id, etapa, tentativa, fallback_usado, provedor, modelo, params_json, tokens_in, tokens_out, duracao_ms, erro_json |

Invariante de escrita: `local_only = true` e `allow_remote_fallback = true` é rejeitado com erro de validação. A alteração de `allow_remote_fallback` só ocorre por comando explícito; configuração global não substitui o valor persistido.


**Edição por patch (RF-06):** o modelo emite uma lista de operações JSON Patch (RFC 6902), limitadas a `add`, `replace` e `remove`, sobre caminhos permitidos para o kind. O patch é aplicado em memória e a spec **inteira** resultante passa pelo Validator. Se inválida, o patch é rejeitado por completo (`E_PATCH`) e a versão atual permanece. Em caso de sucesso, grava-se uma nova versão com `origem = patch` e `pai_id` apontando para a anterior.

## 10. Renderers

Contrato: `render(spec, ctx) → { path, hash, rendererVersion }`. Funções puras em relação ao LLM e à rede; o único efeito é gravar no diretório de saída do projeto.

| Formato | Biblioteca | Observações |
| --- | --- | --- |
| pptx | `pptxgenjs` | Cinco layouts fixos; tema por tokens em `theme.ts` |
| docx | `docx` 9.9.0 (versão exata) | Gerado do zero (ADR-020), em A4. Preset `abnt`: Times New Roman 12, entrelinha 1,5, margens 3 cm (superior e esquerda) e 2 cm (inferior e direita), corpo justificado com recuo de 1,25 cm, título centralizado, número de página no canto superior direito, legendas de tabela e figura numeradas. Preset `livre`: Calibri 11, entrelinha 1,15, margens de 2,5 cm. Detalhes abaixo |
| xlsx | `exceljs` | Tipos de coluna e formatos numéricos vindos da spec; sem fórmulas geradas pelo modelo |
| chart | Vega-Lite compilado → SVG → PNG com `@resvg/resvg-wasm` 2.6.2 (versão exata) e a fonte DejaVu Sans embutida | Sem navegador headless e sem addon nativo (ADR-021, que trocou o `resvg-js` por não funcionar no app compilado com `deno desktop`). Detalhes abaixo |

O tema (fontes, cores, margens, tamanhos) é um único arquivo de tokens, compartilhado pelos renderers, para manter a identidade visual consistente entre formatos. Hoje é `src/render/theme.ts`, com os presets `abnt` e `livre`.

**Conversão SVG→PNG (v0.7.1, ADR-021).** `svgToPng` (`src/render/png.ts`) usa o `resvg-wasm`, que não lê as fontes do sistema. Por isso:

- A fonte é embutida: `assets/fonts/DejaVuSans.ttf`, com `assets/fonts/LICENSE-DejaVu.txt` ao lado (a licença exige manter o aviso; a fonte não é modificada). Todas as famílias padrão do resvg e o `config.font` do Vega-Lite apontam para ela.
- O wasm é iniciado uma única vez. Antes do primeiro uso, `verifyFont` renderiza um texto e um quadro em branco e exige que difiram; sem isso o gráfico sairia **sem rótulos e sem erro**. Wasm que não inicia, fonte ilegível ou inválida, fonte que não desenha texto e SVG inválido são `E_RENDER` (P6).
- A saída é a mesma em Bun, Deno e no app compilado com `deno desktop` e independe das fontes instaladas na máquina (P5); o teste `tests/png.test.ts` fixa o hash de referência.
- Em app compilado, a fonte precisa ir junto do binário (`--include assets/fonts`).
- Versões (RNF-07): `chart-vega-resvg-wasm@2.0.0` e, por embutir os gráficos, `docx-abnt@1.2.0`.

**Renderer docx (v0.7.0).** `renderDocx(spec, { outputDir, datasets, writeFile })` devolve `{ path, hash, rendererVersion }` (`docx-abnt@1.1.0`). Só grava dentro de `outputDir`, uma vez, com nome `<título em slug>-<12 primeiros caracteres do hash>.docx`; o título nunca entra no caminho sem ser saneado.

- Blocos: o título da spec abre o documento (estilo `Title`); `heading` 1 a 3 usam os estilos de título (no `abnt`, nível 1 em negrito e maiúsculas por formatação, nível 2 em negrito, nível 3 em itálico, o texto da spec não é alterado); `paragrafo` e `texto_longo` viram parágrafos de corpo, divididos nas linhas em branco (quebra de linha simples fica dentro do parágrafo); `lista` usa marcadores ou numeração, e cada lista numerada recomeça em 1; `quebra_pagina` insere uma quebra de página.
- `texto_longo` com `status = pendente` é `E_RENDER`: o texto precisa estar gravado na spec antes do render (seção 6.8), e nada é substituído por um espaço em branco. Tipo de bloco desconhecido também é `E_RENDER`.
- **Determinismo (P5).** O ZIP e `docProps/core.xml` carregam a data de criação, então os bytes do arquivo variam entre execuções. O `hash` é o SHA-256 do **conteúdo normalizado**: nome e bytes descomprimidos de cada entrada, em ordem alfabética, sem as datas do `core.xml`. Mesma spec e mesma versão do renderer dão o mesmo `hash` e o mesmo nome de arquivo. A biblioteca usa um contador global para o `id` das imagens; o renderer o fixa por figura.
- Sem numeração automática de seções, porque o validador rejeita números no texto que não vêm dos dados (seção 6.4 e questão aberta 10).
- Comando `render <spec.json> [--anexo arquivo]... [--out pasta]`: valida a spec (schema e semântica) contra o dataset de exemplo ou, com `--anexo`, só contra os datasets dos anexos, e grava em `--out` (padrão `artifacts/<hash12>`), confinado ao diretório de trabalho e conferido antes de renderizar.
- **Tabela** (`tabela`: `datasetId` + `legenda`): legenda **acima**, `Tabela N – <legenda>` (N sequencial pela ordem no documento, texto simples e não campo SEQ, 10 pt), e a linha `Fonte: <nome do dataset>.` **abaixo**, sem o caminho local do arquivo de origem. O corpo traz **todas** as linhas do dataset: cabeçalho em negrito repetido em cada página, linhas que não se dividem entre páginas, só linhas horizontais (topo, abaixo do cabeçalho e fim, no estilo das tabelas ABNT/IBGE), números à direita e texto à esquerda, largura igual à do texto com colunas de larguras iguais. Dataset sem colunas ou sem linhas, ou não entregue ao renderer, é `E_RENDER`.
- **Figura** (`figura`: `chartId` + `legenda`): legenda **acima**, `Figura N – <legenda>` (contador próprio), imagem centralizada e `Fonte:` abaixo. O gráfico é renderizado por `renderChart` e embutido como PNG, com a proporção preservada, a largura limitada à área útil da página e sem ampliar o original. O texto alternativo usa o título do gráfico e `Gráfico de <tipo> de <y> por <x>`, montado só com campos da spec. O `id` da imagem (`wp:docPr`) é fixado por figura (1, 2, ...), porque a biblioteca o numera com um contador global do processo. O mesmo `chartId` pode aparecer em mais de uma figura.
- **Formatação só de apresentação (P3):** números em pt-BR com separador de milhar e vírgula decimal, preservando as casas decimais do valor (`1234.5` vira `1.234,5`; zeros finais de um CSV como `3013.80` já se perderam na ingestão, então saem `3.013,8`); datas `YYYY-MM-DD` viram `dd/mm/aaaa`; booleanos viram `sim` e `não`; `null` vira célula vazia. O código é próprio, sem `Intl`, para não depender da versão do ICU do runtime. Nada é calculado nem arredondado.
- Limitações: as legendas são texto, sem campo `SEQ` do Word, e não há lista de tabelas nem de figuras; uma tabela com muitas colunas divide a largura igualmente, sem quebra horizontal.

### 10.1 Exportação opcional: Canva via MCP

O Canva oferece um servidor MCP remoto (`https://mcp.canva.com/mcp`) com login por OAuth, sem chave de API. O sistema atua como **cliente MCP**. A integração é um **exportador** que roda depois da entrega, não um renderer: o render local (pptx, chart) continua sendo o caminho principal e funciona sem rede (P5). Esta seção cobre RF-13 e RF-14.

- **Posição no fluxo:** a partir de `ENTREGUE`, estado opcional `EXPORTANDO` seguido de `EXPORTADA` ou `EXPORT_FALHOU`. Falha de exportação nunca invalida o run nem a versão.
- **Cliente:** SDK oficial de MCP para TypeScript, linha v2 estável (`@modelcontextprotocol/client`, `Client` + `StreamableHTTPClientTransport`, OAuth pelo `OAuthClientProvider` do SDK). A linha v1 (`@modelcontextprotocol/sdk`) não é usada. Se o transporte remoto não funcionar no Bun, alternativa documentada pelo Canva: processo `mcp-remote` via stdio.
- **Descoberta de ferramentas:** as ferramentas são listadas em tempo de execução (`tools/list`); a spec não depende de nomes fixos. Um mapeamento em `export/canva.ts` associa cada capacidade necessária (criar design, enviar conteúdo, exportar) à ferramenta encontrada. Capacidade ausente gera `E_EXPORT` com a lista das ferramentas disponíveis.
- **Modo `design_from_spec`:** converte a spec em um pedido estruturado (título e texto de cada slide, dados referenciados) para as ferramentas de geração de design do Canva. O resultado é um design editável no Canva, mas o layout passa a ser decidido pelo Canva, não pelo renderer local.
- **Ferramentas do servidor (documentação de 10/10/2026, a confirmar com `tools/list`):** `create-design` recebe `brief`, `format` e, para apresentações, um `outline` com `sections`; é assíncrona (devolve `job_id` e `continuation_token`; esperar ao menos 15 s antes de consultar `get-create-design-async-job`). `generate-design` produz candidatos que a documentação manda **apresentar ao usuário** (`create-design-from-candidate` materializa o escolhido). `start-editing-transaction`, `perform-editing-operations`, `commit-editing-transaction` e `cancel-editing-transaction` editam um design em rascunho até o `commit`. `get-design`, `get-design-pages`, `get-design-content`, `get-presenter-notes` e `search-designs` leem. `get-export-formats` e `export-design` exportam (assíncrono, URLs de download). Limites: 20 req/min na geração e na importação; `autofill-design`, modelos de marca e `resize-design` só no plano Pro ou superior.
- **Modo `importar_arquivo`:** envia o arquivo já renderizado. A viabilidade depende das ferramentas que o servidor expõe e deve ser validada no início do M7. **Restrição encontrada em 10/10/2026:** `import-design-from-url` aceita pptx, mas só por **URL HTTPS pública**, e a documentação diz que não serve para arquivos locais ou privados. Isso conflita com o local-first (P7): o caminho só entra com confirmação explícita do usuário (RF-14), e a alternativa é o procedimento manual (questão aberta 15).
- **Fonte da verdade:** o design no Canva é uma cópia derivada (P1). Edições feitas no Canva não voltam para a spec; o run grava a URL do design e as ferramentas chamadas (RNF-07).
- **Privacidade:** o texto e os dados dos slides saem da máquina. O envio é bloqueado em projeto localOnly e, nos demais, exige confirmação por execução mostrando o que será enviado (RF-14).
- **Acesso (atualizado em 09/10/2026):** o caminho recomendado pelo Canva é criar um app no Developer Portal e ativar o Canva MCP; o app recebe client ID e client secret e gerencia os redirect URLs, sem lista de espera. Clientes CIMD sem secret passam por lista de espera; DCR está descontinuado em favor de CIMD. Cada usuário autentica individualmente com a própria conta Canva. O spike do M7 cria o app, autentica com redirect de loopback e grava o `tools/list` real. Se falhar, o fallback é abrir o pptx gerado e importá-lo manualmente no Canva.

**Capacidades anunciadas do servidor MCP do Canva** (a confirmar com `tools/list` no início do M7; a exportação em vários formatos vem de resumos de terceiros, não da documentação oficial):

| Capacidade | Uso neste projeto |
| --- | --- |
| Geração de design a partir de texto | Base do modo `design_from_spec` |
| Upload de assets | Possível base do modo `importar_arquivo`; viabilidade a validar |
| Brand kit | Aplicar identidade visual no export; avaliar depois do M6 |
| Exportação (PDF, PNG, PPTX, MP4) | Baixar o design finalizado, se a ferramenta existir |
| Busca e edição de designs, pastas, comentários | Fora do escopo da v1 |

## 11. Segurança e privacidade

- **localOnly (RF-09):** a flag é verificada antes da geração; se `caps.remote` for verdadeiro, o run termina em `E_LOCAL_ONLY` sem enviar nada.
- **Segredos (RNF-06):** chaves só em variáveis de ambiente; o logger remove campos sensíveis; specs e runs nunca armazenam cabeçalhos de requisição.
- **Sistema de arquivos:** caminhos de entrada e saída são resolvidos e conferidos contra o diretório do projeto (sem path traversal); anexos são lidos apenas por caminho explicitamente informado. Na v0.6.0 a pasta de saída do comando `gerar` (`--out`, padrão `artifacts/<runId>`) passa por `resolveInside` (`src/fs/safe-path.ts`), que recusa `..`, caminho absoluto fora do diretório, prefixo enganoso e outra unidade com `E_CONFIG_INVALIDA`, antes de qualquer chamada ao modelo. Anexos continuam livres de confinamento, porque o usuário os nomeia. O servidor do desktop escuta em `127.0.0.1` sem autenticação nem proteção de origem/CSRF; isso é tratado no M8.
- **Dados enviados a provedores remotos:** somente esquema, amostra de até 5 linhas e o pedido; as linhas completas nunca saem da máquina (RF-11).
- **Dependências:** versões fixas em lockfile; renderers rodam sem acesso à rede.

* **Destinos remotos adicionais:** OpenRouter (LLM) e Canva (exportação) contam como remotos para fins de localOnly (RF-09, RF-14).
* **Tokens OAuth do Canva:** guardados em arquivo local com permissão restrita ao usuário, fora do banco de specs, e nunca registrados em logs (RNF-06).
* **Respostas do servidor MCP** são tratadas como dados, nunca como instruções: nada que o Canva devolve é executado ou entra em prompt sem passar pelo Validator.

## 12. Estratégia de testes e avaliação

| Camada | O que cobre | Critério |
| --- | --- | --- |
| Unitários | `calc/`, Validator, aplicação de patch | RNF-05 |
| Render (goldens) | Cada kind, a partir de specs fixas em `fixtures/` | Comparação **estrutural** (abrir o pptx, docx ou xlsx e checar slides, blocos, células e textos), não byte a byte |
| Contrato | Mesmos schemas e prompts em cada adapter | Todos os adapters produzem objetos que passam no Validator |
| Aceitação | Um cenário por requisito RF e RNF | Matriz de rastreabilidade sem lacunas |
| Eval set | ≥ 30 pedidos com expectativas verificáveis automaticamente (kind correto, número e tipo de layouts, colunas usadas, ausência de número sem origem) | Mede RNF-01 e RNF-02 por modelo |

**Registro de métricas:** cada execução do eval set grava modelo, parâmetros, taxa de spec válida na 1ª tentativa e em até 3, erros por código e tempo médio. A comparação entre modelos e provedores é feita sobre esses registros, não por impressão.

## 13. Roadmap e critérios de saída

| Marco | Escopo | Critério de saída |
| --- | --- | --- |
| M0 Fundação | Contratos LLM, adapters OllamaNative/OpenAICompat, transformação de JSON Schema, fixtures ChartSpec/Slide, contratos SourceDoc/dataset, CLI probe, smoke Bun/Deno para SQLite e conversão SVG→PNG (inicialmente `resvg-js`, trocado por `resvg-wasm` na v0.7.1, ADR-021), `specs/` e matriz de rastreabilidade | RF-08, RF-12, RNF-10, RNF-11; concluído na v0.5 (ADR-015: `node:sqlite`) |
| M1 Renderers (relatório primeiro) | Ordem: docx (preset ABNT, tabelas e figuras), chart (pronto), pptx, xlsx; `theme.ts`; specs manuais e datasets JSON congelados. O docx entra antes; pptx e xlsx podem ser entregues depois do M4 | RF-04, RF-05 (render), RNF-03, RNF-05; goldens estruturais independentes da ingestão |
| M2 Ingestão inicial | Markdown, CSV, XLSX e PDF com texto; SourceDoc, datasets, seleção lexical, limites ZIP, Worker, timeout e erros explícitos | RF-01, RF-11, RF-17, RF-18; fixtures sintéticas válidas, inválidas, PDF sem texto e ZIP excedido |
| M3 Gerador de gráfico | SpecGenerator e loop de validação para ChartSpec usando dados ingeridos | RF-03, RF-05, RF-11, RNF-04; demonstração ponta a ponta de arquivo tabular a PNG/SVG |
| M4 Relatórios e apresentações | `KindRegistry`; geração de docx primeiro, depois pptx; Router; `calc/`; etapa LONG_TEXT; seleção fixa de provedor por etapa; eval set | RF-01, RF-02, RF-03, RF-15 (seleção por etapa), RF-16; medição de RNF-01/RNF-02 somente no primário |
| M5 Versões e edição | Store, versionamento, patch, `allow_remote_fallback` persistido, fallback remoto por etapa e auditoria de runs | RF-06, RF-07, RF-10, RF-15 (fallback); invariante localOnly/fallback e máximo de 6 chamadas testados |
| M6 Endurecimento | localOnly, adapter Anthropic, logs, segurança, cobertura e documentação | RF-09, RNF-06, RNF-07, RNF-08; suíte sem integrações remotas passa |
| M7 Ingestão avançada e Canva | Ingestão DOCX; spike de acesso Canva; exportador via cliente MCP v2, OAuth, descoberta de ferramentas e modos de exportação. A ingestão de PPTX saiu para o M9; a evolução do Canva (leitura, edição, exportação) para o M10 | RF-13, RF-14, RF-17; fallback manual documentado se OAuth ou capacidade falhar |
| M8 Desktop | Deno Desktop, WebView do sistema, Hono/HTMX, SSE e Workers sobre o pipeline completo; proteção de origem/CSRF no servidor local | RF-19, RNF-09; CLI permanece funcional |
| M9 Apresentações pptx | Núcleo OOXML (leitura e escrita de ZIP, XML, modelo do pacote, verificador); ingestão de qualquer `.pptx`; edição por operações tipadas; criação a partir de `PptxSpec` e de layouts do deck do usuário; corpus de aceite | RF-17 (PPTX), RF-21, RF-22, RNF-12, RNF-13; dependências: M2 (contratos de ingestão) e, para edição por instrução em linguagem natural, M5 |
| M10 Canva avançado | Leitura de designs, edição por transação com confirmação e exportação de designs do Canva, sobre o exportador do M7 | RF-23, RF-24, RF-25; depende do spike do M7 e do app no Developer Portal |

A voz (RF-20, `SpeechProvider`, WebSpeech/Piper e comando `ler`) saiu do M8 na v0.5 e não tem marco.

A ordem "relatório primeiro" (v0.5) prioriza o docx porque é o formato mais usado no dia a dia; ela não remove nenhum marco, só antecipa o docx dentro do M1 e do M4.

O M1 é deliberadamente anterior a qualquer geração por LLM: prova que os renderers produzem saída boa a partir de specs manuais, isolando depois a qualidade do modelo como única variável.

## 14. Registro de decisões (ADR)

| ID | Decisão | Motivo | Alternativa rejeitada |
| --- | --- | --- | --- |
| ADR-001 | TypeScript sobre Bun | Domínio da stack; ecossistema maduro para pptx, docx e xlsx | Go: bibliotecas de documentos menos maduras; fica como exercício futuro para o motor de cálculo |
| ADR-002 | LLM produz spec, não arquivo nem código | Modelos locais de 7-8B falham ao gerar código ou XML de documentos; spec é validável | Geração de código do arquivo |
| ADR-003 | Pipeline fixo em vez de loop de agente livre | Em 7-8B, loops abertos se perdem em poucos passos; pipeline é testável | ReAct com tool calling livre |
| ADR-004 | ChartSpec próprio compilado para Vega-Lite | Schema pequeno e estável entre provedores; limita a superfície de erro | Modelo escrevendo Vega-Lite livre |
| ADR-005 | Vercel AI SDK como bridge de geração estruturada, com providers oficiais e adapter comunitário Ollama isolado | `generateObject` simplifica structured output e integração futura da interface gráfica; o bridge preserva localOnly, caps, configuração por etapa e erros tipados | Chamada HTTP manual como superfície principal |
| ADR-006 | SQLite com Drizzle | Uso local, zero operação, transações atômicas | Postgres |
| ADR-007 | Edição por JSON Patch com validação total | Preserva o que já está bom e gasta pouco contexto | Regenerar a spec a cada pedido |
| ADR-008 | OpenRouter atendido pelo adapter OpenAICompat, com require\_parameters ativo | Mesmo protocolo dos demais provedores compatíveis; evita código duplicado e roteia só para endpoints com saída estruturada | Adapter dedicado ao OpenRouter |
| ADR-009 | Canva como exportador opcional via cliente MCP, fora do render | Mantém o render local determinístico e offline; o design no Canva é uma cópia derivada e editável | Canva como renderer principal: perde P5 e o funcionamento offline |
| ADR-010 | Fallback remoto por etapa exige opt-in persistido no projeto | Evita envio implícito e mantém métricas do modelo primário honestas | Fallback automático global |
| ADR-011 | Texto longo é etapa explícita e dado versionado na spec | Preserva P1, P5 e RNF-04 | Gerar texto durante o render |
| ADR-012 | Ingestão inicial limitada a Markdown, CSV, XLSX e PDF com texto | Entrega valor cedo e adia os parsers DOCX/PPTX mais complexos | Ingerir todos os formatos no primeiro marco |
| ADR-013 | Núcleo runtime-neutral com Deno Desktop como casca fina | Permite CLI Bun, smoke nos dois runtimes e desktop experimental sem regra duplicada | Migrar toda a aplicação para Deno antes do M0 |
| ADR-014 | Voz somente de saída, com templates determinísticos | Evita escopo de microfone/Whisper e impede números inventados | Reconhecimento de voz na v1 |
| ADR-015 | SQLite via `node:sqlite` (detalhe em `specs/adr/ADR-015-driver-sqlite.md`) | Passou no smoke em Bun 1.4.2 e Deno 2.9.5 sem addon extra | `better-sqlite3` (addon nativo) |
| ADR-016 | Roadmap "relatório primeiro" e voz adiada | O docx é o formato de maior uso; a voz não bloqueia nenhum fluxo de relatório | Manter a ordem da v0.4 |
| ADR-017 | Parsers próprios de CSV e Markdown; UTF-8 estrito | Erros tipados, convenções pt-BR e nenhuma dependência nova; sem conversão silenciosa de codificação (P6) | Bibliotecas genéricas de CSV e Markdown |
| ADR-018 | Catálogo por run: com anexos, só os datasets deles | Evita dado de demonstração num relatório real; erro de ingestão não chama o provedor | Misturar o dataset de exemplo com os anexos |
| ADR-019 | Dados do Vega-Lite com apelidos de coluna (`x`, `y`, `s`) | Coluna `a\b` gerava gráfico vazio sem erro; textos visíveis vêm da spec | Escapar os nomes dos campos |
| ADR-020 | Docx do zero, só com os presets `abnt` e `livre` | Sem template institucional disponível; menos superfície | Preencher um template (`patchDocument`) |
| ADR-021 | PNG pelo `resvg-wasm` com a fonte DejaVu Sans embutida | O addon `resvg-js` derruba o app compilado com `deno desktop` (N-API); o wasm dá o mesmo PNG em Bun, Deno e no app compilado | Manter o `resvg-js`; usar fonte do sistema (não redistribuível e quebra P5) |

A partir da ADR-015, cada decisão também tem um arquivo próprio em `specs/adr/`.

## 15. Questões em aberto

1. **Tema visual do pptx:** definir tokens de cor e tipografia antes do M1.
2. **Preset docx:** resolvida na v0.7.0 (ADR-020): somente `abnt` e `livre`, gerados do zero; sem template institucional na v1.
3. **Idiomas:** v1 fixa `pt-BR`; avaliar `en` apenas se surgir caso real.
4. **Canva:** decidir no início do M7 entre `design_from_spec` e `importar_arquivo`, após `tools/list` e validação de OAuth.
5. **Modelos de referência:** quais modelos locais e via OpenRouter entram no eval set, além de Qwen3 8B e Qwen2.5 7B?
6. **Runtime:** resolvida na v0.5 (ADR-015): `node:sqlite`; Bun 1.4.2 e Deno 2.9.5 fixados. Revalidar ao atualizar qualquer runtime.
7. **Limites de ingestão:** calibrar 25 MB, 2.000 entradas, 200 MB descompactado e timeout após fixtures de laboratório. O CSV já usa 25 MB por arquivo como hipótese (v0.6.0); as demais metas aguardam XLSX/PDF.
8. **PptxSpec:** definir o layout para `texto_longo` no M4; o bloco entra inicialmente apenas no DocxSpec.
9. **Desktop:** versão do Deno fixada em 2.9.5. A validação de voz `pt-BR` no WebView fica com a voz (adiada).
10. **Números incidentais em texto:** a regra de `E_NUMERO_SEM_ORIGEM` rejeita qualquer número fora dos datasets referenciados, inclusive anos ("2024"), numeração de seções e datas. Decidir após a ingestão (M2), por exemplo aceitando números presentes nas fontes de texto (`SourceDoc`) ou uma lista explícita de números permitidos na spec. Na v0.6.0 os números em prosa de um Markdown não contam como conhecidos (só as tabelas viram datasets); decidir na Task 11 se as unidades de texto passam a valer como origem.
11. **Pacote pptx (M9):** como ler e gravar o OOXML: código próprio sobre `src/fs/zip.ts`, `jszip` com `fast-xml-parser`, ou `pptx-automizer`. Recomendação do backlog: bibliotecas pequenas para ZIP e XML e o modelo de pacote próprio; decidir por ADR depois do smoke em Bun e Deno.
12. **Criação de pptx do zero (M9):** `pptxgenjs` (prevista na seção 10) ou o núcleo OOXML próprio.
13. **Corpus de aceite (M9):** quais decks definem "qualquer .pptx" para o RNF-12 e o RNF-13; mínimo de 10, de origens variadas (PowerPoint, Google Slides, Canva, LibreOffice), com e sem notas, tabelas, gráficos, imagens e SmartArt.
14. **Formatos fora do escopo:** `.ppt` binário, Keynote e `.pptm` (macro): mensagem pedindo para exportar como `.pptx`; confirmar.
15. **Canva e arquivo local (M7/M10):** `import-design-from-url` exige URL HTTPS pública, o que conflita com o local-first (P7). Verificar no spike se `create-upload-url` aceita arquivo local; senão, decidir entre URL temporária confirmada pelo usuário ou procedimento manual.
16. **Plano do Canva:** `autofill-design`, modelos de marca e `resize-design` exigem plano Pro ou superior; confirmar o plano antes de prometer esses recursos.
17. **Verificação visual de pptx e docx:** sem PowerPoint ou LibreOffice no ambiente, só a estrutura é testável; decidir se o LibreOffice entra como ferramenta de conferência manual (fora do `check`).

## 16. Fontes

Consultadas por busca em 08/10/2026; reler as páginas originais antes de implementar o M0 e o M6, pois ambas as integrações mudam com frequência.

- [Canva Model Context Protocol (MCP)](https://canva.dev/docs/mcp/): servidor remoto, geração de design a partir de texto, acesso por OAuth
- [Canva MCP: Access and permissions](https://www.canva.dev/docs/apps/mcp/access/) (lida em 09/10/2026): Developer Portal com client ID/secret, CIMD com lista de espera, DCR descontinuado
- [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/clients/oauth.html) (lida em 09/10/2026): `@modelcontextprotocol/client` e OAuth no cliente
- [OpenRouter: Structured Outputs](https://openrouter.ai/docs/features/structured-outputs): `response_format`, `require_parameters`, variação de conformidade por provedor

- [Deno Desktop](https://docs.deno.com/runtime/reference/cli/desktop/): WebView, bindings e status experimental
- [Ollama API](https://docs.ollama.com/api): endpoint nativo, `format`, `num_ctx` e metadados de conclusão
- [Deno Node compatibility](https://docs.deno.com/runtime/fundamentals/node/): compatibilidade `node:` e pacotes npm
- [Vercel AI SDK](https://ai-sdk.dev/docs): `generateObject` e structured output
- [AI SDK OpenAI-compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers): `createOpenAICompatible` e `supportsStructuredOutputs`
- [Ollama AI SDK provider v2](https://www.npmjs.com/package/ollama-ai-provider-v2): provider comunitário usado para preservar endpoint nativo, `num_ctx` e `think=false`
