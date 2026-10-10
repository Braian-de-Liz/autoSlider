/**
 * Tokens visuais compartilhados pelos renderers (SPEC seção 10). Unidades do OOXML:
 * tamanhos de fonte em meio-ponto (24 = 12 pt) e medidas em twips (1 cm ≈ 566,93 twips).
 * Os valores do preset `abnt` seguem a NBR 14724 (fonte 12, entrelinha 1,5, margens 3/3/2/2 cm).
 */
export type DocxPresetName = 'abnt' | 'livre'

export interface HeadingTheme {
  /** Tamanho em meio-ponto. */
  size: number
  bold: boolean
  italics: boolean
  /** Maiúsculas por formatação (`w:caps`); o texto da spec não é alterado. */
  caps: boolean
  /** Espaço antes e depois do título, em twips. */
  before: number
  after: number
}

export interface DocxTheme {
  font: string
  /** Texto do corpo, em meio-ponto. */
  bodySize: number
  /** Legendas, fonte e número de página, em meio-ponto. */
  captionSize: number
  /** Texto das tabelas, em meio-ponto. */
  tableSize: number
  titleSize: number
  /** Entrelinha em 240avos de linha (240 = simples, 360 = 1,5). */
  line: number
  /** Espaço depois de cada parágrafo, em twips. */
  paragraphAfter: number
  align: 'both' | 'left'
  /** Recuo da primeira linha dos parágrafos de corpo, em twips. */
  firstLineIndent: number
  margins: { top: number; left: number; bottom: number; right: number }
  headings: { 1: HeadingTheme; 2: HeadingTheme; 3: HeadingTheme }
  pageNumber: boolean
  /** Cor das linhas horizontais das tabelas (hex sem `#`). */
  tableRule: string
}

/** Papel A4 em twips. */
export const A4 = { width: 11906, height: 16838 } as const

const abntHeading = (overrides: Partial<HeadingTheme>): HeadingTheme => ({ size: 24, bold: true, italics: false, caps: false, before: 360, after: 240, ...overrides })

export const THEME: Record<DocxPresetName, DocxTheme> = {
  abnt: {
    font: 'Times New Roman',
    bodySize: 24,
    captionSize: 20,
    tableSize: 20,
    titleSize: 28,
    line: 360,
    paragraphAfter: 0,
    align: 'both',
    firstLineIndent: 709,
    margins: { top: 1701, left: 1701, bottom: 1134, right: 1134 },
    headings: {
      1: abntHeading({ caps: true }),
      2: abntHeading({}),
      3: abntHeading({ bold: false, italics: true })
    },
    pageNumber: true,
    tableRule: '000000'
  },
  livre: {
    font: 'Calibri',
    bodySize: 22,
    captionSize: 20,
    tableSize: 20,
    titleSize: 36,
    line: 276,
    paragraphAfter: 120,
    align: 'left',
    firstLineIndent: 0,
    margins: { top: 1417, left: 1417, bottom: 1417, right: 1417 },
    headings: {
      1: { size: 32, bold: true, italics: false, caps: false, before: 360, after: 120 },
      2: { size: 28, bold: true, italics: false, caps: false, before: 240, after: 120 },
      3: { size: 24, bold: true, italics: false, caps: false, before: 200, after: 80 }
    },
    pageNumber: false,
    tableRule: '808080'
  }
}

/** Largura útil do texto na página, em twips (A4 menos as margens laterais). */
export const usableWidth = (theme: DocxTheme): number => A4.width - theme.margins.left - theme.margins.right

/** Twips para pixels a 96 dpi (1 px = 15 twips), a unidade que a `docx` usa para imagens. Arredonda para baixo: a imagem nunca passa da largura pedida. */
export const twipsToPixels = (twips: number): number => Math.floor(twips / 15)
