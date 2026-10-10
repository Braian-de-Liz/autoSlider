import { TypeCompiler } from '@sinclair/typebox/compiler'
import type { Static, TSchema } from '@sinclair/typebox'
import { Bloco, DocxSpec } from '../specs/schemas.ts'
import { LLMError } from '../llm/contracts.ts'
import type { DatasetCatalog, TabularDataset } from '../data/catalog.ts'
import { NUMBER_TOKEN, knownNumbers, semanticError, toNumber, validateChartSemantics } from './validate.ts'

export type ValidDocxSpec = Static<typeof DocxSpec>

export interface DocxSemanticOptions {
  /**
   * Identificadores de cálculo conhecidos. Vazio até existir `calc/` (Task 14):
   * enquanto isso, todo `calcId` falha com E_REF em vez de ser aceito sem origem (P6).
   */
  calcIds?: ReadonlySet<string>
}

const validator = TypeCompiler.Compile(DocxSpec)
const branches = (Bloco.anyOf as TSchema[]).map((schema) => ({
  tipo: (schema.properties as Record<string, { const?: string }>).tipo.const as string,
  validator: TypeCompiler.Compile(schema)
}))
const BLOCK_TYPES = branches.map((branch) => branch.tipo)

function schemaError(path: string, message: string): LLMError {
  return new LLMError('E_SPEC_SCHEMA', `DocxSpec inválida em ${path}: ${message}`, { retryable: true, details: { path, message } })
}

/**
 * Erro de união do TypeBox aponta só `/blocos/N`. Aqui o ramo é escolhido pelo `tipo`,
 * para o modelo receber o campo exato (`/blocos/N/texto`) e não "união não satisfeita".
 */
function blockError(index: number, block: unknown): LLMError {
  const base = `/blocos/${index}`
  const tipo = block && typeof block === 'object' ? (block as { tipo?: unknown }).tipo : undefined
  const branch = branches.find((candidate) => candidate.tipo === tipo)
  if (!branch) {
    return schemaError(`${base}/tipo`, `tipo de bloco inválido; use um de: ${BLOCK_TYPES.join(', ')}`)
  }
  const first = [...branch.validator.Errors(block)][0]
  return schemaError(`${base}${first?.path ?? ''}`, first?.message ?? 'schema não satisfeito')
}

/** Validação sintática (TypeBox) e coerência entre `status` e `texto` dos blocos `texto_longo` (seção 6.8). */
export function validateDocxSpec(value: unknown): ValidDocxSpec {
  if (!validator.Check(value)) {
    const first = [...validator.Errors(value)][0]
    const path = first?.path || '/'
    const match = /^\/blocos\/(\d+)$/.exec(path)
    if (match) throw blockError(Number(match[1]), (value as { blocos: unknown[] }).blocos[Number(match[1])])
    throw schemaError(path, first?.message ?? 'schema não satisfeito')
  }
  const spec = value as ValidDocxSpec
  spec.blocos.forEach((bloco, index) => {
    if (bloco.tipo !== 'texto_longo') return
    if (bloco.status === 'gerado' && !bloco.texto?.trim()) {
      throw schemaError(`/blocos/${index}/texto`, 'bloco texto_longo com status "gerado" exige texto não vazio')
    }
    if (bloco.status === 'pendente' && bloco.texto !== undefined) {
      throw schemaError(`/blocos/${index}/texto`, 'bloco texto_longo com status "pendente" não pode ter texto')
    }
  })
  return spec
}

function checkNumbers(text: string, path: string, known: Set<number>, origin: string): void {
  for (const token of text.match(NUMBER_TOKEN) ?? []) {
    if (!known.has(toNumber(token))) {
      throw semanticError('E_NUMERO_SEM_ORIGEM', path, `O número "${token}" em ${path} não aparece ${origin}.`)
    }
  }
}

/**
 * Regras da seção 6.4 para DocxSpec. Primeiro referências e campos (E_REF, E_CAMPO), em ordem do
 * documento; depois a origem dos números (E_NUMERO_SEM_ORIGEM, RNF-04). Não corrige a spec.
 * Retorna os datasets referenciados pelo documento, por id.
 */
