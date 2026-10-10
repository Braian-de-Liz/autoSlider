import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateDocx, validateDocxSpec } from '../src/agent/validate-docx.ts'
import { DatasetCatalog, SAMPLE_DATASETS, makeDataset } from '../src/data/catalog.ts'
import { LLMError } from '../src/llm/contracts.ts'
import { stripNullOptionals, toProviderSchema } from '../src/llm/schema.ts'
import { validarCommand, validarText } from '../src/commands/validar.ts'
import { DocxSpec } from '../src/specs/schemas.ts'

const FIXTURES = join(import.meta.dirname ?? '.', '..', 'specs', 'fixtures', 'docx')
const fixturePath = (name: string) => join(FIXTURES, name)
const fixture = (name: string) => JSON.parse(readFileSync(fixturePath(name), 'utf8')) as Record<string, any>
const catalog = new DatasetCatalog(SAMPLE_DATASETS)

/** Resumo do erro lançado: código, subcódigo e JSON Pointer. */
function failure(fn: () => unknown): { code?: string; subcode?: string; path?: string } | undefined {
  try { fn() } catch (error) {
    if (error instanceof LLMError) return { code: error.code, subcode: error.details?.subcode as string | undefined, path: error.details?.path as string | undefined }
    throw error
  }
  return undefined
}

const doc = (blocos: unknown[], extra: Record<string, unknown> = {}) => ({ ...fixture('minimo.json'), charts: [], blocos, ...extra })
const table = { tipo: 'tabela', datasetId: 'vendas', legenda: 'Vendas por categoria e região' }

describe('RF-03: DocxSpec (seção 6.3)', () => {
  it('aceita a fixture válida e devolve os datasets referenciados', () => {
    const { spec, datasets } = validateDocx(fixture('minimo.json'), catalog)
    expect(spec.blocos).toHaveLength(8)
    expect([...datasets.keys()]).toEqual(['vendas'])
  })

  const invalid: [string, { code: string; subcode?: string; path: string }][] = [
    ['invalido-schema-bloco.json', { code: 'E_SPEC_SCHEMA', path: '/blocos/0/texto' }],
    ['invalido-ref-dataset.json', { code: 'E_SPEC_SEMANTICA', subcode: 'E_REF', path: '/blocos/0/datasetId' }],
    ['invalido-ref-chart.json', { code: 'E_SPEC_SEMANTICA', subcode: 'E_REF', path: '/blocos/0/chartId' }],
    ['invalido-campo.json', { code: 'E_SPEC_SEMANTICA', subcode: 'E_CAMPO', path: '/charts/0/x/campo' }],
    ['invalido-numero.json', { code: 'E_SPEC_SEMANTICA', subcode: 'E_NUMERO_SEM_ORIGEM', path: '/blocos/1/texto' }],
    ['invalido-texto-longo-numero.json', { code: 'E_SPEC_SEMANTICA', subcode: 'E_NUMERO_SEM_ORIGEM', path: '/blocos/1/texto' }],
    ['invalido-texto-longo-sem-texto.json', { code: 'E_SPEC_SCHEMA', path: '/blocos/0/texto' }]
  ]
  for (const [name, expected] of invalid) {
    it(`rejeita ${name} com ${expected.subcode ?? expected.code} em ${expected.path}`, () => {
      expect(failure(() => validateDocx(fixture(name), catalog))).toMatchObject(expected)
    })
  }

  it('tipo de bloco desconhecido lista os tipos válidos em /blocos/N/tipo', () => {
    const error = failure(() => validateDocxSpec(doc([{ tipo: 'video' }])))
    expect(error).toEqual({ code: 'E_SPEC_SCHEMA', subcode: undefined, path: '/blocos/0/tipo' })
    expect(() => validateDocxSpec(doc([{ tipo: 'video' }]))).toThrow('texto_longo')
  })

  it('aponta o campo do bloco e não a união inteira', () => {
    expect(failure(() => validateDocxSpec(doc([{ tipo: 'heading', nivel: 4, texto: 'x' }])))).toMatchObject({ path: '/blocos/0/nivel' })
    expect(failure(() => validateDocxSpec(doc([{ tipo: 'lista', ordenada: true, itens: [] }])))).toMatchObject({ path: '/blocos/0/itens' })
  })

  it('exige ao menos um bloco e os campos comuns', () => {
    expect(failure(() => validateDocxSpec(doc([])))).toMatchObject({ code: 'E_SPEC_SCHEMA', path: '/blocos' })
    expect(failure(() => validateDocxSpec({ ...fixture('minimo.json'), lang: 'en' }))).toMatchObject({ code: 'E_SPEC_SCHEMA', path: '/lang' })
  })

  it('E_REF para id de gráfico duplicado', () => {
    const chart = fixture('minimo.json').charts[0]
    expect(failure(() => validateDocx(doc([table], { charts: [chart, chart] }), catalog))).toMatchObject({ subcode: 'E_REF', path: '/charts/1/id' })
  })

  it('E_REF para fonte de texto longo sem datasetId nem calcId', () => {
    const block = { tipo: 'texto_longo', papel: 'resumo', status: 'pendente', fontes: [{}] }
    expect(failure(() => validateDocx(doc([block]), catalog))).toMatchObject({ subcode: 'E_REF', path: '/blocos/0/fontes/0' })
  })

  it('E_REF para datasetId inexistente em fonte de texto longo', () => {
    const block = { tipo: 'texto_longo', papel: 'resumo', status: 'pendente', fontes: [{ datasetId: 'nao-existe' }] }
    expect(failure(() => validateDocx(doc([block]), catalog))).toMatchObject({ subcode: 'E_REF', path: '/blocos/0/fontes/0/datasetId' })
  })

  it('calcId é E_REF até existir calc/, e aceito quando registrado', () => {
    const block = { tipo: 'texto_longo', papel: 'resumo', status: 'pendente', fontes: [{ calcId: 'soma-vendas' }] }
    expect(failure(() => validateDocx(doc([block]), catalog))).toMatchObject({ subcode: 'E_REF', path: '/blocos/0/fontes/0/calcId' })
    expect(() => validateDocx(doc([block]), catalog, { calcIds: new Set(['soma-vendas']) })).not.toThrow()
  })

  it('o erro de campo de um gráfico embutido leva o caminho /charts/N', () => {
    const chart = { ...fixture('minimo.json').charts[0], serie: 'canal' }
    expect(failure(() => validateDocx(doc([table], { charts: [chart] }), catalog))).toMatchObject({ subcode: 'E_CAMPO', path: '/charts/0/serie' })
  })
})

