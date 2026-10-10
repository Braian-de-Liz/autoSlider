import { LLMError, type SourceUnit } from '../llm/contracts.ts'
import { makeDataset, type TabularDataset } from '../data/catalog.ts'
import { allocateId, assertSize, baseName, decodeUtf8, sha256Hex, slugify, toSourceDataset } from './common.ts'
import { inferTable } from './csv.ts'
import type { IngestInput, IngestOptions, IngestedSource } from './types.ts'

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/

function invalid(message: string): LLMError {
  return new LLMError('E_INGEST_INVALIDO', message)
}

function splitRow(line: string): string[] {
  let row = line.trim()
  if (row.startsWith('|')) row = row.slice(1)
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1)
  return row.split(/(?<!\\)\|/).map((cell) => cell.replaceAll('\\|', '|'))
}

/** Texto puro da célula: sem link, negrito, itálico nem código. */
function cleanCell(cell: string): string {
  return cell
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim()
}

interface Section { title?: string; lines: string[] }

/**
 * Markdown em `SourceDoc`: uma unidade por seção ATX (`#` a `######`) e uma por texto anterior ao
 * primeiro título. Cada tabela GFM com linhas vira um dataset e, no texto da unidade, é trocada por
 * um marcador: as linhas de dados nunca chegam aos trechos do prompt (RF-11). Cercas de código ficam
 * como texto, sem título nem tabela dentro delas.
 */
export function ingestMarkdown(input: IngestInput, options: IngestOptions = {}): IngestedSource {
  assertSize(input.bytes, input.name)
  const file = baseName(input.name)
  const lines = decodeUtf8(input.bytes, input.name).replace(/\r\n?/g, '\n').split('\n')
  const taken = options.takenIds ?? new Set<string>()
  const docId = allocateId(slugify(input.name), taken)
  const origin = { path: input.path ?? input.name, sha256: sha256Hex(input.bytes) }

  const sections: Section[] = [{ lines: [] }]
  const datasets: TabularDataset[] = []
  let fence: { char: string; length: number } | undefined

  const addTable = (section: Section, header: string[], body: string[][]): void => {
    const number = datasets.length + 1
    const label = `tabela ${number} de "${file}"`
    header.forEach((name, column) => { if (name === '') throw invalid(`A coluna ${column + 1} da ${label} não tem nome.`) })
    const duplicate = header.find((name, column) => header.indexOf(name) !== column)
    if (duplicate !== undefined) throw invalid(`A coluna "${duplicate}" aparece mais de uma vez na ${label}.`)
    body.forEach((row, index) => {
      if (row.length !== header.length) throw invalid(`A linha ${index + 1} da ${label} tem ${row.length} células; o cabeçalho tem ${header.length}.`)
    })
    const { columns, rows } = inferTable(header, body, ['pt-BR', 'en'])
    const id = allocateId(`${docId}-tabela-${number}`, taken)
    const name = section.title ? `${section.title} (tabela ${number})` : `Tabela ${number}`
    datasets.push(makeDataset(id, name, columns, rows, origin))
    section.lines.push(`[tabela: ${id} (colunas: ${header.join(', ')}; ${rows.length} linhas)]`)
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const section = sections[sections.length - 1]
    if (fence) {
      section.lines.push(line)
      const close = FENCE.exec(line)
      if (close && close[1][0] === fence.char && close[1].length >= fence.length && line.trim() === close[1]) fence = undefined
      continue
    }
    const open = FENCE.exec(line)
    if (open) {
      fence = { char: open[1][0], length: open[1].length }
      section.lines.push(line)
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      sections.push({ title: heading[2].trim(), lines: [] })
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('|') && SEPARATOR.test(lines[i + 1])) {
      const header = splitRow(line).map(cleanCell)
      if (splitRow(lines[i + 1]).length !== header.length) {
        throw invalid(`A tabela ${datasets.length + 1} de "${file}" tem ${splitRow(lines[i + 1]).length} colunas na linha separadora e ${header.length} no cabeçalho.`)
      }
      let end = i + 2
      while (end < lines.length && lines[end].trim() !== '' && lines[end].includes('|')) end++
      const body = lines.slice(i + 2, end).map((row) => splitRow(row).map(cleanCell))
      if (body.length === 0) {
        section.lines.push(line, lines[i + 1])
      } else {
        addTable(section, header, body)
      }
      i = end - 1
      continue
    }
    section.lines.push(line)
  }

  const units: SourceUnit[] = []
  for (const section of sections) {
    const body = section.lines.join('\n').trim()
    if (section.title === undefined && body === '') continue
    units.push({
      index: units.length + 1,
      kind: 'document',
      text: [section.title, body].filter((part): part is string => !!part).join('\n\n'),
      ...(section.title ? { title: section.title } : {})
    })
  }
  if (units.length === 0) throw invalid(`O arquivo "${file}" está vazio.`)
  return { doc: { id: docId, name: file, format: 'md', units, datasets: datasets.map(toSourceDataset) }, datasets }
}
