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

function semanticError(subcode: SemanticSubcode, path: string, message: string): LLMError {
  return new LLMError('E_SPEC_SEMANTICA', message, { retryable: true, details: { subcode, path } })
}

const NUMBER_TOKEN = /\d+(?:[.,]\d+)?/g
const toNumber = (token: string) => Number(token.replace(',', '.'))

/** Números com origem rastreável: células numéricas, dígitos em células de texto e nomes de coluna. */
function knownNumbers(dataset: TabularDataset): Set<number> {
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
 */
export function validateChartSemantics(spec: ValidChartSpec, catalog: DatasetCatalog): TabularDataset {
  const dataset = catalog.get(spec.datasetId)
  if (!dataset) {
    throw semanticError('E_REF', '/datasetId', `O dataset "${spec.datasetId}" não existe no projeto. Disponíveis: ${catalog.list().map((item) => item.id).join(', ')}.`)
  }

  const columns = new Map(dataset.columns.map((column) => [column.name, column.type]))
  const requireColumn = (field: string, path: string) => {
    const type = columns.get(field)
    if (!type) throw semanticError('E_CAMPO', path, `A coluna "${field}" não existe no dataset "${dataset.id}". Colunas: ${[...columns.keys()].join(', ')}.`)
    return type
  }

  requireColumn(spec.x.campo, '/x/campo')
  const yType = requireColumn(spec.y.campo, '/y/campo')
  if (spec.y.agregacao !== 'count' && yType !== 'number') {
    const use = spec.y.agregacao ? `a agregação "${spec.y.agregacao}"` : 'o eixo y sem agregação'
    throw semanticError('E_CAMPO', '/y/campo', `A coluna "${spec.y.campo}" é ${yType}; ${use} exige coluna numérica.`)
  }
  if (spec.serie !== undefined) requireColumn(spec.serie, '/serie')

  const known = knownNumbers(dataset)
  const texts: [string, string][] = [['/titulo', spec.titulo], ['/x/titulo', spec.x.titulo], ['/y/titulo', spec.y.titulo]]
  for (const [path, text] of texts) {
    for (const token of text.match(NUMBER_TOKEN) ?? []) {
      if (!known.has(toNumber(token))) {
        throw semanticError('E_NUMERO_SEM_ORIGEM', path, `O número "${token}" em ${path} não aparece no dataset "${dataset.id}".`)
      }
    }
  }
  return dataset
}
