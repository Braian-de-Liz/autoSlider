# autoSlider

Assistente de escritório pessoal e **local-first** para produzir relatórios. Você entrega dados (CSV, Markdown) e um pedido em linguagem natural; o modelo de linguagem não escreve arquivos: ele produz uma **spec** tipada, o código a **valida**, e renderizadores determinísticos geram o arquivo (princípios P1 e P2 da [especificação](specs/SPEC.md)).

Projeto de uso pessoal, em desenvolvimento. A especificação em `specs/SPEC.md` é a fonte da verdade; este README descreve o que **existe hoje**.

## Estado atual

| Funciona hoje | Ainda não existe |
|---|---|
| Gráfico em PNG e SVG a partir de CSV ou Markdown, pela CLI (`gerar`) e pelo desktop | Geração do relatório docx pelo modelo (a spec ainda é escrita à mão) |
| Relatório `.docx` com texto, tabelas e gráficos, em ABNT ou livre, a partir de uma spec (`render`) | Ingestão de XLSX, PDF, DOCX e PPTX |
| Validação de especificações de gráfico e de documento docx (`validar`) | Apresentações (pptx) e planilhas (xlsx) |
| Ingestão de CSV e Markdown e busca lexical nos textos (`ingerir`, `buscar`) | Versões, edição por patch e banco de dados (os runs ficam só em memória) |
| Ollama local e provedor compatível com OpenAI (OpenRouter), por configuração | Exportação para o Canva e voz (a voz está adiada) |
| Suíte de testes nos dois runtimes (Bun e Deno) e matriz de rastreabilidade | |

O renderer de docx tem a estrutura conferida por testes, mas o resultado **ainda não foi aberto no Word**: confira o visual de um arquivo gerado. O pipeline que faz o modelo escrever o relatório é a Task 11 do plano; veja o [CHANGELOG](CHANGELOG.md) para o ponto exato.

**Para onde o projeto vai:** trabalhar com qualquer apresentação `.pptx` (ler, editar e criar) e gerar apresentações no Canva pelo MCP. O que falta, em ordem, com riscos e decisões em aberto, está em [`specs/BACKLOG.md`](specs/BACKLOG.md).

## Requisitos

- **Bun** 1.4.2.
- **Deno** 2.9.5, só para o desktop e para rodar a suíte também no Deno.
- **Ollama** com um modelo baixado. Testado: `qwen2.5:7b`. O padrão do projeto é `qwen3:8b` (`ollama pull qwen3:8b`).
- Windows é o ambiente em que tudo foi testado. O WebView do desktop usa o WebView2 do sistema.

## Instalação e configuração

```bash
bun install
```

Copie `.env.example` para `.env` e ajuste. **O `.env` nunca deve ser commitado** (já está no `.gitignore`).

Ollama local (padrão):

```
LLM_PROVIDER=ollama-native
LLM_BASE_URL=http://127.0.0.1:11434
LLM_MODEL=qwen2.5:7b
```

OpenRouter ou outro provedor compatível com OpenAI:

```
LLM_PROVIDER=openai-compat
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=provedor/modelo
LLM_API_KEY=sua-chave
PROJECT_LOCAL_ONLY=false
```

Pontos importantes:

- `PROJECT_LOCAL_ONLY=true` é o padrão. Com ele, um provedor remoto termina em `E_LOCAL_ONLY` e nada é enviado. Para usar o OpenRouter é preciso `PROJECT_LOCAL_ONLY=false`.
- Com provedor remoto, saem da máquina somente o pedido, o esquema das colunas e **até 5 linhas de amostra** por dataset. As linhas completas nunca vão ao modelo (RF-11).
- **O OpenRouter ainda não foi testado de verdade.** Só o Ollama local foi exercitado contra um modelo real.

## Comandos

Todos rodam por `bun run src/cli.ts <comando>`. Códigos de saída: `0` sucesso; `1` pedido rejeitado, com um código de erro tipado no JSON; `2` uso incorreto ou arquivo ilegível. O resultado é sempre um JSON (sucesso em stdout, falha em stderr).

