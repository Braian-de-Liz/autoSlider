import type { LLMError } from '../llm/contracts.ts'

export interface CommandResult {
  /** 0 = sucesso; 1 = pedido rejeitado (erro tipado); 2 = uso incorreto ou arquivo ilegível. */
  exitCode: 0 | 1 | 2
  output: string
}

export function usageError(message: string): CommandResult {
  return { exitCode: 2, output: JSON.stringify({ ok: false, message }) }
}

/** Erro tipado com subcódigo e JSON Pointer, quando existirem (exit 1). */
export function typedFailure(error: LLMError): CommandResult {
  const { subcode, path } = (error.details ?? {}) as { subcode?: string; path?: string }
  return {
    exitCode: 1,
    output: JSON.stringify({ ok: false, code: error.code, ...(subcode ? { subcode } : {}), ...(path ? { path } : {}), message: error.message })
  }
}
