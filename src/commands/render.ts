import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { validateDocx } from '../agent/validate-docx.ts'
import { DatasetCatalog, SAMPLE_DATASETS } from '../data/catalog.ts'
import { resolveInside } from '../fs/safe-path.ts'
import { ingestAll } from '../ingest/index.ts'
import { LLMError } from '../llm/contracts.ts'
import { renderDocx } from '../render/docx.ts'
import { typedFailure, usageError, type CommandResult } from './result.ts'

export interface RenderDeps {
  cwd: string
  readFile: (path: string) => Uint8Array
  writeFile: (path: string, data: Uint8Array) => void
  mkdir: (path: string) => void
}

const USAGE = 'Uso: bun run src/cli.ts render <spec.json> [--anexo arquivo.csv]... [--out pasta]'

const defaultDeps = (): RenderDeps => ({
  cwd: process.cwd(),
  readFile: (path) => new Uint8Array(readFileSync(path)),
  writeFile: (path, data) => writeFileSync(path, data),
  mkdir: (path) => { mkdirSync(path, { recursive: true }) }
})

interface Parsed { spec: string; anexos: string[]; out?: string }

function parseArgs(argv: string[]): Parsed | string {
  const parsed: Parsed = { spec: '', anexos: [] }
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--anexo' || arg === '--out') {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) return `A opção ${arg} precisa de um valor. ${USAGE}`
      if (arg === '--anexo') parsed.anexos.push(value)
      else parsed.out = value
    } else if (arg.startsWith('--')) {
      return `Opção desconhecida: ${arg}. ${USAGE}`
    } else positional.push(arg)
  }
  if (positional.length !== 1) return `Informe exatamente um arquivo de spec. ${USAGE}`
  parsed.spec = positional[0]
  return parsed
}

/**
 * `render`: lê uma DocxSpec, valida (schema e semântica) contra o catálogo e grava o .docx.
 * Com `--anexo`, os datasets são só os dos anexos (como no Orchestrator); sem anexo, o de exemplo.
 * A pasta de saída (`--out`, padrão `artifacts/<hash12>`) é confinada ao diretório de trabalho e
 * conferida antes de renderizar.
 */
export async function renderCommand(argv: string[], overrides: Partial<RenderDeps> = {}): Promise<CommandResult> {
  const deps = { ...defaultDeps(), ...overrides }
  const parsed = parseArgs(argv)
  if (typeof parsed === 'string') return usageError(parsed)

  let text: string
  try {
    text = new TextDecoder().decode(deps.readFile(parsed.spec))
  } catch (error: unknown) {
    return usageError(`Não foi possível ler "${parsed.spec}": ${error instanceof Error ? error.message : String(error)}`)
  }
  const attachments = []
  for (const path of parsed.anexos) {
    try {
      attachments.push({ name: path, bytes: deps.readFile(path), path })
    } catch (error: unknown) {
      return usageError(`Não foi possível ler o anexo "${path}": ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  try {
    const explicitOut = parsed.out === undefined ? undefined : resolveInside(deps.cwd, parsed.out)

    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      throw new LLMError('E_SPEC_PARSE', `O arquivo "${parsed.spec}" não contém JSON válido.`)
    }

    let catalog = new DatasetCatalog(SAMPLE_DATASETS)
    if (attachments.length) {
      const datasets = ingestAll(attachments).flatMap((source) => source.datasets)
      if (datasets.length === 0) throw new LLMError('E_INGEST_INVALIDO', 'Os anexos não têm dados tabulares (CSV ou tabela em Markdown).')
      catalog = new DatasetCatalog(datasets)
    }

    const { spec, datasets } = validateDocx(value, catalog)
    let bytes: Uint8Array | undefined
    const artifact = await renderDocx(spec, { outputDir: 'memoria', datasets, writeFile: (_path, data) => { bytes = data } })
    if (!bytes) throw new LLMError('E_RENDER', 'O renderer não produziu arquivo.')

    const dir = explicitOut ?? resolveInside(deps.cwd, join('artifacts', artifact.hash.slice(0, 12)))
    const file = join(dir, basename(artifact.path))
    try {
      deps.mkdir(dir)
      deps.writeFile(file, bytes)
    } catch (error: unknown) {
      throw new LLMError('E_RENDER', `Não foi possível gravar o documento: ${error instanceof Error ? error.message : String(error)}`)
    }
    return { exitCode: 0, output: JSON.stringify({ ok: true, arquivo: file, hash: artifact.hash, rendererVersion: artifact.rendererVersion, blocos: spec.blocos.length }, null, 2) }
  } catch (error: unknown) {
    if (error instanceof LLMError) return typedFailure(error)
    throw error
  }
}
