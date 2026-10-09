import type { Static, TSchema } from '@sinclair/typebox'

export type DatasetColumnType = 'string' | 'number' | 'boolean' | 'date'

export interface DatasetColumn {
  name: string
  type: DatasetColumnType
}

export interface Dataset {
  id: string
  name: string
  columns: DatasetColumn[]
  sample: Record<string, unknown>[]
}

export interface SourceUnit {
  index: number
  kind: 'document' | 'page' | 'slide' | 'sheet'
  text: string
}

export interface SourceDoc {
  id: string
  name: string
  format: 'md' | 'csv' | 'xlsx' | 'pdf' | 'docx' | 'pptx'
  units: SourceUnit[]
  datasets: Dataset[]
}

export interface Msg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ProviderCaps {
  constrainedJson: boolean
  ctx: number
  remote: boolean
}

export interface LLMConfig {
  provider: 'ollama-native' | 'openai-compat'
  baseUrl: string
  model: string
  apiKey?: string
  numCtx: number
  timeoutMs: number
}

export type ErrorCode =
  | 'E_ROTA'
  | 'E_PROVIDER'
  | 'E_SPEC_SCHEMA'
  | 'E_SPEC_SEMANTICA'
  | 'E_SPEC_PARSE'
  | 'E_LOCAL_ONLY'
  | 'E_RENDER'
  | 'E_CONFIG_INVALIDA'

export class LLMError extends Error {
  readonly code: ErrorCode
  readonly retryable: boolean
  readonly details?: Record<string, unknown>

  constructor(code: ErrorCode, message: string, options: { retryable?: boolean; details?: Record<string, unknown> } = {}) {
    super(message)
    this.name = 'LLMError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.details = options.details
  }
}

export interface UsageMetadata {
  inputTokens?: number
  outputTokens?: number
  provider: string
  model: string
  durationMs: number
}

export interface GenerationResult<T> {
  value: T
  usage: UsageMetadata
}

export interface LLMProvider {
  readonly caps: ProviderCaps
  generate<T extends TSchema>(args: {
    system: string
    messages: Msg[]
    schema: T
    temperature?: number
  }): Promise<GenerationResult<Static<T>>>
}
