import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import { LLMError } from '../llm/contracts.ts'

/** Família da fonte embutida (assets/fonts/DejaVuSans.ttf, licença em assets/fonts/LICENSE-DejaVu.txt). */
export const FONT_FAMILY = 'DejaVu Sans'

function renderError(message: string, cause?: unknown): LLMError {
  const detail = cause instanceof Error ? ` ${cause.message}` : cause === undefined ? '' : ` ${String(cause)}`
  return new LLMError('E_RENDER', `${message}${detail}`)
}

function options(font: Uint8Array) {
  return { font: { fontBuffers: [font], defaultFontFamily: FONT_FAMILY, sansSerifFamily: FONT_FAMILY, serifFamily: FONT_FAMILY, monospaceFamily: FONT_FAMILY } }
}

function rasterize(svg: string, font: Uint8Array): Uint8Array {
  const resvg = new Resvg(svg, options(font))
  try {
    const image = resvg.render()
    try { return image.asPng() } finally { image.free() }
  } finally {
    resvg.free()
  }
}

/** Lê a fonte embutida. O arquivo precisa ir junto do app compilado (`--include assets/fonts`). */
export function loadFont(): Uint8Array {
  const path = fileURLToPath(import.meta.resolve('../../assets/fonts/DejaVuSans.ttf'))
  let font: Uint8Array
  try {
    font = new Uint8Array(readFileSync(path))
  } catch (error: unknown) {
    throw renderError(`Não foi possível ler a fonte embutida (${path}). Em app compilado, inclua assets/fonts no build.`, error)
  }
  // Assinatura de uma fonte TrueType (0x00010000).
  if (font.length < 100_000 || font[0] !== 0 || font[1] !== 1 || font[2] !== 0 || font[3] !== 0) {
    throw renderError(`A fonte embutida (${path}) não é um arquivo TrueType válido.`)
  }
  return font
}

const PROBE = (text: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#000"/><text x="6" y="28" font-family="${FONT_FAMILY}" font-size="22" fill="#fff">${text}</text></svg>`

/**
 * O resvg-wasm não enxerga as fontes do sistema e, sem fonte, desenha o gráfico **sem os textos e
 * sem nenhum erro**. Esta checagem renderiza um texto e um quadro em branco e exige que difiram;
 * se forem iguais, a fonte não está funcionando e o render deve falhar (P6).
 */
export function verifyFont(font: Uint8Array): void {
  let withText: Uint8Array
  let withoutText: Uint8Array
  try {
    withText = rasterize(PROBE('Aa Ção'), font)
    withoutText = rasterize(PROBE(''), font)
  } catch (error: unknown) {
    throw renderError('Falha ao testar a fonte embutida no resvg.', error)
  }
  if (withText.length === withoutText.length && withText.every((byte, index) => byte === withoutText[index])) {
    throw renderError('A fonte embutida não desenhou texto: os gráficos sairiam sem rótulos.')
  }
}

let ready: Promise<Uint8Array> | undefined

/** Inicializa o wasm uma única vez (um segundo `initWasm` falha) e valida a fonte. */
export function ensureReady(): Promise<Uint8Array> {
  ready ??= (async () => {
    try {
      const require = createRequire(import.meta.url)
      await initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')))
    } catch (error: unknown) {
      throw renderError('Não foi possível iniciar o resvg-wasm.', error)
    }
    const font = loadFont()
    verifyFont(font)
    return font
  })()
  return ready
}

/** SVG para PNG, com a fonte embutida. Determinístico e igual em Bun, Deno e no app compilado. */
export async function svgToPng(svg: string): Promise<Uint8Array> {
  const font = await ensureReady()
  try {
    return rasterize(svg, font)
  } catch (error: unknown) {
    throw renderError('Falha ao converter o SVG em PNG.', error)
  }
}
