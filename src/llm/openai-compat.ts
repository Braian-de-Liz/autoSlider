import type { TSchema, Static } from '@sinclair/typebox'
import { LLMError, type LLMConfig, type LLMProvider, type Msg, type GenerationResult } from './contracts.ts'
import { toProviderSchema } from './schema.ts'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string | null } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string; code?: string }
}

export class OpenAICompat implements LLMProvider {
  readonly caps = { constrainedJson: true, ctx: 8192, remote: true }
  private readonly request: FetchLike

  constructor(private readonly config: LLMConfig, request: FetchLike = fetch) {
    this.request = request
  }

  async generate<T extends TSchema>(args: {
    system: string
    messages: Msg[]
    schema: T
    temperature?: number
  }): Promise<GenerationResult<Static<T>>> {
    const started = Date.now()
    const body = {
      model: this.config.model,
      messages: [{ role: 'system', content: args.system }, ...args.messages],
      temperature: args.temperature ?? 0.2,
      response_format: { type: 'json_schema', json_schema: { name: 'artifact_spec', strict: true, schema: toProviderSchema(args.schema, 'openai-strict') } },
      ...(this.config.baseUrl.includes('openrouter.ai') ? { provider: { require_parameters: true } } : {})
    }

    let response: Response
    try {
      response = await this.request(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs)
      })
    } catch (error) {
      throw new LLMError('E_PROVIDER', `Falha de transporte OpenAI-compatible: ${error instanceof Error ? error.message : String(error)}`, { retryable: true })
    }

    let payload: OpenAIResponse
    try {
      payload = await response.json() as OpenAIResponse
    } catch {
      throw new LLMError('E_PROVIDER', 'Resposta não-JSON do provedor OpenAI-compatible', { retryable: true })
    }
    if (!response.ok || payload.error) {
      throw new LLMError('E_PROVIDER', payload.error?.message ?? `Provedor respondeu HTTP ${response.status}`, { retryable: response.status >= 500, details: { providerCode: payload.error?.code } })
    }
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new LLMError('E_SPEC_PARSE', 'Provedor OpenAI-compatible não retornou conteúdo JSON')
    let value: Static<T>
    try {
      value = JSON.parse(content) as Static<T>
    } catch {
      throw new LLMError('E_SPEC_PARSE', 'Resposta do provedor OpenAI-compatible não contém JSON válido', { retryable: true })
    }
    return {
      value,
      usage: { provider: 'openai-compat', model: this.config.model, inputTokens: payload.usage?.prompt_tokens, outputTokens: payload.usage?.completion_tokens, durationMs: Date.now() - started }
    }
  }
}
