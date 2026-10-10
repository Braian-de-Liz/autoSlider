import { describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LLMError } from '../src/llm/contracts.ts'
import { FONT_FAMILY, loadFont, svgToPng, verifyFont } from '../src/render/png.ts'

const ROOT = join(import.meta.dirname ?? '.', '..')
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const svg = (text: string, family = FONT_FAMILY) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="60"><rect width="320" height="60" fill="#0b1120"/><text x="10" y="38" font-family="${family}" font-size="22" fill="#dbeafe">${text}</text></svg>`

async function failure(promise: Promise<unknown> | (() => unknown)): Promise<LLMError> {
  try {
    await (typeof promise === 'function' ? promise() : promise)
  } catch (error) {
    if (error instanceof LLMError) return error
    throw error
  }
  throw new Error('esperava um erro e nada foi lançado')
}

describe('RF-05: conversão de SVG em PNG com fonte embutida (ADR-021)', () => {
  it('o texto é desenhado: com texto o PNG difere do mesmo quadro sem texto', async () => {
    // O resvg-wasm não enxerga as fontes do sistema; sem fonte, o texto some em silêncio (P6).
    const withText = await svgToPng(svg('Região Eletrônicos ção'))
    const without = await svgToPng(svg(''))
    expect(sha(withText)).not.toBe(sha(without))
    expect([...withText.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })

  it('textos diferentes dão imagens diferentes, com acentos e símbolos', async () => {
    const hashes = await Promise.all(['Região', 'Eletrônicos', 'Ação &amp; Cia', '12,5%'].map(async (text) => sha(await svgToPng(svg(text)))))
    expect(new Set(hashes).size).toBe(4)
  })

  it('a família genérica sans-serif (padrão do Vega) usa a fonte embutida', async () => {
    expect(sha(await svgToPng(svg('Região', 'sans-serif')))).toBe(sha(await svgToPng(svg('Região'))))
    expect(sha(await svgToPng(svg('Região', 'Fonte Que Nao Existe')))).toBe(sha(await svgToPng(svg('Região'))))
  })

  it('é determinístico e igual em Bun e Deno: o hash de referência é fixo (P5)', async () => {
    // SHA-256 medido em Bun, em Deno e dentro do app compilado com `deno desktop`: os três coincidem.
    // Se mudar ao atualizar o resvg-wasm ou a fonte, a mudança é intencional: atualize e registre no CHANGELOG.
    const png = await svgToPng(svg('Região Eletrônicos ção'))
    expect(sha(png).startsWith('2321ca0b0cf9')).toBe(true)
    expect(sha(await svgToPng(svg('Região Eletrônicos ção')))).toBe(sha(png))
  })

  it('chamadas simultâneas iniciam o wasm uma única vez e dão o mesmo resultado', async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => svgToPng(svg('Concorrência'))))
    expect(new Set(results.map(sha)).size).toBe(1)
  })

  it('a fonte embutida é um TrueType válido de tamanho esperado', () => {
    const font = loadFont()
    expect([...font.subarray(0, 4)]).toEqual([0, 1, 0, 0])
    expect(font.length).toBe(757076)
  })

  it('verifyFont recusa uma fonte que não desenha texto, com E_RENDER', async () => {
    const error = await failure(() => verifyFont(new Uint8Array(2000)))
    expect(error.code).toBe('E_RENDER')
    expect(error.message).toContain('não desenhou texto')
    expect(() => verifyFont(loadFont())).not.toThrow()
  })

  it('SVG inválido é E_RENDER, sem derrubar o conversor', async () => {
    const error = await failure(svgToPng('isto não é um svg'))
    expect(error.code).toBe('E_RENDER')
    expect(sha(await svgToPng(svg('depois do erro')))).toBe(sha(await svgToPng(svg('depois do erro'))))
  })

  it('a licença da fonte acompanha o arquivo (condição de redistribuição)', () => {
    const license = join(ROOT, 'assets', 'fonts', 'LICENSE-DejaVu.txt')
    expect(existsSync(license)).toBe(true)
    const text = readFileSync(license, 'utf8')
    expect(text).toContain('Bitstream Vera Fonts Copyright')
    expect(text).toContain('Permission is hereby granted')
  })
})
