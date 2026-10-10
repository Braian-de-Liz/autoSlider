import { TypeCompiler } from '@sinclair/typebox/compiler'
import type { Static } from '@sinclair/typebox'
import { ChartSpec } from '../specs/schemas.ts'
import { LLMError } from '../llm/contracts.ts'
import type { DatasetCatalog, TabularDataset } from '../data/catalog.ts'

const validator = TypeCompiler.Compile(ChartSpec)
export type ValidChartSpec = Static<typeof ChartSpec>
export type SemanticSubcode = 'E_REF' | 'E_CAMPO' | 'E_NUMERO_SEM_ORIGEM'

export function validateChartSpec(value: unknown): ValidChartSpec {
  if (validator.Check(value)) return value as ValidChartSpec
  const first = [...validator.Errors(value)][0]
  const path = first?.path || '/'
  throw new LLMError('E_SPEC_SCHEMA', `ChartSpec inválida em ${path}: ${first?.message ?? 'schema não satisfeito'}`, { retryable: true, details: { path, message: first?.message ?? 'schema não satisfeito' } })
}

export function semanticError(subcode: SemanticSubcode, path: string, message: string): LLMError {
  return new LLMError('E_SPEC_SEMANTICA', message, { retryable: true, details: { subcode, path } })
}

export const NUMBER_TOKEN = /\d+(?:[.,]\d+)?/g
export const toNumber = (token: string) => Number(token.replace(',', '.'))

/** Números com origem rastreável: células numéricas, dígitos em células de texto e nomes de coluna. */
export function knownNumbers(dataset: TabularDataset): Set<number> {
  const known = new Set<number>()
  const addTokens = (text: string) => { for (const token of text.match(NUMBER_TOKEN) ?? []) known.add(toNumber(token)) }
  for (const column of dataset.columns) addTokens(column.name)
  for (const row of dataset.rows) {
    for (const value of Object.values(row)) {
      if (typeof value === 'number') known.add(value)
      else if (typeof value === 'string') addTokens(value)
    }
  }
  return known
}

/**
 * Regras da seção 6.4 para ChartSpec. Não corrige a spec; falha com E_SPEC_SEMANTICA
 * e subcódigo E_REF, E_CAMPO ou E_NUMERO_SEM_ORIGEM. Retorna o dataset referenciado.
 *
 * `basePath` prefixa os caminhos dos erros quando o gráfico está embutido em outra spec
 * (ex.: `/charts/0` dentro de um DocxSpec), para o JSON Pointer apontar o campo real.
 */
export function validateChartSemantics(spec: ValidChartSpec, catalog: DatasetCatalog, basePath = ''): TabularDataset {
  const dataset = catalog.get(spec.datasetId)
  if (!dataset) {
    throw semanticError('E_REF', `${basePath}/datasetId`, `O dataset "${spec.datasetId}" não existe no projeto. Disponíveis: ${catalog.list().map((item) => item.id).join(', ')}.`)
  }

  const columns = new Map(dataset.columns.map((column) => [column.name, column.type]))
  const requireColumn = (field: string, path: string) => {
    const type = columns.get(field)
    if (!type) throw semanticError('E_CAMPO', path, `A coluna "${field}" não existe no dataset "${dataset.id}". Colunas: ${[...columns.keys()].join(', ')}.`)
    return type
  }

  requireColumn(spec.x.campo, `${basePath}/x/campo`)
  const yType = requireColumn(spec.y.campo, `${basePath}/y/campo`)
  if (spec.y.agregacao !== 'count' && yType !== 'number') {
    const use = spec.y.agregacao ? `a agregação "${spec.y.agregacao}"` : 'o eixo y sem agregação'
    throw semanticError('E_CAMPO', `${basePath}/y/campo`, `A coluna "${spec.y.campo}" é ${yType}; ${use} exige coluna numérica.`)
  }
  if (spec.serie !== undefined) requireColumn(spec.serie, `${basePath}/serie`)

  const known = knownNumbers(dataset)
  const texts: [string, string][] = [[`${basePath}/titulo`, spec.titulo], [`${basePath}/x/titulo`, spec.x.titulo], [`${basePath}/y/titulo`, spec.y.titulo]]
  for (const [path, text] of texts) {
    for (const token of text.match(NUMBER_TOKEN) ?? []) {
      if (!known.has(toNumber(token))) {
        throw semanticError('E_NUMERO_SEM_ORIGEM', path, `O número "${token}" em ${path} não aparece no dataset "${dataset.id}".`)
      }
    }
  }
  return dataset
}
