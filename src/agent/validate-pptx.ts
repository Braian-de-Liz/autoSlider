import { TypeCompiler } from '@sinclair/typebox/compiler'
import type { Static, TSchema } from '@sinclair/typebox'
import { PptxSpec, Slide } from '../specs/schemas.ts'
import { LLMError } from '../llm/contracts.ts'
import type { DatasetCatalog, TabularDataset } from '../data/catalog.ts'
import { checkNumbers, knownNumbers, semanticError, validateChartSemantics } from './validate.ts'

export type ValidPptxSpec = Static<typeof PptxSpec>

const validator = TypeCompiler.Compile(PptxSpec)
const branches = (Slide.anyOf as TSchema[]).map((schema) => ({
  layout: (schema.properties as Record<string, { const?: string }>).layout.const as string,
  validator: TypeCompiler.Compile(schema)
}))
const LAYOUTS = branches.map((branch) => branch.layout)

function schemaError(path: string, message: string): LLMError {
  return new LLMError('E_SPEC_SCHEMA', `PptxSpec inválida em ${path}: ${message}`, { retryable: true, details: { path, message } })
}

/**
 * Erro de união do TypeBox aponta só `/slides/N`. Aqui o ramo é escolhido pelo `layout`,
 * para o modelo receber o campo exato (`/slides/N/itens`) e não "união não satisfeita".
 */
function slideError(index: number, slide: unknown): LLMError {
  const base = `/slides/${index}`
  const layout = slide && typeof slide === 'object' ? (slide as { layout?: unknown }).layout : undefined
  const branch = branches.find((candidate) => candidate.layout === layout)
  if (!branch) return schemaError(`${base}/layout`, `layout inválido; use um de: ${LAYOUTS.join(', ')}`)
  const first = [...branch.validator.Errors(slide)][0]
  return schemaError(`${base}${first?.path ?? ''}`, first?.message ?? 'schema não satisfeito')
}

/** Sintaxe (TypeBox), primeiro slide `titulo` e chaves de `notas` dentro do intervalo de slides (seção 6.4). */
export function validatePptxSpec(value: unknown): ValidPptxSpec {
  if (!validator.Check(value)) {
    const first = [...validator.Errors(value)][0]
    const path = first?.path || '/'
    const match = /^\/slides\/(\d+)$/.exec(path)
    if (match) throw slideError(Number(match[1]), (value as { slides: unknown[] }).slides[Number(match[1])])
    throw schemaError(path, first?.message ?? 'schema não satisfeito')
  }
  const spec = value as ValidPptxSpec
  if (spec.slides[0].layout !== 'titulo') {
    throw schemaError('/slides/0/layout', `o primeiro slide deve usar o layout "titulo" (recebido "${spec.slides[0].layout}")`)
  }
  for (const key of Object.keys(spec.notas ?? {})) {
    const position = Number(key)
    if (!/^\d+$/.test(key) || position < 1 || position > spec.slides.length) {
      throw schemaError(`/notas/${key}`, `a chave deve ser a posição de um slide, de "1" a "${spec.slides.length}"`)
    }
  }
  return spec
}

/** Todo texto do slide que pode conter números, com o JSON Pointer do campo. */
function slideTexts(slide: ValidPptxSpec['slides'][number], base: string): [string, string][] {
  const texts: [string, string][] = [[`${base}/titulo`, slide.titulo]]
  if (slide.layout === 'titulo' && slide.subtitulo !== undefined) texts.push([`${base}/subtitulo`, slide.subtitulo])
  if (slide.layout === 'bullets') slide.itens.forEach((item, i) => texts.push([`${base}/itens/${i}`, item]))
  if (slide.layout === 'duas_colunas') {
    slide.esquerda.forEach((item, i) => texts.push([`${base}/esquerda/${i}`, item]))
    slide.direita.forEach((item, i) => texts.push([`${base}/direita/${i}`, item]))
  }
  return texts
}

/**
 * Regras da seção 6.4 para PptxSpec. Primeiro referências e campos (E_REF, E_CAMPO), em ordem do
 * documento; depois a origem dos números (E_NUMERO_SEM_ORIGEM, RNF-04). Não corrige a spec.
 * Gráfico declarado e não usado é E_REF. Retorna os datasets referenciados, por id.
 */
export function validatePptxSemantics(spec: ValidPptxSpec, catalog: DatasetCatalog): Map<string, TabularDataset> {
  const referenced = new Map<string, TabularDataset>()
  const chartIds = new Set<string>()

  spec.charts.forEach((chart, index) => {
    if (chartIds.has(chart.id)) {
      throw semanticError('E_REF', `/charts/${index}/id`, `O id de gráfico "${chart.id}" está duplicado.`)
    }
    chartIds.add(chart.id)
    const dataset = validateChartSemantics(chart, catalog, `/charts/${index}`)
    referenced.set(dataset.id, dataset)
  })

  const usedCharts = new Set<string>()
  spec.slides.forEach((slide, index) => {
    const base = `/slides/${index}`
    if (slide.layout === 'grafico') {
      if (!chartIds.has(slide.chartId)) {
        throw semanticError('E_REF', `${base}/chartId`, `O gráfico "${slide.chartId}" não está em charts. Declarados: ${[...chartIds].join(', ') || 'nenhum'}.`)
      }
      usedCharts.add(slide.chartId)
    } else if (slide.layout === 'tabela') {
      const dataset = catalog.get(slide.datasetId)
      if (!dataset) {
        throw semanticError('E_REF', `${base}/datasetId`, `O dataset "${slide.datasetId}" não existe no projeto. Disponíveis: ${catalog.list().map((item) => item.id).join(', ')}.`)
      }
      referenced.set(dataset.id, dataset)
    }
  })
  spec.charts.forEach((chart, index) => {
    if (!usedCharts.has(chart.id)) {
      throw semanticError('E_REF', `/charts/${index}/id`, `O gráfico "${chart.id}" está declarado em charts e nenhum slide o usa.`)
    }
  })

  const known = new Set<number>()
  for (const dataset of referenced.values()) for (const number of knownNumbers(dataset)) known.add(number)
  const origin = 'nos datasets referenciados pela apresentação'

  checkNumbers(spec.title, '/title', known, origin)
  spec.slides.forEach((slide, index) => {
    for (const [path, text] of slideTexts(slide, `/slides/${index}`)) checkNumbers(text, path, known, origin)
  })
  for (const [key, text] of Object.entries(spec.notas ?? {})) checkNumbers(text, `/notas/${key}`, known, origin)
  return referenced
}

export function validatePptx(value: unknown, catalog: DatasetCatalog): { spec: ValidPptxSpec; datasets: Map<string, TabularDataset> } {
  const spec = validatePptxSpec(value)
  return { spec, datasets: validatePptxSemantics(spec, catalog) }
}