export function validateDocxSemantics(spec: ValidDocxSpec, catalog: DatasetCatalog, options: DocxSemanticOptions = {}): Map<string, TabularDataset> {
  const calcIds = options.calcIds ?? new Set<string>()
  const referenced = new Map<string, TabularDataset>()
  const chartIds = new Set<string>()
  const require = (datasetId: string, path: string): TabularDataset => {
    const dataset = catalog.get(datasetId)
    if (!dataset) {
      throw semanticError('E_REF', path, `O dataset "${datasetId}" não existe no projeto. Disponíveis: ${catalog.list().map((item) => item.id).join(', ')}.`)
    }
    referenced.set(dataset.id, dataset)
    return dataset
  }

  spec.charts.forEach((chart, index) => {
    if (chartIds.has(chart.id)) {
      throw semanticError('E_REF', `/charts/${index}/id`, `O id de gráfico "${chart.id}" está duplicado.`)
    }
    chartIds.add(chart.id)
    const dataset = validateChartSemantics(chart, catalog, `/charts/${index}`)
    referenced.set(dataset.id, dataset)
  })

  spec.blocos.forEach((bloco, index) => {
    const base = `/blocos/${index}`
    if (bloco.tipo === 'tabela') {
      require(bloco.datasetId, `${base}/datasetId`)
    } else if (bloco.tipo === 'figura') {
      if (!chartIds.has(bloco.chartId)) {
        throw semanticError('E_REF', `${base}/chartId`, `O gráfico "${bloco.chartId}" não está em charts. Declarados: ${[...chartIds].join(', ') || 'nenhum'}.`)
      }
    } else if (bloco.tipo === 'texto_longo') {
      bloco.fontes.forEach((fonte, position) => {
        const path = `${base}/fontes/${position}`
        if (fonte.datasetId === undefined && fonte.calcId === undefined) {
          throw semanticError('E_REF', path, 'A fonte não informa datasetId nem calcId.')
        }
        if (fonte.datasetId !== undefined) require(fonte.datasetId, `${path}/datasetId`)
        if (fonte.calcId !== undefined && !calcIds.has(fonte.calcId)) {
          throw semanticError('E_REF', `${path}/calcId`, `O cálculo "${fonte.calcId}" não existe: nenhum cálculo está registrado.`)
        }
      })
    }
  })

  const known = new Set<number>()
  for (const dataset of referenced.values()) for (const number of knownNumbers(dataset)) known.add(number)
  const origin = 'nos datasets referenciados pelo documento'

  checkNumbers(spec.title, '/title', known, origin)
  spec.blocos.forEach((bloco, index) => {
    const base = `/blocos/${index}`
    if (bloco.tipo === 'heading' || bloco.tipo === 'paragrafo') {
      checkNumbers(bloco.texto, `${base}/texto`, known, origin)
    } else if (bloco.tipo === 'lista') {
      bloco.itens.forEach((item, position) => checkNumbers(item, `${base}/itens/${position}`, known, origin))
    } else if (bloco.tipo === 'tabela' || bloco.tipo === 'figura') {
      checkNumbers(bloco.legenda, `${base}/legenda`, known, origin)
    } else if (bloco.tipo === 'texto_longo' && bloco.texto !== undefined) {
      // Texto longo só pode usar números das próprias fontes (seção 8.1).
      const own = new Set<number>()
      for (const fonte of bloco.fontes) {
        const dataset = fonte.datasetId === undefined ? undefined : referenced.get(fonte.datasetId)
        if (dataset) for (const number of knownNumbers(dataset)) own.add(number)
      }
      checkNumbers(bloco.texto, `${base}/texto`, own, 'nas fontes do próprio bloco')
    }
  })
  return referenced
}

export function validateDocx(value: unknown, catalog: DatasetCatalog, options: DocxSemanticOptions = {}): { spec: ValidDocxSpec; datasets: Map<string, TabularDataset> } {
  const spec = validateDocxSpec(value)
  return { spec, datasets: validateDocxSemantics(spec, catalog, options) }
}
