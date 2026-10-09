import { describe, expect, it } from 'bun:test'
import { AISDKProvider, isOpenRouter, ollamaApiBaseUrl } from '../src/llm/ai-sdk.ts'
import { ChartSpec } from '../src/specs/schemas.ts'
import { LLMError, type LLMConfig } from '../src/llm/contracts.ts'

// Os testes passam pelo generateObject e pelos providers reais; só o transporte HTTP é falso.
const ollamaConfig: LLMConfig = { provider: 'ollama-native', baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b', numCtx: 8192, timeoutMs: 2000 }
const openRouterConfig: LLMConfig = { provider: 'openai-compat', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'test-key', model: 'qwen/qwen3-8b', numCtx: 8192, timeoutMs: 2000 }
const chart = { id: 'c1', tipo: 'bar' as const, datasetId: 'vendas', x: { campo: 'categoria', titulo: 'Categoria' }, y: { campo: 'valor', titulo: 'Valor' }, titulo: 'Vendas' }
const request = { system: 'schema', messages: [{ role: 'user' as const, content: 'gere' }], schema: ChartSpec, temperature: 0 }

interface Captured { url?: string; body?: any; headers?: Headers }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function ollamaReply(content: string, extra: Record<string, unknown> = {}) {
  return { model: 'qwen3:8b', created_at: '2026-01-01T00:00:00Z', done: true, message: { role: 'assistant', content }, done_reason: 'stop', prompt_eval_count: 20, eval_count: 10, ...extra }
}

function openAIReply(content: string, finishReason = 'stop') {
  return { id: 'r1', created: 1, model: 'qwen/qwen3-8b', choices: [{ message: { role: 'assistant', content }, finish_reason: finishReason }], usage: { prompt_tokens: 5, completion_tokens: 7 } }
}

function fakeFetch(reply: () => Response, captured: Captured = {}) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.url = String(input)
    captured.body = init?.body ? JSON.parse(String(init.body)) : undefined
    captured.headers = new Headers(init?.headers)
    return reply()
  }
}

async function errorOf(promise: Promise<unknown>): Promise<LLMError> {
  try { await promise } catch (error) { if (error instanceof LLMError) return error; throw error }
  throw new Error('esperava LLMError')
}

