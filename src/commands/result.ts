export interface CommandResult {
  /** 0 = sucesso; 1 = pedido rejeitado (erro tipado); 2 = uso incorreto ou arquivo ilegível. */
  exitCode: 0 | 1 | 2
  output: string
}

export function usageError(message: string): CommandResult {
  return { exitCode: 2, output: JSON.stringify({ ok: false, message }) }
}
