/** Helpers de teste para inspecionar o XML de um .docx (regex sobre o OOXML que a `docx` produz). */

export interface ParsedParagraph {
  style?: string
  text: string
  align?: string
  numId?: string
  pageBreak: boolean
  bold: boolean
  /** XML bruto do parágrafo, para asserções específicas. */
  xml: string
}

export type BodyElement = ({ kind: 'p' } & ParsedParagraph) | { kind: 'tbl'; xml: string }

const unescapeXml = (text: string) => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&')

export function parseParagraph(xml: string): ParsedParagraph {
  const properties = /<w:pPr>.*?<\/w:pPr>/s.exec(xml)?.[0] ?? ''
  // <w:t> em ordem; <w:br/> simples é quebra de linha (a de página tem w:type="page").
  const text = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:br\/>/g)].map((match) => match[1] === undefined ? '\n' : unescapeXml(match[1])).join('')
  return {
    style: /<w:pStyle w:val="([^"]+)"/.exec(properties)?.[1],
    text,
    align: /<w:jc w:val="([^"]+)"/.exec(properties)?.[1],
    numId: /<w:numId w:val="(\d+)"/.exec(properties)?.[1],
    pageBreak: /<w:br w:type="page"\/>/.test(xml),
    bold: /<w:b\/>|<w:b w:val="true"\/>/.test(xml),
    xml
  }
}

/** Filhos do `<w:body>` em ordem: parágrafos e tabelas (uma tabela é um único elemento). */
export function bodyElements(documentXml: string): BodyElement[] {
  const body = /<w:body>(.*)<\/w:body>/s.exec(documentXml)?.[1] ?? ''
  return [...body.matchAll(/<w:tbl>.*?<\/w:tbl>|<w:p>.*?<\/w:p>|<w:p [^>]*>.*?<\/w:p>/gs)].map((match): BodyElement =>
    match[0].startsWith('<w:tbl>') ? { kind: 'tbl', xml: match[0] } : { kind: 'p', ...parseParagraph(match[0]) })
}

export const paragraphs = (documentXml: string): ParsedParagraph[] =>
  bodyElements(documentXml).filter((element): element is { kind: 'p' } & ParsedParagraph => element.kind === 'p')

export function pageMargins(documentXml: string): { top: number; right: number; bottom: number; left: number } {
  const tag = /<w:pgMar [^>]*>/.exec(documentXml)?.[0] ?? ''
  const value = (name: string) => Number(new RegExp(`w:${name}="(\\d+)"`).exec(tag)?.[1])
  return { top: value('top'), right: value('right'), bottom: value('bottom'), left: value('left') }
}

export function pageSize(documentXml: string): { width: number; height: number } {
  const tag = /<w:pgSz [^>]*>/.exec(documentXml)?.[0] ?? ''
  return { width: Number(/w:w="(\d+)"/.exec(tag)?.[1]), height: Number(/w:h="(\d+)"/.exec(tag)?.[1]) }
}

/** Padrões do documento em `word/styles.xml`: fonte, tamanho, entrelinha e idioma. */
export function documentDefaults(stylesXml: string): { font?: string; size?: number; line?: number; language?: string } {
  const defaults = /<w:docDefaults>.*?<\/w:docDefaults>/s.exec(stylesXml)?.[0] ?? ''
  return {
    font: /<w:rFonts w:ascii="([^"]+)"/.exec(defaults)?.[1],
    size: Number(/<w:sz w:val="(\d+)"/.exec(defaults)?.[1]),
    line: Number(/<w:spacing [^>]*w:line="(\d+)"/.exec(defaults)?.[1]),
    language: /<w:lang w:val="([^"]+)"/.exec(defaults)?.[1]
  }
}

/** XML de um estilo de parágrafo pelo id. */
export const styleXml = (stylesXml: string, id: string): string =>
  new RegExp(`<w:style [^>]*w:styleId="${id}".*?</w:style>`, 's').exec(stylesXml)?.[0] ?? ''


export interface ParsedRow { header: boolean; cantSplit: boolean; cells: ParsedParagraph[] }

/** Linhas de uma tabela (`<w:tbl>`), com o parágrafo de cada célula. */
export function tableRows(tableXml: string): ParsedRow[] {
  return [...tableXml.matchAll(/<w:tr>.*?<\/w:tr>/gs)].map((row) => ({
    header: row[0].includes('<w:tblHeader/>'),
    cantSplit: row[0].includes('<w:cantSplit/>'),
    cells: [...row[0].matchAll(/<w:tc>.*?<\/w:tc>/gs)].map((cell) => parseParagraph(/<w:p>.*?<\/w:p>/s.exec(cell[0])![0]))
  }))
}

export interface TableInfo { width: number; gridWidths: number[]; borders: Record<string, string> }

/** Largura, colunas e bordas (`w:val` de cada lado) de uma tabela. */
export function tableInfo(tableXml: string): TableInfo {
  const borders = /<w:tblBorders>(.*?)<\/w:tblBorders>/s.exec(tableXml)?.[1] ?? ''
  return {
    width: Number(/<w:tblW [^>]*w:w="(\d+)"/.exec(tableXml)?.[1]),
    gridWidths: [...tableXml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((match) => Number(match[1])),
    borders: Object.fromEntries([...borders.matchAll(/<w:(top|left|bottom|right|insideH|insideV) w:val="([^"]+)"/g)].map((match) => [match[1], match[2]]))
  }
}

export interface ParsedDrawing { cx: number; cy: number; id: string; name: string; descr: string; title: string; embed: string }

/** Imagens inline (`<w:drawing>`) do documento, em ordem. */
export function drawings(documentXml: string): ParsedDrawing[] {
  return [...documentXml.matchAll(/<w:drawing>.*?<\/w:drawing>/gs)].map((match) => {
    const xml = match[0]
    const attribute = (tag: string, name: string) => new RegExp(`<${tag} [^>]*\\b${name}="([^"]*)"`).exec(xml)?.[1] ?? ''
    return {
      cx: Number(attribute('wp:extent', 'cx')),
      cy: Number(attribute('wp:extent', 'cy')),
      id: attribute('wp:docPr', 'id'),
      name: unescapeXml(attribute('wp:docPr', 'name')),
      descr: unescapeXml(attribute('wp:docPr', 'descr')),
      title: unescapeXml(attribute('wp:docPr', 'title')),
      embed: attribute('a:blip', 'r:embed')
    }
  })
}

/** Largura e altura de um PNG (cabeçalho IHDR). */
export function pngDimensions(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