describe('Vercel AI SDK bridge: Ollama', () => {
  it('normaliza a base do Ollama para o sufixo /api', () => {
    expect(ollamaApiBaseUrl('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434/api')
    expect(ollamaApiBaseUrl('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434/api')
    expect(ollamaApiBaseUrl('http://127.0.0.1:11434/api')).toBe('http://127.0.0.1:11434/api')
  })

  it('RF-08: chama /api/chat com format (schema), think=false e num_ctx', async () => {
    const captured: Captured = {}
    const provider = new AISDKProvider(ollamaConfig, { fetch: fakeFetch(() => json(ollamaReply(JSON.stringify(chart))), captured) })
    const result = await provider.generate(request)
    expect(result.value).toEqual(chart)
    expect(result.usage.inputTokens).toBe(20)
    expect(captured.url).toBe('http://127.0.0.1:11434/api/chat')
    expect(captured.body.format.type).toBe('object')
    expect(captured.body.think).toBe(false)
    expect(captured.body.options.num_ctx).toBe(8192)
    expect(provider.caps.remote).toBe(false)
  })

  it('saída truncada (done_reason=length) vira E_PROVIDER', async () => {
    const provider = new AISDKProvider(ollamaConfig, { fetch: fakeFetch(() => json(ollamaReply('{"id":"c1"', { done_reason: 'length' }))) })
    const error = await errorOf(provider.generate(request))
    expect(error.code).toBe('E_PROVIDER')
    expect(error.details?.reason).toBe('truncated')
  })

  it('prompt no limite do num_ctx vira E_PROVIDER de contexto, mesmo com JSON válido', async () => {
    const provider = new AISDKProvider(ollamaConfig, { fetch: fakeFetch(() => json(ollamaReply(JSON.stringify(chart), { prompt_eval_count: 8100 }))) })
    const error = await errorOf(provider.generate(request))
    expect(error.code).toBe('E_PROVIDER')
    expect(error.details?.reason).toBe('context')
  })

  it('JSON ilegível vira E_SPEC_PARSE sem nova chamada', async () => {
    let calls = 0
    const provider = new AISDKProvider(ollamaConfig, { fetch: fakeFetch(() => { calls++; return json(ollamaReply('não é json')) }) })
    expect((await errorOf(provider.generate(request))).code).toBe('E_SPEC_PARSE')
    expect(calls).toBe(1)
  })

  it('modelo inexistente (HTTP 404) vira E_PROVIDER', async () => {
    const provider = new AISDKProvider(ollamaConfig, { fetch: fakeFetch(() => json({ error: "model 'x' not found" }, 404)) })
    const error = await errorOf(provider.generate(request))
    expect(error.code).toBe('E_PROVIDER')
    expect(error.details?.statusCode).toBe(404)
  })

  it('servidor fora do ar vira E_PROVIDER', async () => {
    const provider = new AISDKProvider(ollamaConfig, { fetch: async () => { throw new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') }) } })
    expect((await errorOf(provider.generate(request))).code).toBe('E_PROVIDER')
  })

  it('respeita LLM_TIMEOUT_MS', async () => {
    const hang = (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    })
    const provider = new AISDKProvider({ ...ollamaConfig, timeoutMs: 50 }, { fetch: hang })
    const error = await errorOf(provider.generate(request))
    expect(error.code).toBe('E_PROVIDER')
    expect(error.details?.reason).toBe('timeout')
  })
})

describe('Vercel AI SDK bridge: OpenAI-compatible', () => {
  it('RF-12: OpenRouter recebe json_schema strict e require_parameters', async () => {
    const captured: Captured = {}
    const provider = new AISDKProvider(openRouterConfig, { fetch: fakeFetch(() => json(openAIReply(JSON.stringify(chart))), captured) })
    await provider.generate(request)
    expect(captured.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(captured.body.response_format.type).toBe('json_schema')
    expect(captured.body.response_format.json_schema.strict).toBe(true)
    expect(captured.body.response_format.json_schema.schema.additionalProperties).toBe(false)
    expect(captured.body.provider).toEqual({ require_parameters: true })
    expect(captured.headers?.get('authorization')).toBe('Bearer test-key')
    expect(provider.caps.remote).toBe(true)
  })

  it('outro provedor compatível não recebe o campo provider', async () => {
    const captured: Captured = {}
    const provider = new AISDKProvider({ ...openRouterConfig, baseUrl: 'https://api.openai.com/v1' }, { fetch: fakeFetch(() => json(openAIReply(JSON.stringify(chart))), captured) })
    await provider.generate(request)
    expect(captured.body.provider).toBeUndefined()
  })

  it('opcional devolvido como null no modo strict volta a ser ausente', async () => {
    const withNulls = { ...chart, serie: null, y: { ...chart.y, agregacao: null } }
    const provider = new AISDKProvider(openRouterConfig, { fetch: fakeFetch(() => json(openAIReply(JSON.stringify(withNulls)))) })
    const result = await provider.generate(request)
    expect(result.value).toEqual(chart)
  })

  it('finish_reason=length vira E_PROVIDER', async () => {
    const provider = new AISDKProvider(openRouterConfig, { fetch: fakeFetch(() => json(openAIReply('{"id":"c1"', 'length'))) })
    expect((await errorOf(provider.generate(request))).code).toBe('E_PROVIDER')
  })

  it('chave inválida (HTTP 401) vira E_PROVIDER', async () => {
    const provider = new AISDKProvider(openRouterConfig, { fetch: fakeFetch(() => json({ error: { message: 'No auth credentials found', code: 401 } }, 401)) })
    const error = await errorOf(provider.generate(request))
    expect(error.code).toBe('E_PROVIDER')
    expect(error.details?.statusCode).toBe(401)
  })

  it('reconhece o host do OpenRouter', () => {
    expect(isOpenRouter('https://openrouter.ai/api/v1')).toBe(true)
    expect(isOpenRouter('https://api.openai.com/v1')).toBe(false)
    expect(isOpenRouter('não é url')).toBe(false)
  })
})
