import { TypeCompiler } from '@sinclair/typebox/compiler'
import { buscarCommand } from './commands/buscar.ts'
import { gerarCommand } from './commands/gerar.ts'
import { renderCommand } from './commands/render.ts'
import { ingerirCommand } from './commands/ingerir.ts'
import { usageError, type CommandResult } from './commands/result.ts'
import { validarCommand } from './commands/validar.ts'
import { configFromEnv } from './llm/config.ts'
import { OllamaNative } from './llm/ollama.ts'
import { OpenAICompat } from './llm/openai-compat.ts'
import { ChartSpec, chartProbeExample } from './specs/schemas.ts'

const validator = TypeCompiler.Compile(ChartSpec)

const USAGE = [
  'Uso:',
  '  bun run src/cli.ts probe --schema chart',
  '  bun run src/cli.ts validar <arquivo.json>',
  '  bun run src/cli.ts ingerir <arquivo.csv|arquivo.md>',
  '  bun run src/cli.ts buscar "<consulta>" <arquivo...>',
  '  bun run src/cli.ts gerar [--kind chart] [--anexo arquivo.csv]... [--out pasta] "pedido"',
  '  bun run src/cli.ts render <spec.json> [--anexo arquivo.csv]... [--out pasta]'
].join('\n')

function providerFromEnv() {
  const config = configFromEnv()
  return config.provider === 'openai-compat' ? new OpenAICompat(config) : new OllamaNative(config)
}

/** Sucesso em stdout, falha em stderr; o exit code vem do comando. */
function emit(result: CommandResult): void {
  ;(result.exitCode === 0 ? console.log : console.error)(result.output)
  process.exitCode = result.exitCode
}

async function probe(): Promise<void> {
  const result = await providerFromEnv().generate({
    system: 'Responda somente um objeto JSON que satisfaça o schema fornecido.',
    messages: [{ role: 'user', content: 'Crie um ChartSpec mínimo para um gráfico de vendas por categoria.' }],
    schema: ChartSpec,
    temperature: 0
  })
  if (!validator.Check(result.value)) {
    console.error(JSON.stringify({ code: 'E_SPEC_SCHEMA', errors: [...validator.Errors(result.value)] }))
    process.exitCode = 1
    return
  }
  console.log(JSON.stringify({ value: result.value, usage: result.usage }, null, 2))
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'probe' && args[0] === '--schema' && args[1] === 'chart') return await probe()
  if (command === 'validar') return emit(args[0] ? validarCommand(args[0]) : usageError('Uso: bun run src/cli.ts validar <arquivo.json>'))
  if (command === 'ingerir') return emit(args[0] ? ingerirCommand(args[0]) : usageError('Uso: bun run src/cli.ts ingerir <arquivo.csv|arquivo.md>'))
  if (command === 'buscar') return emit(buscarCommand(args[0], args.slice(1)))
  if (command === 'gerar') return emit(await gerarCommand(args))
  if (command === 'render') return emit(await renderCommand(args))
  console.error(USAGE)
  process.exitCode = 2
}

void main().catch((error: unknown) => {
  const output = error instanceof Error && 'code' in error ? { code: (error as { code: string }).code, message: error.message } : { code: 'E_PROVIDER', message: String(error) }
  console.error(JSON.stringify(output))
  process.exitCode = 1
})

void chartProbeExample
