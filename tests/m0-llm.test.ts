import { describe, expect, it } from 'bun:test'
import { TypeCompiler } from '@sinclair/typebox/compiler'
import { ChartSpec, Slide } from '../src/specs/schemas.ts'
import { toProviderSchema } from '../src/llm/schema.ts'
import { OpenAICompat } from '../src/llm/openai-compat.ts'
import { OllamaNative } from '../src/llm/ollama.ts'
import { AISDKProvider } from '../src/llm/ai-sdk.ts'
import { configFromEnv } from '../src/llm/config.ts'
import { Orchestrator } from '../src/agent/orchestrator.ts'
import { RunStore, type RunEvent } from '../src/desktop/run-store.ts'
import { LLMError } from '../src/llm/contracts.ts'

const chart = { id: 'c1', tipo: 'bar', datasetId: 'd1', x: { campo: 'categoria', titulo: 'Categoria' }, y: { campo: 'valor', titulo: 'Valor' }, titulo: 'Vendas' } as const
const args = { system: 'JSON', messages: [{ role: 'user' as const, content: 'chart' }], schema: ChartSpec, temperature: 0 }

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('RF-08: contratos e seleção por configuração', () => {
  it('aceita ChartSpec e Slide como fixtures de contrato', () => {
    expect(TypeCompiler.Compile(ChartSpec).Check(chart)).toBe(true)
    expect(TypeCompiler.Compile(Slide).Check({ layout: 'titulo', titulo: 'Relatório' })).toBe(true)
  })

  it('transforma schemas para OpenAI strict', () => {
    const schema = toProviderSchema(ChartSpec, 'openai-strict')
    expect(schema.additionalProperties).toBe(false)
    const y = (schema.properties as Record<string, any>).y
    expect(y.required).toContain('agregacao')
    expect(y.additionalProperties).toBe(false)
  })

  it('faz uma chamada Ollama nativa sem usar /v1 e sem retry interno', async () => {
    let calls = 0
    let url = ''
    let sent: any
    const provider = new OllamaNative({ provider: 'ollama-native', baseUrl: 'http://ollama.test', model: 'qwen3:8b', numCtx: 8192, timeoutMs: 1000 }, async (input, init) => {
      calls++
      url = String(input)
      sent = JSON.parse(String(init?.body))
      return response({ message: { role: 'assistant', content: JSON.stringify(chart) }, done_reason: 'stop', prompt_eval_count: 20, eval_count: 10 })
    })
    const result = await provider.generate(args)
    expect(result.value).toEqual(chart)
    expect(url).toBe('http://ollama.test/api/chat')
    expect(calls).toBe(1)
    // O /api/chat ignora `system` no corpo: ele precisa chegar como primeira mensagem.
    expect(sent.system).toBeUndefined()
    expect(sent.messages[0]).toEqual({ role: 'system', content: 'JSON' })
    expect(sent.messages[1]).toEqual({ role: 'user', content: 'chart' })
    expect(sent.think).toBe(false)
    expect(sent.options.num_ctx).toBe(8192)
    expect(sent.format.type).toBe('object')
  })

  it('resposta sem message.content (formato do /api/generate) vira E_SPEC_PARSE', async () => {
    const provider = new OllamaNative({ provider: 'ollama-native', baseUrl: 'http://ollama.test', model: 'qwen3:8b', numCtx: 8192, timeoutMs: 1000 }, async () => response({ response: JSON.stringify(chart), done_reason: 'stop' }))
    await expect(provider.generate(args)).rejects.toMatchObject({ code: 'E_SPEC_PARSE' })
  })
})

describe('RF-12: OpenAICompat/OpenRouter', () => {
  it('envia json_schema strict e require_parameters no OpenRouter', async () => {
    let requestBody: any
    const provider = new OpenAICompat({ provider: 'openai-compat', baseUrl: 'https://openrouter.ai/api/v1', model: 'qwen/qwen3-8b', apiKey: 'secret', numCtx: 8192, timeoutMs: 1000 }, async (_input, init) => {
      requestBody = JSON.parse(String(init?.body))
      return response({ choices: [{ message: { content: JSON.stringify(chart) } }], usage: { prompt_tokens: 4, completion_tokens: 8 } })
    })
    const result = await provider.generate(args)
    expect(result.value).toEqual(chart)
    expect(requestBody.response_format.type).toBe('json_schema')
    expect(requestBody.response_format.json_schema.strict).toBe(true)
    expect(requestBody.provider.require_parameters).toBe(true)
  })
})

