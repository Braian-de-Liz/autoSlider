import { describe, expect, it } from 'bun:test'
import { renderChart, CHART_RENDERER_VERSION } from '../src/render/chart.ts'

const spec = { id: 'vendas', tipo: 'bar' as const, datasetId: 'vendas', x: { campo: 'categoria', titulo: 'Categoria' }, y: { campo: 'valor', titulo: 'Valor', agregacao: 'sum' as const }, titulo: 'Vendas por categoria' }
const dataset = { id: 'vendas', name: 'Vendas', columns: [{ name: 'categoria', type: 'string' as const }, { name: 'valor', type: 'number' as const }], sample: [], rows: [{ categoria: 'A', valor: 10 }, { categoria: 'B', valor: 20 }] }

describe('RF-05: renderer ChartSpec', () => {
  it('gera SVG e PNG com hash e versão do renderer', async () => {
    const files = new Map<string, Uint8Array | string>()
    const artifact = await renderChart(spec, { outputDir: 'artifacts', dataset, writeFile: async (path, data) => { files.set(path, data) } })
    expect(artifact.rendererVersion).toBe(CHART_RENDERER_VERSION)
    expect(artifact.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(files.get(artifact.svgPath)).toBeInstanceOf(Uint8Array)
    expect(files.get(artifact.pngPath)).toBeInstanceOf(Uint8Array)
    expect((files.get(artifact.svgPath) as Uint8Array).length).toBeGreaterThan(100)
    expect((files.get(artifact.pngPath) as Uint8Array)[0]).toBe(137)
  })

  it('é determinístico para a mesma spec e dataset', async () => {
    const files = new Map<string, Uint8Array | string>()
    const context = { outputDir: 'artifacts', dataset, writeFile: async (path: string, data: Uint8Array | string) => { files.set(path, data) } }
    const first = await renderChart(spec, context)
    const second = await renderChart(spec, context)
    expect(second.hash).toBe(first.hash)
    expect(second.svgPath).toBe(first.svgPath)
  })
})
