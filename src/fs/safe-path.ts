import { isAbsolute, relative, resolve, sep } from 'node:path'
import { LLMError } from '../llm/contracts.ts'

/**
 * Resolve `target` dentro de `base` e recusa o que sai dele (seção 11): `..`, caminho absoluto fora
 * do diretório, prefixo enganoso (`/proj` contra `/proj-evil`) e outra unidade no Windows.
 * Devolve o caminho absoluto resolvido. Não toca o disco.
 */
export function resolveInside(base: string, target: string): string {
  const root = resolve(base)
  const full = resolve(root, target)
  const rel = relative(root, full)
  if (rel === '') return full
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new LLMError('E_CONFIG_INVALIDA', `Caminho fora do diretório do projeto: "${target}".`, { details: { base: root, target } })
  }
  return full
}