| Comando | Para que serve |
|---|---|
| `probe --schema chart` (ou `bun run probe`) | Pede ao modelo configurado uma especificação de gráfico mínima e a valida. Serve para testar a conexão com o provedor. |
| `validar <arquivo.json>` | Valida uma spec de gráfico ou de documento (`"kind": "docx"`). Sem `kind`, é tratada como gráfico. Usa o dataset de exemplo `vendas`. |
| `ingerir <arquivo.csv\|.md>` | Mostra como um arquivo é lido: colunas, tipos, hash SHA-256 e amostra de 5 linhas. |
| `buscar "<consulta>" <arquivo...>` | Busca (BM25) nas seções dos arquivos e mostra os trechos e o bloco exato que iria ao prompt. |
| `gerar [--kind chart] [--anexo arquivo]... [--out pasta] "pedido"` | Roda o pipeline completo e grava o PNG e o SVG. A pasta padrão é `artifacts/<runId>`, que precisa ficar dentro do diretório atual. |
| `render <spec.json> [--anexo arquivo]... [--out pasta]` | Valida uma spec de documento (`"kind": "docx"`) e grava o `.docx` (texto, tabelas e gráficos). Com `--anexo`, os dados vêm só dos arquivos; sem ele, do dataset de exemplo. A pasta padrão é `artifacts/<hash>`. Blocos `texto_longo` precisam estar com `"status": "gerado"`. |

Exemplos, com os arquivos de teste do repositório:

```bash
bun run src/cli.ts ingerir specs/fixtures/ingest/vendas.csv
bun run src/cli.ts buscar "metas do trimestre" specs/fixtures/ingest/notas.md
bun run src/cli.ts validar specs/fixtures/docx/minimo.json
bun run src/cli.ts render specs/fixtures/docx/relatorio-completo.json
bun run src/cli.ts render specs/fixtures/docx/relatorio-vendas-csv.json --anexo specs/fixtures/ingest/vendas.csv
bun run src/cli.ts gerar --anexo specs/fixtures/ingest/vendas.csv "gráfico de barras com a soma do valor por produto"
```

O `render` não precisa do Ollama. O último comando (`gerar`) exige o Ollama rodando: ele imprime os estados do run (`RECEBIDO` até `ENTREGUE`), quantas tentativas o modelo precisou e os caminhos dos arquivos. Sem `--anexo`, o gráfico usa um dataset de **exemplo** embutido (`vendas`), só para demonstração.

## Formato dos CSV

- **UTF-8**. O BOM é aceito. Outras codificações (como Windows-1252 do Excel) são **recusadas**, não convertidas: salve como "CSV UTF-8".
- Delimitador `,`, `;` ou tab, detectado pela primeira linha. Com `;`, os números seguem o padrão brasileiro (`1.234,50`); com `,`, o padrão inglês (`1,234.50`).
- Datas `AAAA-MM-DD` e, com `;`, também `dd/mm/aaaa`. Valores com moeda (`R$ 10`), `%` ou notação científica permanecem como texto. Zeros à esquerda (`00123`) permanecem texto.
- A primeira linha é o cabeçalho (sem nomes vazios nem repetidos). Linhas com número de colunas diferente do cabeçalho são recusadas, não preenchidas.
- Limite de 25 MB por arquivo.
- Em Markdown, cada seção (`#`, `##`...) vira uma unidade de texto e cada tabela com linhas vira um dataset.

## Códigos de erro

