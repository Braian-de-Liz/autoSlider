import { createHash } from 'node:crypto'
import {
  AlignmentType, BorderStyle, Document, Header, HeadingLevel, ImageRun, LevelFormat, LineRuleType, Packer, PageBreak, PageNumber, PageOrientation,
  Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType, type ISectionOptions
} from 'docx'
import type { ValidDocxSpec } from '../agent/validate-docx.ts'
import type { TabularDataset } from '../data/catalog.ts'
import { decodeText, readZip } from '../fs/zip.ts'
import { slugText } from '../ingest/common.ts'
import { LLMError, type DatasetColumnType } from '../llm/contracts.ts'
import { renderChart } from './chart.ts'
import { A4, THEME, twipsToPixels, usableWidth, type DocxTheme } from './theme.ts'

/** 1.2.0: as figuras embutidas passam a vir do resvg-wasm com fonte embutida (ADR-021). */
export const DOCX_RENDERER_VERSION = 'docx-abnt@1.2.0'

export interface DocxRenderContext {
  /** Único diretório em que o renderer grava. */
  outputDir: string
  /** Datasets referenciados pelo documento (o que `validateDocx` devolve). */
  datasets: Map<string, TabularDataset>
  writeFile: (path: string, data: Uint8Array) => Promise<void> | void
}

export interface DocxArtifact {
  path: string
  /** SHA-256 do conteúdo normalizado do .docx (ver `contentHash`). */
  hash: string
  rendererVersion: string
}

type Block = Paragraph | Table
type Chart = ValidDocxSpec['charts'][number]

const BULLETS = 'marcadores'
const ORDERED = 'numerada'
/** Altura máxima de uma figura, em pixels (a 96 dpi), para caber numa página com a legenda. */
const MAX_FIGURE_HEIGHT_PX = 640
const CHART_LABEL: Record<Chart['tipo'], string> = { bar: 'barras', line: 'linhas', scatter: 'dispersão', area: 'área' }

function renderError(message: string): LLMError {
  return new LLMError('E_RENDER', message)
}

/** Linha em branco separa parágrafos; quebra de linha simples vira quebra dentro do parágrafo. */
function textParagraphs(text: string, style: string): Paragraph[] {
  return text.split(/\n{2,}/).map((part) => part.trim()).filter((part) => part !== '').map((part) => new Paragraph({
    style,
    children: part.split('\n').map((line, index) => new TextRun({ text: line.trim(), break: index > 0 ? 1 : undefined }))
  }))
}

function styles(theme: DocxTheme) {
  const run = { font: theme.font, size: theme.bodySize, language: { value: 'pt-BR' } }
  const heading = (level: 1 | 2 | 3) => {
    const token = theme.headings[level]
    return {
      run: { font: theme.font, size: token.size, bold: token.bold, italics: token.italics, allCaps: token.caps },
      paragraph: { alignment: AlignmentType.LEFT, keepNext: true, spacing: { before: token.before, after: token.after } }
    }
  }
  const single = { line: 240, lineRule: LineRuleType.AUTO }
  return {
    default: {
      document: { run, paragraph: { spacing: { line: theme.line, lineRule: LineRuleType.AUTO, after: theme.paragraphAfter } } },
      title: {
        run: { font: theme.font, size: theme.titleSize, bold: true },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 480 } }
      },
      heading1: heading(1),
      heading2: heading(2),
      heading3: heading(3)
    },
    paragraphStyles: [
      {
        id: 'Corpo', name: 'Corpo de texto', basedOn: 'Normal', quickFormat: true,
        paragraph: { alignment: theme.align === 'both' ? AlignmentType.BOTH : AlignmentType.LEFT, indent: { firstLine: theme.firstLineIndent } }
      },
      { id: 'Lista', name: 'Item de lista', basedOn: 'Normal', quickFormat: true, paragraph: { alignment: AlignmentType.LEFT } },
      // Legenda acima da tabela ou figura (NBR 14724) e fonte abaixo, em tamanho menor e entrelinha simples.
      {
        id: 'Legenda', name: 'Legenda', basedOn: 'Normal', quickFormat: true,
        run: { size: theme.captionSize },
        paragraph: { alignment: AlignmentType.LEFT, keepNext: true, keepLines: true, spacing: { ...single, before: 240, after: 120 } }
      },
      {
        id: 'Fonte', name: 'Fonte', basedOn: 'Normal', quickFormat: true,
        run: { size: theme.captionSize },
        paragraph: { alignment: AlignmentType.LEFT, spacing: { ...single, before: 60, after: 240 } }
      },
      {
        id: 'TabelaTexto', name: 'Texto de tabela', basedOn: 'Normal', quickFormat: true,
        run: { size: theme.tableSize },
        paragraph: { alignment: AlignmentType.LEFT, spacing: { ...single, before: 20, after: 20 } }
      }
    ]
  }
}

