import { describe, expect, it } from 'bun:test'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveInside } from '../src/fs/safe-path.ts'
import { LLMError } from '../src/llm/contracts.ts'

const base = join(tmpdir(), 'proj')

function codeOf(fn: () => unknown): string | undefined {
  try { fn() } catch (error) { return error instanceof LLMError ? error.code : 'outro erro' }
  return undefined
}

describe('RF-04: caminhos confinados ao projeto (seção 11)', () => {
  it('aceita o próprio diretório e caminhos dentro dele', () => {
    expect(resolveInside(base, '')).toBe(resolve(base))
    expect(resolveInside(base, '.')).toBe(resolve(base))
    expect(resolveInside(base, 'artifacts/run-1')).toBe(join(base, 'artifacts', 'run-1'))
    expect(resolveInside(base, './a/../b')).toBe(join(base, 'b'))
    expect(resolveInside(base, join(base, 'dentro', 'x.png'))).toBe(join(base, 'dentro', 'x.png'))
  })

  it('recusa .. que sai do diretório, com E_CONFIG_INVALIDA', () => {
    expect(codeOf(() => resolveInside(base, '..'))).toBe('E_CONFIG_INVALIDA')
    expect(codeOf(() => resolveInside(base, `..${sep}escape`))).toBe('E_CONFIG_INVALIDA')
    expect(codeOf(() => resolveInside(base, '../escape'))).toBe('E_CONFIG_INVALIDA')
    expect(codeOf(() => resolveInside(base, 'a/../../escape'))).toBe('E_CONFIG_INVALIDA')
  })

  it('recusa caminho absoluto fora e prefixo enganoso', () => {
    expect(codeOf(() => resolveInside(base, resolve(base, '..', 'outro')))).toBe('E_CONFIG_INVALIDA')
    expect(codeOf(() => resolveInside(base, `${resolve(base)}-evil`))).toBe('E_CONFIG_INVALIDA')
    expect(codeOf(() => resolveInside(base, join(`${resolve(base)}-evil`, 'x')))).toBe('E_CONFIG_INVALIDA')
  })

  it('nome que só começa com .. não é escape', () => {
    expect(resolveInside(base, '..pasta')).toBe(join(base, '..pasta'))
  })

  it('recusa outra unidade no Windows', () => {
    if (process.platform !== 'win32') return
    expect(codeOf(() => resolveInside('C:\\proj', 'Z:\\x'))).toBe('E_CONFIG_INVALIDA')
  })
})