| Código | O que significa | O que fazer |
|---|---|---|
| `E_SPEC_SCHEMA` | A saída do modelo (ou o JSON que você passou) não segue o formato esperado | Veja o caminho indicado no erro; o pipeline já tenta de novo até 2 vezes |
| `E_SPEC_SEMANTICA` | Formato correto, mas com referência inválida. Subcódigos: `E_REF` (dataset ou gráfico inexistente), `E_CAMPO` (coluna inexistente ou tipo incompatível), `E_NUMERO_SEM_ORIGEM` (número no texto que não vem dos dados) | Confira os nomes de dataset e coluna com `ingerir` |
| `E_PROVIDER` | Falha do provedor de modelo: rede, chave, modelo inexistente, tempo esgotado ou saída truncada | Confira o `.env`, se o Ollama está rodando e se o modelo foi baixado |
| `E_LOCAL_ONLY` | Projeto em modo local com provedor remoto configurado | Use o Ollama, ou `PROJECT_LOCAL_ONLY=false` se aceitar enviar a amostra |
| `E_RENDER` | Falha ao gerar o arquivo | Veja a mensagem; nenhum arquivo parcial é entregue |
| `E_ROTA` | Formato de saída ainda não suportado (hoje só `chart`) | Use `--kind chart` |
| `E_INGEST_INVALIDO` | Anexo ilegível, vazio, malformado, fora de UTF-8, de formato não suportado ou sem dados tabulares | Corrija o arquivo; a mensagem cita a linha ou o motivo |
| `E_INGEST_LIMITE` | Anexo maior que 25 MB | Reduza o arquivo |
| `E_CONFIG_INVALIDA` | Configuração ou caminho inválido, como `--out` fora do diretório de trabalho | Use um caminho dentro do projeto |

## Desktop

Uma janela local com formulário (pedido, formato, anexos), timeline do run em tempo real e download do gráfico. Detalhes e comandos em [DESKTOP.md](DESKTOP.md). **O servidor local não tem autenticação nem proteção de origem**: ele escuta só em `127.0.0.1`, mas não o exponha na rede. Isso será tratado no marco M8.

## Testes e qualidade

```bash
bun run check        # typecheck + testes no Bun e no Deno + matriz de rastreabilidade
bun test             # só a suíte no Bun
bun run test:deno    # só a suíte no Deno
bun run trace        # regenera specs/TRACE.md; falha se houver requisito sem teste
bun run fixtures     # regenera as fixtures em specs/fixtures/ingest/
```

Testes contra o modelo real são opt-in e não rodam no `check`. No PowerShell:

```powershell
$env:M0_CONTRACT='1'; bun test tests/m0-llm.test.ts
```

## Estrutura

```
src/
  agent/      orquestrador, validadores de gráfico e de documento
  commands/   comandos da CLI
  data/       catálogo de datasets
  desktop/    servidor Hono, HTMX e SSE (a casca do desktop)
  fs/         caminhos confinados ao projeto
  ingest/     leitura de CSV e Markdown, busca lexical
  llm/        provedores (Ollama, OpenAI-compatível) e contratos
  render/     renderers de gráfico (Vega-Lite e resvg) e de docx, e o tema (theme.ts)
  specs/      schemas TypeBox
specs/        SPEC.md (fonte da verdade), TRACE.md, adr/, fixtures/, archive/
tests/        testes de aceitação (cada bloco cita o requisito RF/RNF)
scripts/      trace.ts e make-fixtures.ts
```

O projeto segue o método **spec-driven**: a spec manda, os testes de aceitação carregam o ID do requisito, e o código vem depois. O `specs/TRACE.md` cruza requisitos e testes, e `bun run check` falha se houver lacuna. Decisões estruturais ficam em `specs/adr/`, mudanças no `CHANGELOG.md` e os documentos da v0.4, já superados, em `specs/archive/`.

## Limitações conhecidas

- Os tipos das colunas são apenas **inferidos**; não há confirmação pelo usuário.
- Em tabelas do docx os números saem sem os zeros finais (`3013.80` vira `3.013,8`), e as legendas são texto simples (sem campo `SEQ` do Word nem lista de tabelas e figuras).
- O visual do `.docx` não foi conferido no Word.
- Em textos de documento, números que não estão nos datasets (inclusive anos e numeração de seções) são rejeitados.
- Números em prosa de um Markdown não contam como origem; só as tabelas viram datasets.
- XLSX, PDF, DOCX e PPTX ainda não podem ser anexados.
- O OpenRouter não foi testado contra o serviço real.
- O `generateObject` do pacote `ai@7` está depreciado e emite um aviso a cada execução; ainda funciona.
- Os runs e artefatos ficam só em memória no desktop; fechar o programa os perde.
- O desktop não tem autenticação; o nome exibido na interface ainda é "Gerador de Artefatos".
