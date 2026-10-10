import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Orchestrator, type Attachment } from '../agent/orchestrator.ts'
import { RunStore, type RunEvent } from '../desktop/run-store.ts'
import { resolveInside } from '../fs/safe-path.ts'
import { LLMError } from '../llm/contracts.ts'
import { usageError, type CommandResult } from './result.ts'

export interface GerarDeps {
  createOrchestrator: (store: RunStore) => Orchestrator
  cwd: string
  readFile: (path: string) => Uint8Array
  writeFile: (path: string, data: Uint8Array) => void
  mkdir: (path: string) => void
}

const USAGE = 'Uso: bun run src/cli.ts gerar [--kind chart] [--anexo arquivo.csv]... [--out pasta] "pedido"'

const defaultDeps = (): GerarDeps => ({
  createOrchestrator: (store) => Orchestrator.fromEnv(store),
  cwd: process.cwd(),
  readFile: (path) => new Uint8Array(readFileSync(path)),
  writeFile: (path, data) => writeFileSync(path, data),
  mkdir: (path) => { mkdirSync(path, { recursive: true }) }
})

interface Parsed { kind?: string; anexos: string[]; out?: string; prompt: string }

function parseArgs(argv: string[]): Parsed | string {
  const parsed: Parsed = { anexos: [], prompt: '' }
  const words: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--kind' || arg === '--anexo' || arg === '--out') {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) return `A opção ${arg} precisa de um valor. ${USAGE}`
      if (arg === '--anexo') parsed.anexos.push(value)
      else parsed[arg === '--kind' ? 'kind' : 'out'] = value
    } else if (arg.startsWith('--')) {
      return `Opção desconhecida: ${arg}. ${USAGE}`
    } else words.push(arg)
  }
  // Palavras soltas viram um só pedido, para `gerar gráfico de barras` não perder o resto.
  parsed.prompt = words.join(' ').trim()
  return parsed.prompt ? parsed : `Falta o pedido. ${USAGE}`
}

function failure(error: LLMError): CommandResult {
  return { exitCode: 1, output: JSON.stringify({ ok: false, code: error.code, message: error.message }) }
}

/**
 * `gerar`: lê os anexos pelos caminhos informados, roda o Orchestrator e grava o PNG e o SVG em
 * `--out` (padrão `artifacts/<runId>`). A saída é confinada ao diretório de trabalho (seção 11).
 */
export async function gerarCommand(argv: string[], overrides: Partial<GerarDeps> = {}): Promise<CommandResult> {
  const deps = { ...defaultDeps(), ...overrides }
  const parsed = parseArgs(argv)
  if (typeof parsed === 'string') return usageError(parsed)

  const attachments: Attachment[] = []
  for (const path of parsed.anexos) {
    try {
      attachments.push({ name: path, bytes: deps.readFile(path), path })
    } catch (error: unknown) {
      return usageError(`Não foi possível ler o anexo "${path}": ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Valida a pasta de saída antes de gastar uma chamada ao modelo.
  let explicitOut: string | undefined
  try {
    if (parsed.out !== undefined) explicitOut = resolveInside(deps.cwd, parsed.out)
  } catch (error: unknown) {
    if (error instanceof LLMError) return failure(error)
    throw error
  }

  const store = new RunStore()
  const events: RunEvent[] = []
  const terminal = new Promise<RunEvent>((resolve) => {
    store.subscribe((event) => {
      events.push(event)
      if (event.state === 'ENTREGUE' || event.state === 'FALHOU') resolve(event)
    })
  })
  const first = deps.createOrchestrator(store).start({ prompt: parsed.prompt, kind: parsed.kind, attachments })
  const last = await terminal
  const states = events.map((event) => event.state)
  const attempts = states.filter((state) => state === 'SPEC_GERADA').length

  if (last.state === 'FALHOU') {
    return { exitCode: 1, output: JSON.stringify({ ok: false, code: last.errorCode, message: last.message, runId: first.runId, estados: states, tentativas: attempts }) }
  }

  const artifact = store.getArtifact(first.runId)
  if (!artifact) return failure(new LLMError('E_RENDER', 'O run terminou sem artefato.'))
  try {
    const outDir = explicitOut ?? resolveInside(deps.cwd, join('artifacts', first.runId))
    deps.mkdir(outDir)
    const base = `grafico-${artifact.hash.slice(0, 12)}`
    const files = [[join(outDir, `${base}.png`), artifact.png], [join(outDir, `${base}.svg`), artifact.svg]] as const
    for (const [path, data] of files) deps.writeFile(path, data)
    return { exitCode: 0, output: JSON.stringify({ ok: true, runId: first.runId, estados: states, tentativas: attempts, arquivos: files.map(([path]) => path) }, null, 2) }
  } catch (error: unknown) {
    if (error instanceof LLMError) return failure(error)
    return failure(new LLMError('E_RENDER', `Não foi possível gravar o artefato: ${error instanceof Error ? error.message : String(error)}`))
  }
}
