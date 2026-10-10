import type { TSchema } from '@sinclair/typebox'
import { LLMError, type LLMConfig, type LLMProvider, type Msg, type GenerationResult } from './contracts.ts'
import { toProviderSchema } from './schema.ts'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

interface OllamaResponse {
  /** /api/chat devolve a resposta em message.content (o campo `response` é do /api/generate). */
  message?: { role?: string; content?: string }
  done_reason?: string
  prompt_eval_count?: number
  eval_count?: number
  error?: string
}

export class OllamaNative implements LLMProvider {
  readonly caps = { constrainedJson: true, ctx: 8192, remote: false }
  private readonly request: FetchLike

  constructor(private readonly config: LLMConfig, request: FetchLike = fetch) {
    this.request = request
  }

  async generate<T extends TSchema>(args: {
    system: string
    messages: Msg[]
    schema: T
    temperature?: number
  }): Promise<GenerationResult<import('@sinclair/typebox').Static<T>>> {
    const started = Date.now()
    const body = {
      model: this.config.model,
      // /api/chat ignora um campo `system` no corpo: o prompt de sistema vai como mensagem.
      messages: [{ role: 'system' as const, content: args.system }, ...args.messages],
      stream: false,
      // think=false: Qwen3 e similares não gastam o orçamento de tokens em raciocínio antes do JSON.
      think: false,
      format: toProviderSchema(args.schema, 'ollama'),
      options: { temperature: args.temperature ?? 0.2, num_ctx: this.config.numCtx }
    }

    let response: Response
    try {
      response = await this.request(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs)
      })
    } catch (error) {
      throw new LLMError('E_PROVIDER', `Falha de transporte Ollama: ${error instanceof Error ? error.message : String(error)}`, { retryable: true })
    }

    let payload: OllamaResponse
    try {
      payload = await response.json() as OllamaResponse
    } catch {
      throw new LLMError('E_PROVIDER', 'Resposta não-JSON do Ollama', { retryable: true })
    }
    if (!response.ok || payload.error) {
      throw new LLMError('E_PROVIDER', payload.error ?? `Ollama respondeu HTTP ${response.status}`, { retryable: response.status >= 500 })
    }
    if (payload.done_reason === 'length') {
      throw new LLMError('E_PROVIDER', 'Resposta Ollama truncada por limite de tokens/contexto', { details: { doneReason: payload.done_reason } })
    }
    if ((payload.prompt_eval_count ?? 0) >= this.config.numCtx * 0.95) {
      throw new LLMError('E_PROVIDER', 'Contexto Ollama excedido ou prompt truncado', { details: { promptEvalCount: payload.prompt_eval_count, numCtx: this.config.numCtx } })
    }
    const content = payload.message?.content
    if (!content) throw new LLMError('E_SPEC_PARSE', 'Ollama não retornou conteúdo JSON', { retryable: true })

    let value: import('@sinclair/typebox').Static<T>
    try {
      value = JSON.parse(content) as import('@sinclair/typebox').Static<T>
    } catch {
      throw new LLMError('E_SPEC_PARSE', 'Resposta do Ollama não contém JSON válido', { retryable: true })
    }
    return {
      value,
      usage: { provider: 'ollama-native', model: this.config.model, inputTokens: payload.prompt_eval_count, outputTokens: payload.eval_count, durationMs: Date.now() - started }
    }
  }
}
