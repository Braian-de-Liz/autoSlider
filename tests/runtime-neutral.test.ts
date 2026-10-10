import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dirname ?? '.', '..', 'src')
// import/export ... from 'bun:x', import('bun:x') e require('bun:x')
const BUN_IMPORT = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)['"]bun:[\w/-]+['"]/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [path] : []
  })
}

describe('RNF-10: núcleo runtime-neutral', () => {
  it('nenhum arquivo de src/ importa módulos bun:*', () => {
    const offenders = sourceFiles(SRC).filter((file) => BUN_IMPORT.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('o detector reconhece as formas de import proibidas', () => {
    expect(BUN_IMPORT.test(`import { Database } from 'bun:sqlite'`)).toBe(true)
    expect(BUN_IMPORT.test(`const m = await import("bun:ffi")`)).toBe(true)
    expect(BUN_IMPORT.test(`import 'bun:jsc'`)).toBe(true)
    expect(BUN_IMPORT.test(`import { x } from 'node:sqlite'`)).toBe(false)
  })
})