describe('RF-08: falhas explícitas dos adapters', () => {
  it('converte modelo ausente em E_PROVIDER', async () => {
    const provider = new OllamaNative({ provider: 'ollama-native', baseUrl: 'http://ollama.test', model: 'missing', numCtx: 8192, timeoutMs: 1000 }, async () => response({ error: 'model not found' }, 404))
    await expect(provider.generate(args)).rejects.toMatchObject({ code: 'E_PROVIDER' })
  })

  it('converte saída truncada em E_PROVIDER', async () => {
    const provider = new OllamaNative({ provider: 'ollama-native', baseUrl: 'http://ollama.test', model: 'qwen3:8b', numCtx: 8192, timeoutMs: 1000 }, async () => response({ message: { content: '{' }, done_reason: 'length' }))
    await expect(provider.generate(args)).rejects.toMatchObject({ code: 'E_PROVIDER' })
  })

  it('converte JSON inválido em E_SPEC_PARSE sem nova chamada', async () => {
    let calls = 0
    const provider = new OllamaNative({ provider: 'ollama-native', baseUrl: 'http://ollama.test', model: 'qwen3:8b', numCtx: 8192, timeoutMs: 1000 }, async () => { calls++; return response({ message: { content: '{' }, done_reason: 'stop' }) })
    await expect(provider.generate(args)).rejects.toBeInstanceOf(LLMError)
    expect(calls).toBe(1)
  })

  it('detecta contexto próximo do limite como E_PROVIDER', async () => {
    const provider = new OllamaNative({ provider: 'ollama-native', baseUrl: 'http://ollama.test', model: 'qwen3:8b', numCtx: 100, timeoutMs: 1000 }, async () => response({ message: { content: JSON.stringify(chart) }, done_reason: 'stop', prompt_eval_count: 99 }))
    await expect(provider.generate(args)).rejects.toMatchObject({ code: 'E_PROVIDER' })
  })
})


const contractEnabled = process.env.M0_CONTRACT === '1'

describe.skipIf(!contractEnabled)('RF-08/RF-12: contrato real M0 (opt-in)', () => {
  it('RF-08/RF-12: produz ChartSpec validada no adapter configurado', async () => {
    const config = {
      provider: process.env.LLM_PROVIDER === 'openai-compat' ? 'openai-compat' as const : 'ollama-native' as const,
      baseUrl: process.env.LLM_BASE_URL ?? 'http://127.0.0.1:11434',
      model: process.env.LLM_MODEL ?? 'qwen3:8b',
      apiKey: process.env.LLM_API_KEY,
      numCtx: Number(process.env.LLM_NUM_CTX ?? 8192),
      timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 120000)
    }
    const provider = config.provider === 'openai-compat' ? new OpenAICompat(config) : new OllamaNative(config)
    const result = await provider.generate(args)
    expect(TypeCompiler.Compile(ChartSpec).Check(result.value)).toBe(true)
  }, 180_000)

  // O Orchestrator usa o AISDKProvider, não os adapters acima: ele precisa do próprio contrato real.
  it('RF-08/RF-12: AISDKProvider produz ChartSpec validada no provedor configurado', async () => {
    const provider = new AISDKProvider(configFromEnv())
    const result = await provider.generate(args)
    expect(TypeCompiler.Compile(ChartSpec).Check(result.value)).toBe(true)
    expect(result.usage.outputTokens).toBeGreaterThan(0)
  }, 180_000)

  it('RF-03: Orchestrator ponta a ponta com o modelo real gera, valida e renderiza', async () => {
    const store = new RunStore()
    const states: string[] = []
    const done = new Promise<RunEvent>((resolve) => store.subscribe((event) => {
      states.push(event.state)
      if (event.state === 'ENTREGUE' || event.state === 'FALHOU') resolve(event)
    }))
    Orchestrator.fromEnv(store).start({ prompt: 'Crie um gráfico de barras com a soma de valor por categoria.' })
    const event = await done
    console.log(`[contrato real] ${states.join(' → ')}${event.errorCode ? ` | ${event.errorCode}: ${event.message}` : ''}`)
    expect(event.state).toBe('ENTREGUE')
    expect(store.getArtifact(event.runId)?.png.length).toBeGreaterThan(100)
  }, 300_000)
})
