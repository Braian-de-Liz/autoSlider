import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DECK_REQUESTS, providerWasUnreachable, renderDeckReport, runDeckProbe, summarizeDeckReport, type DeckProbeReport, type DeckProbeRequest, type DeckSource } from '../agent/probe-deck.ts'
import { DatasetCatalog, SAMPLE_DATASETS } from '../data/catalog.ts'
import { resolveInside } from '../fs/safe-path.ts'
import { ingestAll } from '../ingest/index.ts'
import { AISDKProvider } from '../llm/ai-sdk.ts'
import { configFromEnv } from '../llm/config.ts'
import { LLMError, type LLMProvider } from '../llm/contracts.ts'
import { typedFailure, usageError, type CommandResult } from './result.ts'

export interface ProbeDeckDeps {
  provider: LLMProvider
  label: { provider: string; model: string }
  localOnly: boolean
  cwd: string
  readFile: (path: string) => Uint8Array
  writeFile: (path: string, data: string) => void
  mkdir: (path: string) => void
  now: () => Date
}

const USAGE = 'Uso: bun run src/cli.ts probe --schema deck [--out pasta] [--only D01,D02]'

function defaultDeps(): ProbeDeckDeps {
  const config = configFromEnv()
  return {
    provider: new AISDKProvider(config),
    label: { provider: config.provider, model: config.model },
    localOnly: process.env.PROJECT_LOCAL_ONLY !== 'false',
    cwd: process.cwd(),
    readFile: (path) => new Uint8Array(readFileSync(path)),
    writeFile: (path, data) => writeFileSync(path, data, 'utf8'),
    mkdir: (path) => { mkdirSync(path, { recursive: true }) },
    now: () => new Date()
  }
}

interface Parsed { out?: string; only?: string[] }

function parseArgs(argv: string[]): Parsed | string {
  const parsed: Parsed = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg !== '--out' && arg !== '--only') return `Argumento inesperado: ${arg}. ${USAGE}`
    const value = argv[++i]
    if (value === undefined || value.startsWith('--')) return `A opção ${arg} precisa de um valor. ${USAGE}`
    if (arg === '--out') parsed.out = value
    else parsed.only = value.split(',').map((id) => id.trim().toUpperCase()).filter(Boolean)
  }
  return parsed
}

/** Catálogo de cada pedido: o dataset de exemplo, um fixture ingerido (só dados do repositório) ou vazio. */
function catalogLoader(deps: ProbeDeckDeps): (source: DeckSource) => DatasetCatalog {
  const cache = new Map<DeckSource, DatasetCatalog>()
  return (source) => {
    const cached = cache.get(source)
    if (cached) return cached
    let catalog: DatasetCatalog
    if (source === 'nenhuma') catalog = new DatasetCatalog([])
    else if (source === 'exemplo:vendas') catalog = new DatasetCatalog(SAMPLE_DATASETS)
    else {
      const path = resolveInside(deps.cwd, source)
      const sources = ingestAll([{ name: source, bytes: deps.readFile(path), path: source }])
      catalog = new DatasetCatalog(sources.flatMap((item) => item.datasets))
    }
    cache.set(source, catalog)
    return catalog
  }
}

/**
 * `probe --schema deck`: roda os pedidos da sonda contra o modelo configurado e grava, em `--out`
 * (padrão `artifacts/probe-deck/<data>`), o JSON completo e um Markdown para leitura. Não renderiza pptx.
 */
export async function probeDeckCommand(argv: string[], overrides: Partial<ProbeDeckDeps> = {}): Promise<CommandResult> {
  const parsed = parseArgs(argv)
  if (typeof parsed === 'string') return usageError(parsed)
  const deps = { ...defaultDeps(), ...overrides }

  let requests: readonly DeckProbeRequest[] = DECK_REQUESTS
  if (parsed.only) {
    const unknown = parsed.only.filter((id) => !DECK_REQUESTS.some((request) => request.id === id))
    if (unknown.length > 0) return usageError(`Pedido(s) desconhecido(s): ${unknown.join(', ')}. Disponíveis: ${DECK_REQUESTS.map((request) => request.id).join(', ')}.`)
    requests = DECK_REQUESTS.filter((request) => parsed.only!.includes(request.id))
  }

  // RF-09: verificado antes de qualquer chamada ao provedor.
  if (deps.localOnly && deps.provider.caps.remote) {
    return typedFailure(new LLMError('E_LOCAL_ONLY', 'Projeto localOnly com provedor remoto configurado. Nada foi enviado.'))
  }

  let outDir: string
  try {
    outDir = resolveInside(deps.cwd, parsed.out ?? join('artifacts', 'probe-deck', deps.now().toISOString().replace(/[:.]/g, '-')))
  } catch (error: unknown) {
    if (error instanceof LLMError) return typedFailure(error)
    throw error
  }

  let report: DeckProbeReport
  try {
    report = await runDeckProbe(deps.provider, deps.label, requests, {
      catalogFor: catalogLoader(deps),
      onProgress: (result) => console.error(`[probe deck] ${result.id} ${result.ok ? 'ok' : 'falhou'} (${result.attempts} tentativa(s), ${(result.durationMs / 1000).toFixed(1)} s)`)
    })
  } catch (error: unknown) {
    // Fixture ilegível ou ingestão inválida: erro de uso, antes de contar como falha do modelo.
    if (error instanceof LLMError) return typedFailure(error)
    return usageError(`Não foi possível preparar os dados da sonda: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Sem nenhuma resposta do modelo não há o que medir: falha em vez de um relatório vazio com exit 0.
  if (providerWasUnreachable(report)) {
    const first = report.results[0].error!
    return typedFailure(new LLMError('E_PROVIDER', `O modelo não respondeu a nenhum pedido (${report.results.length} tentados, ${report.notRun} não rodaram). ${first.message}`))
  }

  try {
    deps.mkdir(outDir)
    deps.writeFile(join(outDir, 'probe-deck.json'), JSON.stringify(report, null, 2))
    deps.writeFile(join(outDir, 'probe-deck.md'), renderDeckReport(report))
  } catch (error: unknown) {
    return typedFailure(new LLMError('E_RENDER', `Não foi possível gravar o relatório da sonda: ${error instanceof Error ? error.message : String(error)}`))
  }
  return { exitCode: 0, output: JSON.stringify({ ok: true, ...summarizeDeckReport(report), arquivos: [join(outDir, 'probe-deck.json'), join(outDir, 'probe-deck.md')] }, null, 2) }
}
