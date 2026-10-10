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

  it('colunas com ponto, colchete ou barra (comuns em CSV) renderizam como as demais', async () => {
    const render = async (field: string) => {
      const custom = { ...dataset, columns: [{ name: 'categoria', type: 'string' as const }, { name: field, type: 'number' as const }], rows: [{ categoria: 'A', [field]: 10 }, { categoria: 'B', [field]: 20 }] }
      return await renderChart({ ...spec, y: { ...spec.y, campo: field } }, { outputDir: 'artifacts', dataset: custom, writeFile: async () => {} })
    }
    const reference = await render('vl_total')
    for (const name of ['vl.total', 'vl[0]', 'a\\b']) expect((await render(name)).hash).toBe(reference.hash)
  })

  it('eixo x e série com nomes especiais renderizam os dados, não um gráfico vazio', async () => {
    const render = async (x: string, serie: string) => {
      const custom = { ...dataset, columns: [{ name: x, type: 'string' as const }, { name: serie, type: 'string' as const }, { name: 'valor', type: 'number' as const }], rows: [{ [x]: 'A', [serie]: 'S1', valor: 10 }, { [x]: 'B', [serie]: 'S2', valor: 20 }] }
      let svg = ''
      const artifact = await renderChart({ ...spec, x: { ...spec.x, campo: x }, serie }, { outputDir: 'artifacts', dataset: custom, writeFile: async (path, data) => { if (path.endsWith('.svg')) svg = new TextDecoder().decode(data as Uint8Array) } })
      return { hash: artifact.hash, svg }
    }
    const reference = await render('cat_x', 'canal')
    // Só o nome do eixo x muda: o gráfico é idêntico.
    expect((await render('cat.x', 'canal')).hash).toBe(reference.hash)
    expect((await render('cat\\x', 'canal')).hash).toBe(reference.hash)
    // Com série de nome especial, a legenda mostra o nome da coluna e as duas séries existem.
    const special = await render('cat_x', 'canal[0].s')
    expect(special.svg).toContain('canal[0].s')
    expect(special.svg).toContain('S1')
    expect(special.svg).toContain('S2')
    expect(new Set([...special.svg.matchAll(/aria-roledescription="bar"[^>]*fill="(#[0-9a-f]+)"/g)].map((match) => match[1])).size).toBe(2)
  })

  it('os textos do gráfico são desenhados no PNG: títulos diferentes dão imagens diferentes', async () => {
    // Sem fonte, o resvg-wasm desenharia o gráfico sem nenhum rótulo e sem erro (ADR-021).
    const render = async (titulo: string, eixo: string) => await renderChart({ ...spec, titulo, x: { ...spec.x, titulo: eixo } }, { outputDir: 'artifacts', dataset, writeFile: async () => {} })
    const base = await render('Vendas por categoria', 'Categoria')
    expect((await render('Resultado por região', 'Categoria')).hash).not.toBe(base.hash)
    expect((await render('Vendas por categoria', 'Produto')).hash).not.toBe(base.hash)
  })

  it('o SVG usa a fonte embutida e o PNG é decodificável', async () => {
    let svg = ''
    let png: Uint8Array = new Uint8Array()
    const artifact = await renderChart(spec, { outputDir: 'artifacts', dataset, writeFile: async (path, data) => { if (path.endsWith('.svg')) svg = new TextDecoder().decode(data as Uint8Array); else png = data as Uint8Array } })
    expect(svg).toContain('DejaVu Sans')
    expect(new DataView(png.buffer, png.byteOffset).getUint32(16)).toBeGreaterThan(700)
    expect(artifact.rendererVersion).toBe('chart-vega-resvg-wasm@2.0.0')
  })

  it('o id da spec, que vem do modelo, não vira caminho no nome do arquivo', async () => {
    const artifact = await renderChart({ ...spec, id: '..\\..\\fora/evil' }, { outputDir: 'artifacts/run', dataset, writeFile: async () => {} })
    for (const path of [artifact.pngPath, artifact.svgPath]) {
      expect(path.startsWith('artifacts/run/')).toBe(true)
      expect(path.slice('artifacts/run/'.length)).not.toMatch(/[\\/]|\.\./)
    }
  })
})
