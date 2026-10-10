# Agente Gerador de Artefatos — Especificação Técnica

Versão 0.4 · 08/10/2026 · Autor: Braian de Liz · Metodologia: spec-driven · Status: roadmap reordenado; pronto para iniciar o marco M0

## 1. Resumo e escopo

Sistema pessoal, local-first, que recebe informações (texto, CSV, XLSX) e gera artefatos: apresentações (.pptx), documentos (.docx), planilhas (.xlsx) e gráficos (.png/.svg). O LLM (Ollama por padrão; qualquer outro provedor via chave de API) **não produz arquivos**: produz uma **spec** tipada e validada, e renderizadores determinísticos convertem a spec em arquivo.

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

Cada teste de aceitação carrega o ID no nome (`RF-04: renderiza pptx válido a partir de spec mínima`). Um script gera `specs/TRACE.md` com a matriz requisito → teste → módulo e **falha o CI** se houver requisito sem teste ou teste sem requisito.

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
  agent/             # route.ts, generate.ts, validate.ts, patch.ts
  render/            # pptx.ts, docx.ts, xlsx.ts, chart.ts, theme.ts
  calc/              # funções puras de cálculo e agregação
  store/             # Drizzle + SqliteDriver runtime-neutral
  cli.ts
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
| RF-20 | Falar confirmações de evento e blocos `texto_longo` por `SpeechProvider`, usando templates determinísticos e sem reconhecimento de voz na v1 |

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

O desktop chama o mesmo Orchestrator da CLI e não contém regra de negócio. A versão do Deno é fixada. Compatibilidade de SQLite e addons nativos, especialmente `resvg-js`, deve passar pelo smoke test dos dois runtimes no M0 e ser revalidada antes do M8.


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
  Type.Object({ tipo: Type.Literal('quebra_pagina') })
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

### 6.5 Datasets

Um dataset registra: `id`, `nome`, `origem` (caminho e hash SHA-256 do arquivo), `colunas` (nome, tipo inferido e confirmado) e `linhas` (armazenadas fora do prompt). O LLM recebe apenas `id`, `colunas` e uma amostra de até 5 linhas.

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

A geração da spec local pode produzir o bloco `pendente`; `LONG_TEXT` só é executada quando ele existe. O texto gerado é persistido na spec, antes do render, e usa somente números de datasets e resultados de `calc/`. O Validator aplica `E_NUMERO_SEM_ORIGEM` ao texto. O bloco entra inicialmente no `DocxSpec`; layout equivalente no `PptxSpec` fica para o M4.

### 6.9 SourceDoc e ingestão

A ingestão converte Markdown, CSV, XLSX, PDF, DOCX e PPTX em `SourceDoc`, com unidades de texto rastreáveis (`arquivo`, `tipo`, `indice`, `texto`) e datasets tabulares associados. CSV deve constar explicitamente no catálogo de entrada do RF-01. Na primeira fase de ingestão (M2), entram Markdown, CSV, XLSX e PDF com camada de texto; DOCX e PPTX entram no M7.

PDF sem camada de texto termina em `E_INGEST_SEM_TEXTO`; OCR permanece fora do escopo. O Ingestor nunca envia o arquivo inteiro ao prompt: monta estrutura, esquema dos datasets e trechos selecionados por busca lexical; embeddings ficam para depois. ZIPs (XLSX, DOCX e PPTX) têm limites iniciais de 25 MB compactados, 2.000 entradas e 200 MB descompactados; macros são rejeitadas e a extração roda em Worker com timeout. Os limites são hipóteses calibráveis.

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
| Anthropic | API nativa da Anthropic, a integrar depois | Tool com `input_schema` igual ao schema e `tool_choice` forçado |

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