function numbering() {
  const level = (format: (typeof LevelFormat)[keyof typeof LevelFormat], text: string) => [{
    level: 0, format, text, alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 1134, hanging: 425 } } }
  }]
  return { config: [
    { reference: BULLETS, levels: level(LevelFormat.BULLET, '•') },
    { reference: ORDERED, levels: level(LevelFormat.DECIMAL, '%1.') }
  ] }
}

/**
 * SHA-256 do conteúdo do .docx, independente do relógio: o ZIP e `docProps/core.xml` carregam a data
 * de criação, então o hash cobre o nome e os bytes **descomprimidos** de cada entrada, em ordem
 * alfabética, com as datas do core.xml removidas. Mesma spec + mesma versão do renderer = mesmo hash (P5).
 */
export function contentHash(file: Uint8Array): string {
  const entries = readZip(file)
  const hash = createHash('sha256')
  for (const name of [...entries.keys()].sort()) {
    const raw = entries.get(name)!
    const bytes = name === 'docProps/core.xml'
      ? new TextEncoder().encode(decodeText(raw).replace(/<dcterms:(created|modified)\b[^>]*>[^<]*<\/dcterms:\1>/g, ''))
      : raw
    hash.update(`${name}\0${bytes.length}\0`)
    hash.update(bytes)
  }
  return hash.digest('hex')
}

/**
 * Número no padrão pt-BR (`1.234,5`) preservando as casas decimais do valor. Código próprio, sem
 * `Intl`, para o resultado não depender da versão do ICU do runtime (P5). Só apresentação: nada é
 * arredondado nem calculado (P3). Notação exponencial é mantida como veio.
 */
