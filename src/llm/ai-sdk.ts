import { APICallError, NoObjectGeneratedError, generateObject, type FinishReason, type LanguageModel, type ModelMessage } from 'ai'
import { isAbortError, jsonSchema, type FetchFunction } from '@ai-sdk/provider-utils'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOllama } from 'ollama-ai-provider-v2'
import type { TSchema, Static } from '@sinclair/typebox'
import { LLMError, type GenerationResult, type LLMConfig, type LLMProvider, type Msg } from './contracts.ts'
import { stripNullOptionals, toProviderSchema } from './schema.ts'

/** Prompt nessa fração do num_ctx (ou acima) indica truncamento silencioso pelo Ollama. */
const CONTEXT_LIMIT_RATIO = 0.95

/** O ollama-ai-provider-v2 espera a base com /api (padrão dele: http://127.0.0.1:11434/api). */
export function ollamaApiBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

export function isOpenRouter(baseUrl: string): boolean {
  try { return new URL(baseUrl).hostname.endsWith('openrouter.ai') } catch { return false }
}

export type HttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface AISDKProviderDeps {
  /** Transporte HTTP; injetável para testar o caminho real do SDK sem rede. */
  fetch?: HttpFetch
}

/**
 * LLMProvider sobre o Vercel AI SDK. Só traduz a chamada (seção 7, regra 1):
 * não valida a spec nem repete chamadas; erros saem tipados.
 */
export class AISDKProvider implements LLMProvider {
  readonly caps
  private readonly model: LanguageModel

  constructor(private readonly config: LLMConfig, deps: AISDKProviderDeps = {}) {
    const fetch = deps.fetch as FetchFunction | undefined
    if (config.provider === 'ollama-native') {
      const provider = createOllama({ baseURL: ollamaApiBaseUrl(config.baseUrl), compatibility: 'strict', fetch })
      this.model = provider.chat(config.model)
      this.caps = { constrainedJson: true, ctx: config.numCtx, remote: false }
    } else {
      const openRouter = isOpenRouter(config.baseUrl)
      const provider = createOpenAICompatible({
        name: openRouter ? 'openrouter' : 'openai-compatible',
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
        supportsStructuredOutputs: true,
        fetch,
        // ADR-008: só o OpenRouter entende `provider`; restringe a endpoints que aceitam json_schema.
        ...(openRouter ? { transformRequestBody: (body: Record<string, unknown>) => ({ ...body, provider: { require_parameters: true } }) } : {})
      })
      this.model = provider(config.model)
      this.caps = { constrainedJson: true, ctx: config.numCtx, remote: true }
    }
  }

  async generate<T extends TSchema>(args: {
    system: string
    messages: Msg[]
    schema: T
    temperature?: number
  }): Promise<GenerationResult<Static<T>>> {
    const started = Date.now()
    const ollama = this.config.provider === 'ollama-native'
    let result: Awaited<ReturnType<typeof generateObject>>
    try {
      result = await generateObject({
        model: this.model,
        system: args.system,
        messages: args.messages as ModelMessage[],
        schema: jsonSchema(toProviderSchema(args.schema, ollama ? 'ollama' : 'openai-strict')),
        schemaName: 'artifact_spec',
        temperature: args.temperature ?? 0.2,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(this.config.timeoutMs),
        ...(ollama ? { providerOptions: { ollama: { think: false, options: { num_ctx: this.config.numCtx } } } } : {})
      })
    } catch (error: unknown) {
      throw this.toLLMError(error)
    }
    const incomplete = this.incompleteOutput(result.finishReason, result.usage?.inputTokens)
    if (incomplete) throw incomplete
    return {
      value: stripNullOptionals(args.schema, result.object) as Static<T>,
      usage: { provider: this.config.provider, model: this.config.model, inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens, durationMs: Date.now() - started }
    }
  }

  /** Saída cortada ou prompt truncado viram E_PROVIDER explícito, nunca JSON quebrado ou resposta aceita. */
  private incompleteOutput(finishReason: FinishReason | undefined, inputTokens: number | undefined): LLMError | undefined {
    if (finishReason === 'length') {
      return new LLMError('E_PROVIDER', 'Saída truncada pelo limite de tokens ou de contexto do modelo.', { details: { reason: 'truncated' } })
    }
    if (this.config.provider === 'ollama-native' && inputTokens !== undefined && inputTokens >= this.config.numCtx * CONTEXT_LIMIT_RATIO) {
      return new LLMError('E_PROVIDER', `Contexto excedido: o prompt usou ${inputTokens} de ${this.config.numCtx} tokens (num_ctx).`, { details: { reason: 'context', inputTokens, numCtx: this.config.numCtx } })
    }
    return undefined
  }

  private toLLMError(error: unknown): LLMError {
    if (error instanceof LLMError) return error
    if (NoObjectGeneratedError.isInstance(error)) {
      return this.incompleteOutput(error.finishReason, error.usage?.inputTokens)
        ?? new LLMError('E_SPEC_PARSE', 'A resposta do modelo não é um JSON válido.', { retryable: true, details: { finishReason: error.finishReason } })
    }
    if (isAbortError(error)) {
      return new LLMError('E_PROVIDER', `Tempo limite de ${this.config.timeoutMs} ms excedido.`, { retryable: true, details: { reason: 'timeout' } })
    }
    if (APICallError.isInstance(error)) {
      const status = error.statusCode ? ` HTTP ${error.statusCode}` : ''
      return new LLMError('E_PROVIDER', `Provedor respondeu com erro${status}: ${error.message}`, { retryable: error.isRetryable, details: { statusCode: error.statusCode } })
    }
    return new LLMError('E_PROVIDER', `Falha no provedor: ${error instanceof Error ? error.message : String(error)}`, { retryable: true })
  }
}