### 7.3 Voz

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
| docx | `docx` | Preset `abnt`: fonte 12, espaçamento 1,5, margens 3 cm (superior e esquerda) e 2 cm (inferior e direita), legendas de tabela e figura numeradas |
| xlsx | `exceljs` | Tipos de coluna e formatos numéricos vindos da spec; sem fórmulas geradas pelo modelo |
| chart | Vega-Lite compilado → SVG → PNG com `@resvg/resvg-js` | Sem navegador headless; plano B: `@resvg/resvg-wasm` caso o addon nativo falhe no Bun |

O tema (fontes, cores, margens, tamanhos) é um único arquivo de tokens, compartilhado pelos renderers, para manter a identidade visual consistente entre formatos.

### 10.1 Exportação opcional: Canva via MCP

O Canva oferece um servidor MCP remoto (`https://mcp.canva.com/mcp`) com login por OAuth, sem chave de API. O sistema atua como **cliente MCP**. A integração é um **exportador** que roda depois da entrega, não um renderer: o render local (pptx, chart) continua sendo o caminho principal e funciona sem rede (P5). Esta seção cobre RF-13 e RF-14.

- **Posição no fluxo:** a partir de `ENTREGUE`, estado opcional `EXPORTANDO` seguido de `EXPORTADA` ou `EXPORT_FALHOU`. Falha de exportação nunca invalida o run nem a versão.
- **Cliente:** SDK oficial de MCP para TypeScript (`@modelcontextprotocol/sdk`) com transporte HTTP. Se o transporte remoto não funcionar no Bun, alternativa documentada pelo Canva: processo `mcp-remote` via stdio.
- **Descoberta de ferramentas:** as ferramentas são listadas em tempo de execução (`tools/list`); a spec não depende de nomes fixos. Um mapeamento em `export/canva.ts` associa cada capacidade necessária (criar design, enviar conteúdo, exportar) à ferramenta encontrada. Capacidade ausente gera `E_EXPORT` com a lista das ferramentas disponíveis.
- **Modo `design_from_spec`:** converte a spec em um pedido estruturado (título e texto de cada slide, dados referenciados) para as ferramentas de geração de design do Canva. O resultado é um design editável no Canva, mas o layout passa a ser decidido pelo Canva, não pelo renderer local.
- **Modo `importar_arquivo`:** envia o arquivo já renderizado. A viabilidade depende das ferramentas que o servidor expõe e deve ser validada no início do M7.
- **Fonte da verdade:** o design no Canva é uma cópia derivada (P1). Edições feitas no Canva não voltam para a spec; o run grava a URL do design e as ferramentas chamadas (RNF-07).
- **Privacidade:** o texto e os dados dos slides saem da máquina. O envio é bloqueado em projeto localOnly e, nos demais, exige confirmação por execução mostrando o que será enviado (RF-14).
- **Risco de acesso:** a documentação do Canva indica que equipes que constroem assistentes ou conectores próprios passam por um processo de solicitação. Validar no início do M7 se um cliente próprio, para uso pessoal, consegue autenticar. Se não, o fallback é abrir o pptx gerado e importá-lo manualmente no Canva.

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
- **Sistema de arquivos:** caminhos de entrada e saída são resolvidos e conferidos contra o diretório do projeto (sem path traversal); anexos são lidos apenas por caminho explicitamente informado.
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
| M0 Fundação | Contratos LLM, adapters OllamaNative/OpenAICompat, transformação de JSON Schema, fixtures ChartSpec/Slide, contratos SourceDoc/dataset, CLI probe e smoke test Bun/Deno para SQLite e resvg-js | RF-08, RF-12, smoke nos dois runtimes, contrato verde nos adapters; Qwen3 8B com raciocínio desligado é padrão provisório |
| M1 Renderers | chart, pptx, docx e xlsx a partir de specs manuais e datasets JSON congelados | RF-04, RF-05 (render), RNF-03, RNF-05; goldens estruturais independentes da ingestão |
| M2 Ingestão inicial | Markdown, CSV, XLSX e PDF com texto; SourceDoc, datasets, seleção lexical, limites ZIP, Worker, timeout e erros explícitos | RF-01, RF-11, RF-17, RF-18; fixtures válidas, inválidas, PDF sem texto e ZIP excedido |
| M3 Gerador de gráfico | SpecGenerator e loop de validação para ChartSpec usando dados ingeridos | RF-03, RF-05, RF-11, RNF-04; demonstração ponta a ponta de arquivo tabular a PNG/SVG |
| M4 Documentos e apresentações | Geração para pptx/docx, Router, etapa LONG_TEXT, política híbrida por etapa e eval set | RF-01, RF-02, RF-03, RF-15, RF-16; medição de RNF-01/RNF-02 somente no primário |
| M5 Versões e edição | Store, versionamento, patch, `allow_remote_fallback` persistido e auditoria de runs | RF-06, RF-07, RF-10; invariante localOnly/fallback e máximo de 6 chamadas testados |
| M6 Endurecimento | localOnly, adapter Anthropic, logs, xlsx gerado, segurança, cobertura e documentação | RF-09, RNF-06, RNF-07; suíte sem integrações remotas passa |
| M7 Ingestão avançada e Canva | Ingestão DOCX/PPTX; exportador Canva via cliente MCP, OAuth, descoberta de ferramentas e modos de exportação | RF-13, RF-14, RF-17; fallback manual documentado se OAuth ou capacidade falhar |
| M8 Desktop e voz | Deno Desktop, WebView do sistema, Hono/HTMX, SSE, Workers, WebSpeech/Piper e comando `ler` | RF-19, RF-20, RNF-09; CLI permanece funcional e confirmação usa templates determinísticos |

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