describe('RNF-04: origem dos números em docx', () => {
  it('aceita número que existe no dataset referenciado (inclusive vírgula decimal)', () => {
    const custom = new DatasetCatalog([makeDataset('notas', 'Notas', [{ name: 'nota', type: 'number' }], [{ nota: 8.5 }, { nota: 10 }])])
    const blocks = [{ tipo: 'tabela', datasetId: 'notas', legenda: 'Notas' }, { tipo: 'paragrafo', texto: 'A maior nota foi 10 e a menor, 8,5.' }]
    expect(() => validateDocx(doc(blocks), custom)).not.toThrow()
  })

  it('rejeita número sem origem em título, heading, lista e legenda, com o caminho de cada um', () => {
    const cases: [unknown[], string, Record<string, unknown>?][] = [
      [[table], '/title', { title: 'Relatório de 77 itens' }],
      [[table, { tipo: 'heading', nivel: 1, texto: 'Meta de 99' }], '/blocos/1/texto'],
      [[table, { tipo: 'lista', ordenada: false, itens: ['120 unidades', 'queda de 33'] }], '/blocos/1/itens/1'],
      [[{ ...table, legenda: 'Tabela 7' }], '/blocos/0/legenda']
    ]
    for (const [blocks, path, extra] of cases) {
      expect(failure(() => validateDocx(doc(blocks, extra), catalog))).toMatchObject({ subcode: 'E_NUMERO_SEM_ORIGEM', path })
    }
  })

  it('sem datasets referenciados, qualquer número é rejeitado', () => {
    expect(failure(() => validateDocx(doc([{ tipo: 'paragrafo', texto: 'Foram 5 casos.' }]), catalog))).toMatchObject({ subcode: 'E_NUMERO_SEM_ORIGEM', path: '/blocos/0/texto' })
  })
})

describe('RF-16: texto_longo (seção 6.8, validação parcial)', () => {
  const longText = (fields: Record<string, unknown>) => ({ tipo: 'texto_longo', papel: 'resumo', fontes: [{ datasetId: 'vendas' }], ...fields })

  it('aceita bloco pendente sem texto', () => {
    expect(() => validateDocx(doc([longText({ status: 'pendente' })]), catalog)).not.toThrow()
  })

  it('rejeita gerado sem texto ou com texto em branco', () => {
    for (const texto of [undefined, '   ']) {
      expect(failure(() => validateDocxSpec(doc([longText({ status: 'gerado', texto })])))).toMatchObject({ code: 'E_SPEC_SCHEMA', path: '/blocos/0/texto' })
    }
  })

  it('rejeita pendente que já traz texto', () => {
    expect(failure(() => validateDocxSpec(doc([longText({ status: 'pendente', texto: 'Já escrito.' })])))).toMatchObject({ code: 'E_SPEC_SCHEMA', path: '/blocos/0/texto' })
  })

  it('texto gerado só usa números das fontes do próprio bloco', () => {
    const other = new DatasetCatalog([...SAMPLE_DATASETS, makeDataset('metas', 'Metas', [{ name: 'meta', type: 'number' }], [{ meta: 777 }])])
    const blocks = [table, { tipo: 'tabela', datasetId: 'metas', legenda: 'Metas' }]
    const ok = longText({ status: 'gerado', texto: 'O maior valor foi 120.' })
    expect(() => validateDocx(doc([...blocks, ok]), other)).not.toThrow()
    // 777 existe no documento (tabela de metas), mas não está nas fontes deste bloco.
    const bad = longText({ status: 'gerado', texto: 'A meta era 777.' })
    expect(failure(() => validateDocx(doc([...blocks, bad]), other))).toMatchObject({ subcode: 'E_NUMERO_SEM_ORIGEM', path: '/blocos/2/texto' })
  })
})