export function formatNumber(value: number): string {
  const plain = String(value)
  if (!Number.isFinite(value) || /e/i.test(plain)) return plain
  const [integer, fraction] = plain.split('.')
  const sign = integer.startsWith('-') ? '-' : ''
  const grouped = integer.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${grouped}${fraction ? `,${fraction}` : ''}`
}

/** Valor da célula como texto de apresentação (datas `YYYY-MM-DD` viram `dd/mm/aaaa`). */
export function formatCell(value: unknown, type: DatasetColumnType): string {
  if (value === null || value === undefined) return ''
  if (type === 'number' && typeof value === 'number') return formatNumber(value)
  if (type === 'date' && typeof value === 'string') {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : value
  }
  if (type === 'boolean' && typeof value === 'boolean') return value ? 'sim' : 'não'
  return String(value)
}

/** Largura e altura de um PNG, lidas do cabeçalho IHDR (bytes 16 a 24, big-endian). */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  if (png.length < 24 || view.getUint32(0) !== 0x89504e47) throw renderError('A imagem do gráfico não é um PNG válido.')
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

interface RenderState {
  orderedLists: number
  tables: number
  figures: number
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' } as const

function tableBlock(dataset: TabularDataset, legenda: string, at: string, theme: DocxTheme, state: RenderState): Block[] {
  if (dataset.columns.length === 0 || dataset.rows.length === 0) {
    throw renderError(`O dataset "${dataset.id}" do bloco tabela em ${at} não tem ${dataset.columns.length === 0 ? 'colunas' : 'linhas'} para exibir.`)
  }
  const number = ++state.tables
  const rule = { style: BorderStyle.SINGLE, size: 6, color: theme.tableRule }
  const total = usableWidth(theme)
  const each = Math.floor(total / dataset.columns.length)
  const widths = dataset.columns.map((_, index) => index === dataset.columns.length - 1 ? total - each * (dataset.columns.length - 1) : each)

  const cell = (text: string, index: number, options: { bold?: boolean; right?: boolean; header?: boolean }) => new TableCell({
    width: { size: widths[index], type: WidthType.DXA },
    borders: options.header ? { bottom: rule } : undefined,
    children: [new Paragraph({
      style: 'TabelaTexto',
      alignment: options.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new TextRun({ text, bold: options.bold })]
    })]
  })

  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: dataset.columns.map((column, index) => cell(column.name, index, { bold: true, right: column.type === 'number', header: true }))
  })
  const rows = dataset.rows.map((row) => new TableRow({
    cantSplit: true,
    children: dataset.columns.map((column, index) => cell(formatCell(row[column.name], column.type), index, { right: column.type === 'number' }))
  }))
  return [
    new Paragraph({ style: 'Legenda', children: [new TextRun(`Tabela ${number} – ${legenda}`)] }),
    new Table({
      width: { size: total, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      margins: { top: 20, bottom: 20, left: 80, right: 80 },
      // Só linhas horizontais (topo, abaixo do cabeçalho e fim), como nas tabelas ABNT/IBGE.
      borders: { top: rule, bottom: rule, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
      rows: [header, ...rows]
    }),
    new Paragraph({ style: 'Fonte', children: [new TextRun(`Fonte: ${dataset.name}.`)] })
  ]
}

async function figureBlock(chart: Chart, legenda: string, dataset: TabularDataset, theme: DocxTheme, state: RenderState): Promise<Block[]> {
  const number = ++state.figures
  const files = new Map<string, Uint8Array>()
  const artifact = await renderChart(chart, {
    outputDir: 'memoria',
    dataset,
    writeFile: async (path, data) => { files.set(path, typeof data === 'string' ? new TextEncoder().encode(data) : data) }
  })
  const png = files.get(artifact.pngPath)
  if (!png) throw renderError(`O gráfico "${chart.id}" não produziu imagem.`)

  // Proporção preservada, ajustada à largura útil e à altura máxima.
  const natural = pngSize(png)
  const maxWidth = Math.min(natural.width, twipsToPixels(usableWidth(theme)))
  const scale = Math.min(maxWidth / natural.width, MAX_FIGURE_HEIGHT_PX / natural.height)
  const width = Math.max(1, Math.round(natural.width * scale))
  const height = Math.max(1, Math.round(natural.height * scale))

  const image = new ImageRun({
    type: 'png',
    data: png,
    transformation: { width, height },
    // O id vem de um contador global da biblioteca; fixá-lo por figura mantém o documento determinístico.
    altText: { id: String(number), name: `Figura ${number}`, title: chart.titulo, description: `Gráfico de ${CHART_LABEL[chart.tipo]} de ${chart.y.titulo} por ${chart.x.titulo}` }
  })
  return [
    new Paragraph({ style: 'Legenda', children: [new TextRun(`Figura ${number} – ${legenda}`)] }),
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { line: 240, lineRule: LineRuleType.AUTO, before: 0, after: 0 }, children: [image] }),
    new Paragraph({ style: 'Fonte', children: [new TextRun(`Fonte: ${dataset.name}.`)] })
  ]
}

async function renderBlocks(spec: ValidDocxSpec, ctx: DocxRenderContext, theme: DocxTheme): Promise<Block[]> {
  const state: RenderState = { orderedLists: 0, tables: 0, figures: 0 }
  const children: Block[] = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(spec.title)] })]

  for (const [index, bloco] of spec.blocos.entries()) {
    const at = `/blocos/${index}`
    switch (bloco.tipo) {
      case 'heading':
        children.push(new Paragraph({
          heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][bloco.nivel - 1],
          children: [new TextRun(bloco.texto)]
        }))
        break
      case 'paragrafo':
        children.push(...textParagraphs(bloco.texto, 'Corpo'))
        break
      case 'lista': {
        // Cada lista numerada é uma instância própria, para a contagem recomeçar em 1.
        const instance = bloco.ordenada ? ++state.orderedLists : undefined
        for (const item of bloco.itens) {
          children.push(new Paragraph({
            style: 'Lista',
            numbering: { reference: bloco.ordenada ? ORDERED : BULLETS, level: 0, ...(instance ? { instance } : {}) },
            children: [new TextRun(item)]
          }))
        }
        break
      }
      case 'quebra_pagina':
        children.push(new Paragraph({ children: [new PageBreak()] }))
        break
      case 'texto_longo':
        if (bloco.status !== 'gerado' || !bloco.texto) {
          throw renderError(`O bloco texto_longo em ${at} está pendente: execute a etapa LONG_TEXT antes de renderizar.`)
        }
        children.push(...textParagraphs(bloco.texto, 'Corpo'))
        break
      case 'tabela': {
        const dataset = ctx.datasets.get(bloco.datasetId)
        if (!dataset) throw renderError(`O dataset "${bloco.datasetId}" do bloco tabela em ${at} não foi entregue ao renderer.`)
        children.push(...tableBlock(dataset, bloco.legenda, at, theme, state))
        break
      }
      case 'figura': {
        const chart = spec.charts.find((item) => item.id === bloco.chartId)
        if (!chart) throw renderError(`O gráfico "${bloco.chartId}" do bloco figura em ${at} não está em charts.`)
        const dataset = ctx.datasets.get(chart.datasetId)
        if (!dataset) throw renderError(`O dataset "${chart.datasetId}" do gráfico "${chart.id}" (bloco figura em ${at}) não foi entregue ao renderer.`)
        children.push(...await figureBlock(chart, bloco.legenda, dataset, theme, state))
        break
      }
      default: {
        const unknown: never = bloco
        throw renderError(`Tipo de bloco desconhecido em ${at}: ${JSON.stringify(unknown)}.`)
      }
    }
  }
  return children
}

/**
 * Renderiza a spec em .docx. Função pura em relação à rede e ao LLM; o único efeito é gravar um
 * arquivo em `ctx.outputDir`, com nome derivado do título saneado e do hash (nunca de texto bruto).
 */
export async function renderDocx(spec: ValidDocxSpec, ctx: DocxRenderContext): Promise<DocxArtifact> {
  const theme = THEME[spec.preset]
  try {
    const section: ISectionOptions = {
      properties: {
        page: {
          size: { width: A4.width, height: A4.height, orientation: PageOrientation.PORTRAIT },
          margin: { ...theme.margins, header: 709, footer: 709 }
        }
      },
      ...(theme.pageNumber ? {
        headers: {
          default: new Header({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ children: [PageNumber.CURRENT], font: theme.font, size: theme.captionSize })]
            })]
          })
        }
      } : {}),
      children: await renderBlocks(spec, ctx, theme)
    }
    const document = new Document({
      creator: 'autoSlider',
      lastModifiedBy: 'autoSlider',
      title: spec.title,
      description: 'Documento gerado pelo autoSlider',
      styles: styles(theme),
      numbering: numbering(),
      sections: [section]
    })
    const file = new Uint8Array(await Packer.toBuffer(document))
    const hash = contentHash(file)
    const path = `${ctx.outputDir}/${slugText(spec.title)}-${hash.slice(0, 12)}.docx`
    await ctx.writeFile(path, file)
    return { path, hash, rendererVersion: DOCX_RENDERER_VERSION }
  } catch (error: unknown) {
    if (error instanceof LLMError) throw error
    throw renderError(`Falha ao gerar o documento: ${error instanceof Error ? error.message : String(error)}`)
  }
}
