import { compile } from 'vega-lite'
import * as vega from 'vega'
import { Resvg } from '@resvg/resvg-js'
import type { Static } from '@sinclair/typebox'
import type { ChartSpec } from '../specs/schemas.ts'
import type { Dataset } from '../llm/contracts.ts'

export const CHART_RENDERER_VERSION = 'chart-vega-resvg@1.0.0'
type Chart = Static<typeof ChartSpec>

type WriteFile = (path: string, data: Uint8Array | string) => Promise<void>

export interface ChartRenderContext {
  outputDir: string
  dataset: Dataset & { rows: Record<string, unknown>[] }
  writeFile: WriteFile
}

export interface ChartArtifact {
  path: string
  svgPath: string
  pngPath: string
  hash: string
  rendererVersion: string
}

function markFor(type: Chart['tipo']): Record<string, unknown> {
  if (type === 'bar') return { type: 'bar' }
  if (type === 'line') return { type: 'line', point: true }
  if (type === 'area') return { type: 'area', line: true }
  return { type: 'point', filled: true, size: 80 }
}

function toVegaLite(spec: Chart, dataset: ChartRenderContext['dataset']): Record<string, unknown> {
  const aggregate = spec.y.agregacao === 'count' ? 'count' : spec.y.agregacao
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    width: 720,
    height: 420,
    title: spec.titulo,
    data: { values: dataset.rows },
    mark: markFor(spec.tipo),
    encoding: {
      x: { field: spec.x.campo, type: 'nominal', title: spec.x.titulo, sort: null },
      y: { field: aggregate === 'count' ? undefined : spec.y.campo, aggregate: aggregate === 'count' ? 'count' : aggregate, type: 'quantitative', title: spec.y.titulo },
      ...(spec.serie ? { color: { field: spec.serie, type: 'nominal' } } : {})
    },
    config: { background: '#0b1120', axis: { labelColor: '#dbeafe', titleColor: '#93c5fd', gridColor: '#26344e' }, title: { color: '#f8fafc' }, view: { stroke: '#334155' } }
  }
}

async function sha256(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function renderChart(spec: Chart, context: ChartRenderContext): Promise<ChartArtifact> {
  const compiled = compile(toVegaLite(spec, context.dataset) as any).spec
  const runtime = vega.parse(compiled)
  const view = new vega.View(runtime, { renderer: 'none' })
  const svg = await view.toSVG()
  const svgBytes = new TextEncoder().encode(svg)
  const pngBytes = new Resvg(svg).render().asPng()
  const hash = await sha256(pngBytes)
  const base = `${context.outputDir}/${spec.id}-${hash.slice(0, 12)}`
  const svgPath = `${base}.svg`
  const pngPath = `${base}.png`
  await context.writeFile(svgPath, svgBytes)
  await context.writeFile(pngPath, pngBytes)
  return { path: pngPath, svgPath, pngPath, hash, rendererVersion: CHART_RENDERER_VERSION }
}