describe('RF-12: DocxSpec no schema strict da OpenAI', () => {
  const strict = toProviderSchema(DocxSpec, 'openai-strict')

  /** Percorre o schema inteiro e confere o contrato do modo strict em todo objeto. */
  function walk(node: unknown, visit: (object: Record<string, any>) => void): void {
    if (Array.isArray(node)) return node.forEach((child) => walk(child, visit))
    if (!node || typeof node !== 'object') return
    visit(node as Record<string, any>)
    Object.values(node).forEach((child) => walk(child, visit))
  }

  it('todo objeto proíbe propriedades extras e lista todos os campos em required', () => {
    let objects = 0
    walk(strict, (node) => {
      if (node.type !== 'object' || !node.properties) return
      objects++
      expect(node.additionalProperties).toBe(false)
      expect(node.required).toEqual(Object.keys(node.properties))
    })
    expect(objects).toBeGreaterThan(8)
  })

  it('não usa oneOf e torna anuláveis texto e calcId', () => {
    const json = JSON.stringify(strict)
    expect(json).not.toContain('"oneOf"')
    const longText = (strict as any).properties.blocos.items.anyOf.find((branch: any) => branch.properties.tipo.const === 'texto_longo')
    expect(longText.properties.texto.anyOf).toContainEqual({ type: 'null' })
    expect(longText.properties.fontes.items.properties.calcId.anyOf).toContainEqual({ type: 'null' })
  })

  it('stripNullOptionals desfaz os null e reproduz a fixture', () => {
    const original = fixture('minimo.json')
    const withNulls = structuredClone(original)
    for (const bloco of withNulls.blocos) {
      if (bloco.tipo === 'texto_longo') {
        bloco.texto ??= null
        bloco.fontes = bloco.fontes.map((fonte: any) => ({ datasetId: null, calcId: null, ...fonte }))
      }
    }
    withNulls.charts[0].serie = null
    expect(stripNullOptionals(DocxSpec, withNulls)).toEqual(original)
  })
})

describe('RF-03: comando validar', () => {
  it('valida a fixture docx pelo caminho do arquivo', () => {
    expect(validarCommand(fixturePath('minimo.json'))).toEqual({ exitCode: 0, output: JSON.stringify({ ok: true, kind: 'docx' }) })
  })

  it('devolve código, subcódigo e JSON Pointer da fixture inválida', () => {
    const result = validarCommand(fixturePath('invalido-numero.json'))
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.output)).toMatchObject({ ok: false, code: 'E_SPEC_SEMANTICA', subcode: 'E_NUMERO_SEM_ORIGEM', path: '/blocos/1/texto' })
  })

  it('JSON sem kind é um ChartSpec', () => {
    const chart = { id: 'c', tipo: 'bar', datasetId: 'vendas', x: { campo: 'categoria', titulo: 'Categoria' }, y: { campo: 'valor', titulo: 'Valor', agregacao: 'sum' }, titulo: 'Vendas' }
    expect(validarText(JSON.stringify(chart))).toEqual({ exitCode: 0, output: JSON.stringify({ ok: true, kind: 'chart' }) })
    expect(JSON.parse(validarText(JSON.stringify({ ...chart, datasetId: 'x' })).output)).toMatchObject({ subcode: 'E_REF', path: '/datasetId' })
  })

  it('JSON ilegível vira E_SPEC_PARSE e kind desconhecido vira E_ROTA', () => {
    expect(JSON.parse(validarText('{nao é json').output)).toMatchObject({ ok: false, code: 'E_SPEC_PARSE' })
    const route = validarText(JSON.stringify({ kind: 'pptx' }))
    expect(route.exitCode).toBe(1)
    expect(JSON.parse(route.output)).toMatchObject({ code: 'E_ROTA' })
    expect(JSON.parse(route.output).message).toContain('chart, docx')
  })

  it('arquivo inexistente termina com exit 2', () => {
    const result = validarCommand(fixturePath('nao-existe.json'))
    expect(result.exitCode).toBe(2)
    expect(JSON.parse(result.output).ok).toBe(false)
  })
})
