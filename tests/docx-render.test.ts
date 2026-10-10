import { describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { validateDocx, type ValidDocxSpec } from '../src/agent/validate-docx.ts'
import { DatasetCatalog, SAMPLE_DATASETS, makeDataset, type TabularDataset } from '../src/data/catalog.ts'
import { renderCommand } from '../src/commands/render.ts'
import { ingestFile } from '../src/ingest/index.ts'
import { LLMError } from '../src/llm/contracts.ts'
import { DOCX_RENDERER_VERSION, formatCell, formatNumber, pngSize, renderDocx } from '../src/render/docx.ts'
import { usableWidth, THEME } from '../src/render/theme.ts'
import { bodyElements, documentDefaults, drawings, pageMargins, pageSize, paragraphs, pngDimensions, styleXml, tableInfo, tableRows } from './support/docx-xml.ts'
import { readZip, text } from './support/read-zip.ts'

const FIXTURES = join(import.meta.dirname ?? '.', '..', 'specs', 'fixtures', 'docx')
const fixturePath = (name: string) => join(FIXTURES, name)
const fixture = (name: string) => JSON.parse(readFileSync(fixturePath(name), 'utf8')) as Record<string, any>
const catalog = new DatasetCatalog(SAMPLE_DATASETS)

interface Rendered { hash: string; path: string; rendererVersion: string; file: Uint8Array; zip: Map<string, Uint8Array>; document: string; styles: string }

/** Valida a spec, renderiza em memória e abre o ZIP. */
async function render(value: unknown, outputDir = 'saida'): Promise<Rendered> {
  const { spec, datasets } = validateDocx(value, catalog)
  return await renderSpec(spec, datasets, outputDir)
}

async function renderSpec(spec: ValidDocxSpec, datasets: Map<string, TabularDataset> = new Map(), outputDir = 'saida'): Promise<Rendered> {
  let file: Uint8Array = new Uint8Array()
  const artifact = await renderDocx(spec, { outputDir, datasets, writeFile: (_path, data) => { file = data } })
  const zip = readZip(file)
  return { ...artifact, file, zip, document: text(zip.get('word/document.xml')), styles: text(zip.get('word/styles.xml')) }
}

/** Spec mínima válida, montada à mão para testes que não dependem de dataset. */
const handSpec = (blocos: unknown[], extra: Record<string, unknown> = {}): ValidDocxSpec => ({
  specVersion: '1.0', kind: 'docx', title: 'Título de teste', lang: 'pt-BR', preset: 'abnt', charts: [], blocos, ...extra
}) as ValidDocxSpec

function failure(promise: Promise<unknown>): Promise<LLMError> {
  return promise.then(() => { throw new Error('esperava um erro e nada foi lançado') }, (error: unknown) => {
    if (error instanceof LLMError) return error
    throw error
  })
}

async function inTempDir<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = mkdtempSync(join(tmpdir(), 'autoslider-render-'))
  try { return await fn(cwd) } finally { rmSync(cwd, { recursive: true, force: true }) }
}

const result = await render(fixture('relatorio.json'))

