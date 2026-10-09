import { TypeCompiler } from '@sinclair/typebox/compiler'
import { configFromEnv } from './llm/config.ts'
import { OllamaNative } from './llm/ollama.ts'
import { OpenAICompat } from './llm/openai-compat.ts'
import { ChartSpec, chartProbeExample } from './specs/schemas.ts'

const validator = TypeCompiler.Compile(ChartSpec)

function providerFromEnv() {
  const config = configFromEnv()
  return config.provider === 'openai-compat' ? new OpenAICompat(config) : new OllamaNative(config)
}

async function main() {
  const [command, flag, schemaName] = process.argv.slice(2)
  if (command !== 'probe' || flag !== '--schema' || schemaName !== 'chart') {
    console.error('Uso: bun run src/cli.ts probe --schema chart')
    process.exitCode = 2
    return
  }

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

void main().catch((error: unknown) => {
  const output = error instanceof Error && 'code' in error ? { code: (error as { code: string }).code, message: error.message } : { code: 'E_PROVIDER', message: String(error) }
  console.error(JSON.stringify(output))
  process.exitCode = 1
})

void chartProbeExample
