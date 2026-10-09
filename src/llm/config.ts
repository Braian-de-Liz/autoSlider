import type { LLMConfig } from './contracts.ts'

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function configFromEnv(env: Record<string, string | undefined> = process.env): LLMConfig {
  const provider = env.LLM_PROVIDER === 'openai-compat' ? 'openai-compat' : 'ollama-native'
  const baseUrl = env.LLM_BASE_URL ?? (provider === 'ollama-native' ? 'http://127.0.0.1:11434' : 'https://api.openai.com/v1')
  return {
    provider,
    baseUrl: baseUrl.replace(/\/$/, ''),
    model: env.LLM_MODEL ?? 'qwen3:8b',
    apiKey: env.LLM_API_KEY,
    numCtx: positiveInt(env.LLM_NUM_CTX, 8192),
    timeoutMs: positiveInt(env.LLM_TIMEOUT_MS, 120_000)
  }
}