describe('RF-04: renderer docx ABNT (seção 10)', () => {
  it('gera um ZIP OOXML com as partes obrigatórias', () => {
    for (const part of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'docProps/core.xml']) expect(result.zip.has(part)).toBe(true)
    expect(text(result.zip.get('[Content_Types].xml'))).toContain('wordprocessingml.document.main+xml')
    expect(result.rendererVersion).toBe(DOCX_RENDERER_VERSION)
    expect(result.path).toMatch(/^saida\/relatorio-de-vendas-por-categoria-[a-f0-9]{12}\.docx$/)
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('página A4 com margens de 3 cm (superior e esquerda) e 2 cm (inferior e direita)', () => {
    expect(pageSize(result.document)).toEqual({ width: 11906, height: 16838 })
    expect(pageMargins(result.document)).toEqual({ top: 1701, left: 1701, bottom: 1134, right: 1134 })
  })

  it('fonte Times New Roman 12 pt, entrelinha 1,5 e idioma pt-BR como padrão do documento', () => {
    expect(documentDefaults(result.styles)).toEqual({ font: 'Times New Roman', size: 24, line: 360, language: 'pt-BR' })
  })

  it('corpo justificado com recuo de 1,25 cm na primeira linha', () => {
    const corpo = styleXml(result.styles, 'Corpo')
    expect(corpo).toContain('<w:jc w:val="both"/>')
    expect(corpo).toContain('w:firstLine="709"')
    const body = paragraphs(result.document).filter((paragraph) => paragraph.style === 'Corpo')
    expect(body.length).toBeGreaterThanOrEqual(4)
  })

  it('título centralizado, em negrito e primeiro no documento', () => {
    const [first] = bodyElements(result.document)
    expect(first).toMatchObject({ kind: 'p', style: 'Title', text: 'Relatório de vendas por categoria' })
    const title = styleXml(result.styles, 'Title')
    expect(title).toContain('<w:jc w:val="center"/>')
    expect(title).toContain('<w:b/>')
    expect(title).toContain('<w:sz w:val="28"/>')
  })

  it('títulos na ordem do documento, com o estilo do nível', () => {
    const headings = paragraphs(result.document).filter((paragraph) => /^Heading\d$/.test(paragraph.style ?? ''))
    expect(headings.map((heading) => [heading.style, heading.text])).toEqual([
      ['Heading1', 'Resumo'], ['Heading1', 'Análise'], ['Heading2', 'Observações gerais'], ['Heading3', 'Pontos de atenção'], ['Heading3', 'Próximos passos'], ['Heading1', 'Conclusão']
    ])
    const h1 = styleXml(result.styles, 'Heading1')
    expect(h1).toContain('<w:caps/>')
    expect(h1).toContain('<w:b/>')
    expect(h1).toContain('<w:sz w:val="24"/>')
    expect(styleXml(result.styles, 'Heading2')).toContain('<w:b/>')
    const h3 = styleXml(result.styles, 'Heading3')
    expect(h3).toContain('<w:i/>')
    expect(h3).toContain('<w:b w:val="false"/>')
    // O texto da spec não é alterado: a caixa alta vem da formatação.
    expect(headings[0].text).toBe('Resumo')
  })

  it('texto_longo gerado vira parágrafos de corpo, divididos na linha em branco, sem rótulo extra', () => {
    const body = paragraphs(result.document).filter((paragraph) => paragraph.style === 'Corpo').map((paragraph) => paragraph.text)
    expect(body.slice(0, 2)).toEqual(['O maior valor registrado foi 120, na categoria Eletrônicos.', 'A menor categoria foi Papelaria, com 25 na região Norte.'])
    expect(body.at(-1)).toBe('A categoria Eletrônicos teve a maior soma, com 120 na região Sul.')
    expect(result.document).not.toContain('texto_longo')
    expect(result.document).not.toContain('pendente')
  })

  it('listas: marcadores e numeração, cada lista numerada com a sua própria contagem', () => {
    const items = paragraphs(result.document).filter((paragraph) => paragraph.style === 'Lista')
    expect(items.map((item) => item.text)).toEqual([
      'Eletrônicos lidera nas duas regiões', 'Móveis fica em segundo lugar', 'Papelaria tem os menores valores',
      'Revisar os dados do período', 'Atualizar as metas', 'Publicar o relatório'
    ])
    expect(new Set(items.slice(0, 3).map((item) => item.numId)).size).toBe(1)
    expect(new Set(items.slice(3).map((item) => item.numId)).size).toBe(1)
    expect(items[0].numId).not.toBe(items[3].numId)
    const numbering = text(result.zip.get('word/numbering.xml'))
    expect(numbering).toContain('<w:numFmt w:val="bullet"/>')
    expect(numbering).toContain('<w:numFmt w:val="decimal"/>')
  })

  it('duas listas numeradas seguidas não continuam a contagem uma da outra', async () => {
    const two = await renderSpec(handSpec([
      { tipo: 'lista', ordenada: true, itens: ['a', 'b'] },
      { tipo: 'lista', ordenada: true, itens: ['c', 'd'] }
    ]))
    const items = paragraphs(two.document).filter((paragraph) => paragraph.style === 'Lista')
    expect(items[0].numId).toBe(items[1].numId)
    expect(items[2].numId).toBe(items[3].numId)
    expect(items[0].numId).not.toBe(items[2].numId)
  })

  it('quebra de página entre as listas e a conclusão', () => {
    const all = paragraphs(result.document)
    const breaks = all.filter((paragraph) => paragraph.pageBreak)
    expect(breaks).toHaveLength(1)
    const position = all.indexOf(breaks[0])
    expect(all[position - 1].text).toBe('Publicar o relatório')
    expect(all[position + 1]).toMatchObject({ style: 'Heading1', text: 'Conclusão' })
  })

  it('número de página no canto superior direito, em 10 pt', () => {
    const headerName = [...result.zip.keys()].find((name) => /^word\/header\d+\.xml$/.test(name))!
    const header = text(result.zip.get(headerName))
    expect(header).toContain('<w:instrText xml:space="preserve">PAGE</w:instrText>')
    expect(header).toContain('<w:jc w:val="right"/>')
    expect(header).toContain('<w:sz w:val="20"/>')
    expect(result.document).toContain('<w:headerReference')
  })

  it('metadados do documento', () => {
    const core = text(result.zip.get('docProps/core.xml'))
    expect(core).toContain('<dc:title>Relatório de vendas por categoria</dc:title>')
    expect(core).toContain('<dc:creator>autoSlider</dc:creator>')
  })

  it('acentos, & < > e aspas chegam intactos ao XML', async () => {
    const original = 'Fatura & Cia <alfa> disse "oi" e \'tchau\' — ação, coração, ÃÕÜ.'
    const special = await renderSpec(handSpec([{ tipo: 'paragrafo', texto: original }, { tipo: 'heading', nivel: 2, texto: 'A&B <C>' }], { title: 'Título & <teste>' }))
    expect(special.document).toContain('Fatura &amp; Cia &lt;alfa&gt;')
    expect(special.document).not.toContain('Cia <alfa>')
    const parsed = paragraphs(special.document)
    expect(parsed[0].text).toBe('Título & <teste>')
    expect(parsed[1].text).toBe(original)
    expect(parsed[2].text).toBe('A&B <C>')
  })

  it('quebra de linha simples vira quebra dentro do mesmo parágrafo', async () => {
    const lines = await renderSpec(handSpec([{ tipo: 'paragrafo', texto: 'linha 1\nlinha 2\n\nsegundo parágrafo' }]))
    const body = paragraphs(lines.document).filter((paragraph) => paragraph.style === 'Corpo')
    expect(body.map((paragraph) => paragraph.text)).toEqual(['linha 1\nlinha 2', 'segundo parágrafo'])
  })
})

describe('RF-04: preset livre', () => {
  it('Calibri 11 pt, entrelinha 1,15, margens de 2,5 cm, sem recuo nem número de página', async () => {
    const livre = await renderSpec(handSpec([{ tipo: 'paragrafo', texto: 'Texto' }], { preset: 'livre' }))
    expect(documentDefaults(livre.styles)).toEqual({ font: 'Calibri', size: 22, line: 276, language: 'pt-BR' })
    expect(pageMargins(livre.document)).toEqual({ top: 1417, left: 1417, bottom: 1417, right: 1417 })
    const corpo = styleXml(livre.styles, 'Corpo')
    expect(corpo).toContain('<w:jc w:val="left"/>')
    expect(corpo).toContain('w:firstLine="0"')
    expect([...livre.zip.keys()].some((name) => /^word\/header\d+\.xml$/.test(name))).toBe(false)
    expect(livre.document).not.toContain('<w:headerReference')
  })
})

describe('RF-04: erros explícitos do renderer', () => {
  it('texto_longo pendente é E_RENDER, nunca um espaço em branco', async () => {
    const error = await failure(renderSpec(handSpec([{ tipo: 'paragrafo', texto: 'antes' }, { tipo: 'texto_longo', papel: 'resumo', status: 'pendente', fontes: [{ datasetId: 'vendas' }] }])))
    expect(error.code).toBe('E_RENDER')
    expect(error.message).toContain('/blocos/1')
    expect(error.message).toContain('pendente')
    expect(error.message).toContain('LONG_TEXT')
  })

  it('texto_longo "gerado" sem texto também é E_RENDER', async () => {
    const error = await failure(renderSpec(handSpec([{ tipo: 'texto_longo', papel: 'resumo', status: 'gerado', fontes: [] }])))
    expect(error.code).toBe('E_RENDER')
  })

  it('tabela e figura sem os dados que referenciam são E_RENDER, com o caminho do bloco', async () => {
    const chart = fixture('relatorio-completo.json').charts[0]
    const cases: [ValidDocxSpec, Map<string, unknown>, RegExp][] = [
      [handSpec([{ tipo: 'tabela', datasetId: 'vendas', legenda: 'x' }]), new Map(), /dataset "vendas".*bloco tabela em \/blocos\/0/],
      [handSpec([{ tipo: 'figura', chartId: 'c', legenda: 'x' }]), new Map(), /gráfico "c".*\/blocos\/0.*não está em charts/],
      [handSpec([{ tipo: 'figura', chartId: chart.id, legenda: 'x' }], { charts: [chart] }), new Map(), /dataset "vendas".*gráfico "vendas-categoria"/],
      [handSpec([{ tipo: 'tabela', datasetId: 'vazio', legenda: 'x' }]), new Map([['vazio', makeDataset('vazio', 'Vazio', [{ name: 'a', type: 'string' }], [])]]), /não tem linhas/],
      [handSpec([{ tipo: 'tabela', datasetId: 'sem', legenda: 'x' }]), new Map([['sem', makeDataset('sem', 'Sem colunas', [], [{}])]]), /não tem colunas/]
    ]
    for (const [spec, datasets, pattern] of cases) {
      const error = await failure(renderSpec(spec, datasets as Map<string, TabularDataset>))
      expect(error.code).toBe('E_RENDER')
      expect(error.message).toMatch(pattern)
    }
  })

  it('tipo de bloco desconhecido é E_RENDER (defesa em profundidade)', async () => {
    const error = await failure(renderSpec(handSpec([{ tipo: 'video' }])))
    expect(error.code).toBe('E_RENDER')
    expect(error.message).toContain('/blocos/0')
  })

  it('o nome do arquivo vem do título saneado e nunca sai do outputDir', async () => {
    for (const title of ['..\\..\\fora/evil', '../../etc/passwd', 'C:\\Windows\\x', '???', 'a'.repeat(200)]) {
      const rendered = await renderSpec(handSpec([{ tipo: 'paragrafo', texto: 'x' }], { title }), new Map(), 'saida/run')
      expect(rendered.path.startsWith('saida/run/')).toBe(true)
      const name = rendered.path.slice('saida/run/'.length)
      expect(name).toMatch(/^[a-z0-9-]+-[a-f0-9]{12}\.docx$/)
      expect(name.length).toBeLessThanOrEqual(40 + 1 + 12 + 5)
    }
  })

  it('só grava dentro do outputDir e uma única vez', async () => {
    const writes: string[] = []
    await renderDocx(handSpec([{ tipo: 'paragrafo', texto: 'x' }]), { outputDir: 'um/dois', datasets: new Map(), writeFile: (path) => { writes.push(path) } })
    expect(writes).toHaveLength(1)
    expect(writes[0].startsWith('um/dois/')).toBe(true)
  })
})

describe('RF-04: determinismo do docx (P5)', () => {
  it('mesma spec gera o mesmo hash e o mesmo caminho, mesmo com o relógio andando', async () => {
    const first = await render(fixture('relatorio.json'))
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const second = await render(fixture('relatorio.json'))
    expect(second.hash).toBe(first.hash)
    expect(second.path).toBe(first.path)
    // O ZIP carrega a data de criação, por isso o hash cobre o conteúdo normalizado e não os bytes brutos.
    expect(text(second.zip.get('docProps/core.xml'))).not.toBe(text(first.zip.get('docProps/core.xml')))
  })

  it('spec ou preset diferente gera hash diferente', async () => {
    const base = await renderSpec(handSpec([{ tipo: 'paragrafo', texto: 'um' }]))
    expect((await renderSpec(handSpec([{ tipo: 'paragrafo', texto: 'dois' }]))).hash).not.toBe(base.hash)
    expect((await renderSpec(handSpec([{ tipo: 'paragrafo', texto: 'um' }], { preset: 'livre' }))).hash).not.toBe(base.hash)
    expect((await renderSpec(handSpec([{ tipo: 'paragrafo', texto: 'um' }], { title: 'Outro' }))).hash).not.toBe(base.hash)
  })
})

describe('RF-04: comando render', () => {
  const run = (argv: string[], cwd: string) => renderCommand(argv, { cwd })

  it('renderiza a fixture e grava em artifacts/<hash12>, com o JSON do resultado', async () => {
    await inTempDir(async (cwd) => {
      const result = await run([fixturePath('relatorio.json')], cwd)
      expect(result.exitCode).toBe(0)
      const output = JSON.parse(result.output)
      expect(output).toMatchObject({ ok: true, rendererVersion: DOCX_RENDERER_VERSION, blocos: 12 })
      expect(output.arquivo.startsWith(join(cwd, 'artifacts', output.hash.slice(0, 12)) + sep)).toBe(true)
      expect(existsSync(output.arquivo)).toBe(true)
      const zip = readZip(new Uint8Array(readFileSync(output.arquivo)))
      expect(zip.has('word/document.xml')).toBe(true)
      expect(output.hash).toBe((await render(fixture('relatorio.json'))).hash)
    })
  })

  it('--out grava na pasta pedida', async () => {
    await inTempDir(async (cwd) => {
      const result = await run([fixturePath('relatorio.json'), '--out', join('saida', 'docs')], cwd)
      expect(result.exitCode).toBe(0)
      expect(readdirSync(join(cwd, 'saida', 'docs'))).toHaveLength(1)
      expect(existsSync(join(cwd, 'artifacts'))).toBe(false)
    })
  })

  it('--out fora do diretório de trabalho é recusado antes de renderizar e nada é gravado', async () => {
    await inTempDir(async (cwd) => {
      for (const out of ['../fora', `..${sep}fora`, join(cwd, '..', 'fora')]) {
        const result = await run([fixturePath('relatorio.json'), '--out', out], cwd)
        expect(result.exitCode).toBe(1)
        expect(JSON.parse(result.output)).toMatchObject({ ok: false, code: 'E_CONFIG_INVALIDA' })
      }
      expect(readdirSync(cwd)).toEqual([])
    })
  })

  it('spec inválida termina com exit 1, código, subcódigo e caminho; nada é gravado', async () => {
    await inTempDir(async (cwd) => {
      const result = await run([fixturePath('invalido-numero.json')], cwd)
      expect(result.exitCode).toBe(1)
      expect(JSON.parse(result.output)).toMatchObject({ ok: false, code: 'E_SPEC_SEMANTICA', subcode: 'E_NUMERO_SEM_ORIGEM', path: '/blocos/1/texto' })
      expect(readdirSync(cwd)).toEqual([])
    })
  })

  it('texto_longo pendente passa na validação mas termina em E_RENDER, sem arquivo', async () => {
    await inTempDir(async (cwd) => {
      const result = await run([fixturePath('minimo.json')], cwd)
      expect(result.exitCode).toBe(1)
      const output = JSON.parse(result.output)
      expect(output.code).toBe('E_RENDER')
      expect(output.message).toContain('pendente')
      expect(readdirSync(cwd)).toEqual([])
    })
  })

  it('JSON ilegível é E_SPEC_PARSE; arquivo inexistente e uso incorreto terminam com exit 2', async () => {
    await inTempDir(async (cwd) => {
      const broken = join(cwd, 'quebrado.json')
      writeFileSync(broken, '{nao é json')
      const parse = await run([broken], cwd)
      expect(parse.exitCode).toBe(1)
      expect(JSON.parse(parse.output)).toMatchObject({ ok: false, code: 'E_SPEC_PARSE' })
      for (const argv of [[join(cwd, 'nao-existe.json')], [], [fixturePath('relatorio.json'), 'outro.json'], [fixturePath('relatorio.json'), '--foo'], [fixturePath('relatorio.json'), '--out'], [fixturePath('relatorio.json'), '--anexo', join(cwd, 'nao-existe.csv')]]) {
        const result = await run(argv, cwd)
        expect(result.exitCode).toBe(2)
        expect(JSON.parse(result.output).ok).toBe(false)
      }
    })
  })

  it('--anexo troca o catálogo: os números do texto precisam existir no CSV do usuário', async () => {
    await inTempDir(async (cwd) => {
      const csv = join(cwd, 'vendas.csv')
      writeFileSync(csv, 'categoria,regiao,valor\nEletrônicos,Sul,120\nPapelaria,Norte,25\n')
      const ok = await run([fixturePath('relatorio.json'), '--anexo', csv, '--out', 'ok'], cwd)
      expect(ok.exitCode).toBe(0)
      writeFileSync(csv, 'categoria,regiao,valor\nEletrônicos,Sul,999\n')
      const bad = await run([fixturePath('relatorio.json'), '--anexo', csv, '--out', 'bad'], cwd)
      expect(bad.exitCode).toBe(1)
      expect(JSON.parse(bad.output)).toMatchObject({ code: 'E_SPEC_SEMANTICA', subcode: 'E_NUMERO_SEM_ORIGEM' })
      writeFileSync(csv, 'a,b\n1,2\n3\n')
      const broken = await run([fixturePath('relatorio.json'), '--anexo', csv], cwd)
      expect(broken.exitCode).toBe(1)
      expect(JSON.parse(broken.output)).toMatchObject({ code: 'E_INGEST_INVALIDO' })
    })
  })
})


const completo = await render(fixture('relatorio-completo.json'))
const completoBody = bodyElements(completo.document)
const usable = usableWidth(THEME.abnt)

describe('RF-04: tabelas no docx (seção 10)', () => {
  const tableIndex = completoBody.findIndex((element) => element.kind === 'tbl')
  const table = completoBody[tableIndex] as { kind: 'tbl'; xml: string }

  it('uma tabela, com a legenda numerada acima e a fonte abaixo', () => {
    expect(completoBody.filter((element) => element.kind === 'tbl')).toHaveLength(1)
    expect(completoBody[tableIndex - 1]).toMatchObject({ kind: 'p', style: 'Legenda', text: 'Tabela 1 – Vendas por categoria e região' })
    expect(completoBody[tableIndex + 1]).toMatchObject({ kind: 'p', style: 'Fonte', text: 'Fonte: Vendas por categoria (exemplo).' })
    expect(styleXml(completo.styles, 'Legenda')).toContain('<w:sz w:val="20"/>')
    expect(styleXml(completo.styles, 'Legenda')).toContain('<w:keepNext/>')
  })

  it('cabeçalho em negrito, repetido a cada página, e todas as linhas do dataset', () => {
    const rows = tableRows(table.xml)
    expect(rows).toHaveLength(7)
    expect(rows[0].header).toBe(true)
    expect(rows[0].cells.map((cell) => cell.text)).toEqual(['categoria', 'regiao', 'valor'])
    expect(rows[0].cells.every((cell) => cell.bold)).toBe(true)
    expect(rows.slice(1).every((row) => !row.header)).toBe(true)
    expect(rows.every((row) => row.cantSplit)).toBe(true)
    expect(rows.slice(1).map((row) => row.cells.map((cell) => cell.text))).toEqual([
      ['Eletrônicos', 'Sul', '120'], ['Eletrônicos', 'Norte', '95'], ['Móveis', 'Sul', '60'], ['Móveis', 'Norte', '42'], ['Papelaria', 'Sul', '30'], ['Papelaria', 'Norte', '25']
    ])
  })

  it('só linhas horizontais: no topo, abaixo do cabeçalho e no fim', () => {
    expect(tableInfo(table.xml).borders).toEqual({ top: 'single', left: 'none', bottom: 'single', right: 'none', insideH: 'none', insideV: 'none' })
    const rows = table.xml.match(/<w:tr>.*?<\/w:tr>/gs)!
    expect(rows[0]).toContain('<w:tcBorders><w:bottom w:val="single"')
    expect(rows.slice(1).some((row) => row.includes('<w:tcBorders>'))).toBe(false)
  })

  it('ocupa a largura do texto, com colunas que somam essa largura', () => {
    const info = tableInfo(table.xml)
    expect(info.width).toBe(usable)
    expect(info.gridWidths).toHaveLength(3)
    expect(info.gridWidths.reduce((sum, width) => sum + width, 0)).toBe(usable)
  })

  it('números à direita e texto à esquerda', () => {
    const [header, first] = tableRows(table.xml)
    expect(header.cells.map((cell) => cell.align)).toEqual(['left', 'left', 'right'])
    expect(first.cells.map((cell) => cell.align)).toEqual(['left', 'left', 'right'])
  })

  const formats = makeDataset('fmt', 'Formatos', [
    { name: 'n', type: 'number' }, { name: 'dia', type: 'date' }, { name: 'ok', type: 'boolean' }, { name: 'txt', type: 'string' }
  ], [
    { n: 1234.5, dia: '2024-03-05', ok: true, txt: 'A&B <c>' },
    { n: 1000, dia: '1999-12-31', ok: false, txt: 'x' },
    { n: -9876543.21, dia: null, ok: null, txt: null },
    { n: 0.5, dia: '2024-02-29', ok: true, txt: '' }
  ], { path: 'C:\\Users\\segredo\\dados.csv', sha256: '0'.repeat(64) })

  it('formatação de apresentação: pt-BR, datas dd/mm/aaaa, sim/não e nulos vazios', async () => {
    const rendered = await renderSpec(handSpec([{ tipo: 'tabela', datasetId: 'fmt', legenda: 'Formatos' }]), new Map([['fmt', formats]]))
    const rows = tableRows(bodyElements(rendered.document).find((element) => element.kind === 'tbl')!.xml)
    expect(rows.slice(1).map((row) => row.cells.map((cell) => cell.text))).toEqual([
      ['1.234,5', '05/03/2024', 'sim', 'A&B <c>'],
      ['1.000', '31/12/1999', 'não', 'x'],
      ['-9.876.543,21', '', '', ''],
      ['0,5', '29/02/2024', 'sim', '']
    ])
    expect(rendered.document).toContain('A&amp;B &lt;c&gt;')
  })

  it('o caminho local do arquivo de origem não vai para nenhuma parte do documento', async () => {
    const rendered = await renderSpec(handSpec([{ tipo: 'tabela', datasetId: 'fmt', legenda: 'Formatos' }]), new Map([['fmt', formats]]))
    for (const [name, bytes] of rendered.zip) {
      const content = text(bytes)
      expect(content, name).not.toContain('segredo')
      expect(content, name).not.toContain('dados.csv')
      expect(content, name).not.toContain('C:\\Users')
    }
  })

  it('várias tabelas são numeradas na ordem do documento, cada uma com a sua legenda', async () => {
    const rendered = await renderSpec(handSpec([
      { tipo: 'tabela', datasetId: 'fmt', legenda: 'Primeira' },
      { tipo: 'paragrafo', texto: 'entre' },
      { tipo: 'tabela', datasetId: 'fmt', legenda: 'Segunda' }
    ]), new Map([['fmt', formats]]))
    const body = bodyElements(rendered.document)
    const captions = body.filter((element) => element.kind === 'p' && element.style === 'Legenda').map((element) => (element as { text: string }).text)
    expect(captions).toEqual(['Tabela 1 – Primeira', 'Tabela 2 – Segunda'])
    expect(body.filter((element) => element.kind === 'tbl')).toHaveLength(2)
    expect(body.findIndex((element) => element.kind === 'tbl')).toBe(2)
  })
})

describe('RF-04: formatação de números e células', () => {
  it('formatNumber: separador de milhar, vírgula decimal, casas preservadas e sinal', () => {
    const cases: [number, string][] = [[0, '0'], [12, '12'], [123, '123'], [1234, '1.234'], [1234567, '1.234.567'], [1234.5, '1.234,5'], [-1234.5, '-1.234,5'], [0.001, '0,001'], [-0.5, '-0,5'], [100000, '100.000'], [3013.82, '3.013,82']]
    for (const [value, expected] of cases) expect(formatNumber(value), String(value)).toBe(expected)
  })

  it('formatNumber não inventa nada para notação exponencial nem para valores não finitos', () => {
    expect(formatNumber(1e21)).toBe('1e+21')
    expect(formatNumber(Number.NaN)).toBe('NaN')
  })

  it('formatCell: valor fora do tipo da coluna sai como texto, sem lançar', () => {
    expect(formatCell('abc', 'number')).toBe('abc')
    expect(formatCell('31/12/2024', 'date')).toBe('31/12/2024')
    expect(formatCell(true, 'string')).toBe('true')
    expect(formatCell(undefined, 'string')).toBe('')
  })

  it('pngSize lê o cabeçalho do PNG e recusa o que não é PNG', async () => {
    const png = [...completo.zip].find(([name]) => /^word\/media\/.+\.png$/.test(name))![1]
    expect(pngSize(png)).toEqual(pngDimensions(png))
    expect(() => pngSize(new Uint8Array(30))).toThrow('PNG')
  })
})

describe('RF-05: figuras no docx (seção 10)', () => {
  const images = [...completo.zip].filter(([name]) => /^word\/media\/.+\.png$/.test(name))
  const [drawing] = drawings(completo.document)

  it('o gráfico entra como imagem PNG real no pacote', () => {
    expect(images).toHaveLength(1)
    expect([...images[0][1].subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(images[0][1].length).toBeGreaterThan(1000)
    expect(drawings(completo.document)).toHaveLength(1)
  })

  it('proporção preservada, dentro da largura útil e sem ampliar a imagem', () => {
    const natural = pngDimensions(images[0][1])
    expect(Math.abs(drawing.cx / drawing.cy - natural.width / natural.height)).toBeLessThan(0.01)
    expect(drawing.cx).toBeLessThanOrEqual(usable * 635)
    expect(drawing.cx).toBeLessThanOrEqual(natural.width * 9525)
    expect(drawing.cx).toBeGreaterThan(usable * 635 * 0.9)
  })

  it('texto alternativo com título e descrição montados só com campos da spec, e id fixo', () => {
    expect(drawing).toMatchObject({ id: '1', name: 'Figura 1', title: 'Vendas por categoria', descr: 'Gráfico de barras de Valor por Categoria' })
  })

  it('legenda numerada acima da imagem e fonte abaixo', () => {
    const index = completoBody.findIndex((element) => element.kind === 'p' && element.xml.includes('<w:drawing>'))
    expect(completoBody[index - 1]).toMatchObject({ kind: 'p', style: 'Legenda', text: 'Figura 1 – Soma das vendas por categoria' })
    expect(completoBody[index + 1]).toMatchObject({ kind: 'p', style: 'Fonte', text: 'Fonte: Vendas por categoria (exemplo).' })
    expect(completoBody[index]).toMatchObject({ align: 'center' })
  })

  it('duas figuras: numeração e ids próprios, mesmo com o mesmo gráfico', async () => {
    const chart = fixture('relatorio-completo.json').charts[0]
    const vendas = catalog.get('vendas')!
    const two = await renderSpec(handSpec([
      { tipo: 'figura', chartId: chart.id, legenda: 'Primeira' },
      { tipo: 'tabela', datasetId: 'vendas', legenda: 'T' },
      { tipo: 'figura', chartId: chart.id, legenda: 'Segunda' }
    ], { charts: [chart] }), new Map([['vendas', vendas]]))
    const found = drawings(two.document)
    expect(found.map((item) => [item.id, item.name])).toEqual([['1', 'Figura 1'], ['2', 'Figura 2']])
    const captions = bodyElements(two.document).filter((element) => element.kind === 'p' && element.style === 'Legenda').map((element) => (element as { text: string }).text)
    expect(captions).toEqual(['Figura 1 – Primeira', 'Tabela 1 – T', 'Figura 2 – Segunda'])
  })

  it('o contador de ids da biblioteca não vaza entre renders: o mesmo relatório tem o mesmo hash', async () => {
    const again = await render(fixture('relatorio-completo.json'))
    expect(again.hash).toBe(completo.hash)
    expect(drawings(again.document)[0].id).toBe('1')
  })
})

describe('RF-04: relatório completo pelo comando render', () => {
  const run = (argv: string[], cwd: string) => renderCommand(argv, { cwd })

  it('texto, tabela e gráfico num único .docx, com o mesmo hash do renderer', async () => {
    await inTempDir(async (cwd) => {
      const result = await run([fixturePath('relatorio-completo.json'), '--out', 'saida'], cwd)
      expect(result.exitCode).toBe(0)
      const output = JSON.parse(result.output)
      expect(output).toMatchObject({ ok: true, rendererVersion: DOCX_RENDERER_VERSION, blocos: 8, hash: completo.hash })
      const zip = readZip(new Uint8Array(readFileSync(output.arquivo)))
      expect(text(zip.get('word/document.xml'))).toContain('<w:tbl>')
      expect([...zip.keys()].some((name) => /^word\/media\/.+\.png$/.test(name))).toBe(true)
      expect(readdirSync(join(cwd, 'saida'))).toHaveLength(1)
    })
  })

  it('com o CSV do usuário: 100 linhas na tabela, valores e datas formatados e gráfico do CSV', async () => {
    await inTempDir(async (cwd) => {
      const csv = join(import.meta.dirname ?? '.', '..', 'specs', 'fixtures', 'ingest', 'vendas.csv')
      const result = await run([fixturePath('relatorio-vendas-csv.json'), '--anexo', csv, '--out', 'saida'], cwd)
      expect(result.exitCode).toBe(0)
      const zip = readZip(new Uint8Array(readFileSync(JSON.parse(result.output).arquivo)))
      const document = text(zip.get('word/document.xml'))
      const body = bodyElements(document)
      const tableIndex = body.findIndex((element) => element.kind === 'tbl')
      const rows = tableRows((body[tableIndex] as { xml: string }).xml)
      expect(rows).toHaveLength(101)
      expect(rows[0].cells.map((cell) => cell.text)).toEqual(['data', 'produto', 'regiao', 'valor'])

      const source = ingestFile({ name: csv, bytes: new Uint8Array(readFileSync(csv)) }).datasets[0]
      const [year, month, day] = String(source.rows[0].data).split('-')
      expect(rows[1].cells.map((cell) => cell.text)).toEqual([`${day}/${month}/${year}`, String(source.rows[0].produto), String(source.rows[0].regiao), formatNumber(source.rows[0].valor as number)])
      const dataRows = rows.slice(1)
      expect(dataRows.every((row) => /^\d{2}\/\d{2}\/\d{4}$/.test(row.cells[0].text))).toBe(true)
      expect(dataRows.every((row) => /^\d{1,3}(\.\d{3})*(,\d+)?$/.test(row.cells[3].text))).toBe(true)
      expect(dataRows.some((row) => /^\d{1,3}(\.\d{3})+/.test(row.cells[3].text))).toBe(true)

      expect(body[tableIndex - 1]).toMatchObject({ style: 'Legenda', text: 'Tabela 1 – Registros de venda' })
      expect(body.some((element) => element.kind === 'p' && element.text === 'Figura 1 – Soma do valor por produto')).toBe(true)
      expect(drawings(document)[0].descr).toBe('Gráfico de barras de Valor por Produto')
    })
  })
})
