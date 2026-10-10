import { LLMError, type DatasetColumn, type DatasetColumnType } from '../llm/contracts.ts'
import { makeDataset, type TabularDataset } from '../data/catalog.ts'
import { allocateId, assertSize, baseName, decodeUtf8, sha256Hex, slugify, stem, toSourceDataset } from './common.ts'
import type { CsvOptions, IngestInput, IngestedSource, NumberLocale } from './types.ts'

export type { NumberLocale } from './types.ts'

const DELIMITERS = [',', ';', '\t'] as const

function invalid(message: string): LLMError {
  return new LLMError('E_INGEST_INVALIDO', message)
}

/** Conta `,` `;` e tab fora de aspas na primeira linha lógica. Empate: `,` antes de `;` antes de tab. */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((delimiter) => [delimiter, 0]))
  let inQuotes = false
  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes
    else if (!inQuotes && (char === '\n' || char === '\r')) break
    else if (!inQuotes && counts.has(char)) counts.set(char, counts.get(char)! + 1)
  }
  let best: string = ','
  for (const delimiter of DELIMITERS) if (counts.get(delimiter)! > counts.get(best)!) best = delimiter
  return best
}

/**
 * Parser RFC 4180: aspas, `""` escapado, quebra de linha dentro de aspas, CRLF/LF/CR.
 * Linhas em branco são ignoradas. A aspa só abre campo no início dele; aspas abertas sem fechar são erro.
 */
export function parseCsv(text: string, delimiter: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let inQuotes = false
  let wasQuoted = false
  let atFieldStart = true

  const pushField = () => {
    record.push(field)
    field = ''
    wasQuoted = false
    atFieldStart = true
  }
  const endRecord = () => {
    const blank = record.length === 0 && field === '' && !wasQuoted
    if (!blank) {
      pushField()
      records.push(record)
    }
    record = []
    atFieldStart = true
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += char
      continue
    }
    if (char === '"' && atFieldStart) { inQuotes = true; wasQuoted = true; atFieldStart = false; continue }
    if (char === delimiter) { pushField(); continue }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++
      endRecord()
      continue
    }
    field += char
    atFieldStart = false
  }
  if (inQuotes) throw invalid('Aspas abertas sem fechar no CSV.')
  if (record.length > 0 || field !== '' || wasQuoted) endRecord()
  return records
}

const NUMBER_EN = /^-?(?:0|[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d*)(?:\.\d+)?$/
const NUMBER_PT = /^-?(?:0|[1-9]\d{0,2}(?:\.\d{3})+|[1-9]\d*)(?:,\d+)?$/

/** Aceita só decimais simples com separador de milhar correto; moeda, `%` e notação científica ficam como texto. */
export function parseNumber(value: string, locale: NumberLocale): number | undefined {
  if (locale === 'en') return NUMBER_EN.test(value) ? Number(value.replaceAll(',', '')) : undefined
  return NUMBER_PT.test(value) ? Number(value.replaceAll('.', '').replace(',', '.')) : undefined
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** `YYYY-MM-DD` em qualquer locale; `dd/mm/yyyy` só quando pt-BR é aceito. Devolve `YYYY-MM-DD`. */
export function parseDate(value: string, locales: readonly NumberLocale[]): string | undefined {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (iso) return validCalendarDate(+iso[1], +iso[2], +iso[3]) ? value : undefined
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (br && locales.includes('pt-BR') && validCalendarDate(+br[3], +br[2], +br[1])) return `${br[3]}-${br[2]}-${br[1]}`
  return undefined
}

interface ColumnPlan { type: DatasetColumnType; convert: (value: string) => unknown }

function planColumn(values: string[], locales: readonly NumberLocale[]): ColumnPlan {
  const text: ColumnPlan = { type: 'string', convert: (value) => value }
  if (values.length === 0) return text
  if (values.every((value) => /^(true|false)$/i.test(value))) return { type: 'boolean', convert: (value) => value.toLowerCase() === 'true' }
  for (const locale of locales) {
    if (values.every((value) => parseNumber(value, locale) !== undefined)) return { type: 'number', convert: (value) => parseNumber(value, locale) }
  }
  if (values.every((value) => parseDate(value, locales) !== undefined)) return { type: 'date', convert: (value) => parseDate(value, locales) }
  return text
}

/**
 * Tipos e valores de uma tabela de texto. Célula vazia vira `null`. Tenta os `locales` na ordem,
 * por coluna: o CSV passa um só (derivado do delimitador); o Markdown passa `['pt-BR', 'en']`.
 */
export function inferTable(header: string[], records: string[][], locales: readonly NumberLocale[]): { columns: DatasetColumn[]; rows: Record<string, unknown>[] } {
  const plans = header.map((_, column) => planColumn(records.map((record) => record[column].trim()).filter((value) => value !== ''), locales))
  const columns = header.map((name, column) => ({ name, type: plans[column].type }))
  const rows = records.map((record) => Object.fromEntries(header.map((name, column) => {
    const value = record[column].trim()
    return [name, value === '' ? null : plans[column].convert(value)]
  })))
  return { columns, rows }
}

export function ingestCsv(input: IngestInput, options: CsvOptions = {}): IngestedSource {
  assertSize(input.bytes, input.name)
  const text = decodeUtf8(input.bytes, input.name)
  const delimiter = options.delimiter ?? detectDelimiter(text)
  const locale = options.locale ?? (delimiter === ';' ? 'pt-BR' : 'en')
  const records = parseCsv(text, delimiter)
  const file = baseName(input.name)

  if (records.length === 0) throw invalid(`O arquivo "${file}" está vazio.`)
  const header = records[0].map((name) => name.trim())
  header.forEach((name, column) => { if (name === '') throw invalid(`A coluna ${column + 1} de "${file}" não tem nome.`) })
  const seen = new Set<string>()
  for (const name of header) {
    if (seen.has(name)) throw invalid(`A coluna "${name}" aparece mais de uma vez em "${file}".`)
    seen.add(name)
  }
  if (records.length === 1) throw invalid(`O arquivo "${file}" só tem o cabeçalho, sem linhas de dados.`)
  const body = records.slice(1)
  body.forEach((record, index) => {
    if (record.length !== header.length) {
      throw invalid(`O registro ${index + 2} de "${file}" tem ${record.length} colunas; o cabeçalho tem ${header.length}.`)
    }
  })

  const taken = options.takenIds ?? new Set<string>()
  const id = allocateId(slugify(input.name), taken)
  const { columns, rows } = inferTable(header, body, [locale])
  const dataset: TabularDataset = makeDataset(id, stem(input.name), columns, rows, { path: input.path ?? input.name, sha256: sha256Hex(input.bytes) })
  return { doc: { id, name: file, format: 'csv', units: [], datasets: [toSourceDataset(dataset)] }, datasets: [dataset] }
}