## 15. Questões em aberto

1. **Tema visual do pptx:** definir tokens de cor e tipografia antes do M1.
2. **Preset docx:** além de ABNT, existe modelo institucional a ser suportado como template em vez de geração do zero?
3. **Idiomas:** v1 fixa `pt-BR`; avaliar `en` apenas se surgir caso real.
4. **Canva:** decidir no início do M7 entre `design_from_spec` e `importar_arquivo`, após `tools/list` e validação de OAuth.
5. **Modelos de referência:** quais modelos locais e via OpenRouter entram no eval set, além de Qwen3 8B e Qwen2.5 7B?
6. **Runtime:** o smoke test escolherá `node:sqlite` ou `better-sqlite3`; confirmar suporte final no Deno antes do M5.
7. **Limites de ingestão:** calibrar 25 MB, 2.000 entradas, 200 MB descompactado e timeout após fixtures de laboratório.
8. **PptxSpec:** definir o layout para `texto_longo` no M4; o bloco entra inicialmente apenas no DocxSpec.
9. **Desktop:** fixar a versão do Deno e validar se WebSpeech oferece voz `pt-BR` no WebView do ambiente alvo.

## 16. Fontes

Consultadas por busca em 08/10/2026; reler as páginas originais antes de implementar o M0 e o M6, pois ambas as integrações mudam com frequência.

- [Canva Model Context Protocol (MCP)](https://canva.dev/docs/mcp/): servidor remoto, geração de design a partir de texto, acesso por OAuth
- [OpenRouter: Structured Outputs](https://openrouter.ai/docs/features/structured-outputs): `response_format`, `require_parameters`, variação de conformidade por provedor

- [Deno Desktop](https://docs.deno.com/runtime/reference/cli/desktop/): WebView, bindings e status experimental
- [Ollama API](https://docs.ollama.com/api): endpoint nativo, `format`, `num_ctx` e metadados de conclusão
- [Deno Node compatibility](https://docs.deno.com/runtime/fundamentals/node/): compatibilidade `node:` e pacotes npm
- [Vercel AI SDK](https://ai-sdk.dev/docs): `generateObject` e structured output
- [AI SDK OpenAI-compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers): `createOpenAICompatible` e `supportsStructuredOutputs`
- [Ollama AI SDK provider v2](https://www.npmjs.com/package/ollama-ai-provider-v2): provider comunitário usado para preservar endpoint nativo, `num_ctx` e `think=false`
