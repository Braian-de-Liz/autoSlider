import { describe, expect, it } from 'bun:test'
import { validatePptx, validatePptxSpec } from '../src/agent/validate-pptx.ts'
import { DatasetCatalog, SAMPLE_DATASETS } from '../src/data/catalog.ts'
import { LLMError } from '../src/llm/contracts.ts'

const catalog = new DatasetCatalog(SAMPLE_DATASETS)

/** Resumo do erro lançado: código, subcódigo e JSON Pointer. */
function failure(fn: () => unknown): { code?: string; subcode?: string; path?: string } | undefined {
  try { fn() } catch (error) {
    if (error instanceof LLMError) return { code: error.code, subcode: error.details?.subcode as string | undefined, path: error.details?.path as string | undefined }
    throw error
  }
  return undefined
}

const chart = {
  id: 'c1', tipo: 'bar', datasetId: 'vendas',
  x: { campo: 'categoria', titulo: 'Categoria' },
  y: { campo: 'valor', titulo: 'Valor', agregacao: 'sum' },
  titulo: 'Vendas por categoria'
}

const deck = (overrides: Record<string, unknown> = {}) => ({
  specVersion: '1.0',
  title: 'Resumo de vendas',
  lang: 'pt-BR',
  kind: 'pptx',
  charts: [chart],
  slides: [
    { layout: 'titulo', titulo: 'Vendas', subtitulo: 'Panorama por categoria' },
    { layout: 'grafico', titulo: 'Por categoria', chartId: 'c1' },
    { layout: 'tabela', titulo: 'Dados', datasetId: 'vendas' }
  ],
  notas: { '2': 'Eletrônicos lidera com 120.' },
  ...overrides
})

const withSlides = (slides: unknown[], extra: Record<string, unknown> = {}) => deck({ slides, charts: [], notas: undefined, ...extra })
const title = { layout: 'titulo', titulo: 'Vendas' }

describe('RF-22: PptxSpec (seção 6.2)', () => {
  it('aceita uma apresentação válida e devolve os datasets referenciados', () => {
    const { spec, datasets } = validatePptx(deck(), catalog)
    expect(spec.slides).toHaveLength(3)
    expect([...datasets.keys()]).toEqual(['vendas'])
  })

  it('o primeiro slide precisa ser o layout titulo, em /slides/0/layout', () => {
    expect(failure(() => validatePptxSpec(withSlides([{ layout: 'bullets', titulo: 'A', itens: ['x'] }])))).toMatchObject({ code: 'E_SPEC_SCHEMA', path: '/slides/0/layout' })
  })

  it('layout desconhecido aponta /slides/N/layout e lista os válidos', () => {
    try {
      validatePptxSpec(withSlides([title, { layout: 'galeria', titulo: 'x' }]))
      throw new Error('deveria falhar')
    } catch (error) {
      expect(error).toBeInstanceOf(LLMError)
      expect((error as LLMError).details?.path).toBe('/slides/1/layout')
      expect((error as LLMError).message).toContain('bullets')
    }
  })

  it('aponta o campo exato do slide, não a união inteira', () => {
    const seven = Array.from({ length: 7 }, (_, i) => `item ${i}`)
    expect(failure(() => validatePptxSpec(withSlides([title, { layout: 'bullets', titulo: 'A', itens: seven }])))).toMatchObject({ code: 'E_SPEC_SCHEMA', path: '/slides/1/itens' })
    expect(failure(() => validatePptxSpec(withSlides([title, { layout: 'bullets', titulo: 'A', itens: ['x'.repeat(121)] }])))).toMatchObject({ code: 'E_SPEC_SCHEMA', path: '/slides/1/itens/0' })
  })

  it('recusa mais de 30 slides e kind diferente de pptx', () => {
    const many = [title, ...Array.from({ length: 30 }, () => ({ layout: 'bullets', titulo: 'A', itens: ['x'] }))]
    expect(failure(() => validatePptxSpec(withSlides(many)))).toMatchObject({ code: 'E_SPEC_SCHEMA', path: '/slides' })
    expect(failure(() => validatePptxSpec(deck({ kind: 'docx' })))).toMatchObject({ code: 'E_SPEC_SCHEMA', path: '/kind' })
  })

  it('chave de notas fora do intervalo de slides é E_SPEC_SCHEMA em /notas/<chave>', () => {
    expect(failure(() => validatePptxSpec(deck({ notas: { '9': 'x' } })))).toMatchObject({ code: 'E_SPEC_SCHEMA', path: '/notas/9' })
    expect(failure(() => validatePptxSpec(deck({ notas: { '0': 'x' } })))).toMatchObject({ path: '/notas/0' })
    expect(failure(() => validatePptxSpec(deck({ notas: { dois: 'x' } })))).toMatchObject({ path: '/notas/dois' })
  })

  it('chartId inexistente é E_REF em /slides/N/chartId', () => {
    const spec = deck({ slides: [title, { layout: 'grafico', titulo: 'G', chartId: 'nao-existe' }], notas: undefined })
    expect(failure(() => validatePptx(spec, catalog))).toMatchObject({ code: 'E_SPEC_SEMANTICA', subcode: 'E_REF', path: '/slides/1/chartId' })
  })

  it('gráfico declarado e não usado é E_REF em /charts/N/id', () => {
    const spec = deck({ slides: [title], notas: undefined })
    expect(failure(() => validatePptx(spec, catalog))).toMatchObject({ code: 'E_SPEC_SEMANTICA', subcode: 'E_REF', path: '/charts/0/id' })
  })

  it('id de gráfico duplicado é E_REF em /charts/N/id', () => {
    const spec = deck({ charts: [chart, chart] })
    expect(failure(() => validatePptx(spec, catalog))).toMatchObject({ subcode: 'E_REF', path: '/charts/1/id' })
  })

  it('datasetId de tabela inexistente é E_REF e lista os disponíveis', () => {
    const spec = withSlides([title, { layout: 'tabela', titulo: 'T', datasetId: 'x' }])
    expect(failure(() => validatePptx(spec, catalog))).toMatchObject({ subcode: 'E_REF', path: '/slides/1/datasetId' })
  })

  it('coluna inexistente no gráfico embutido é E_CAMPO com o caminho prefixado por /charts/N', () => {
    const bad = { ...chart, x: { campo: 'mes', titulo: 'Mês' } }
    expect(failure(() => validatePptx(deck({ charts: [bad] }), catalog))).toMatchObject({ subcode: 'E_CAMPO', path: '/charts/0/x/campo' })
  })
})

describe('RNF-04: números do pptx têm origem nos datasets referenciados', () => {
  const table = { layout: 'tabela', titulo: 'Dados', datasetId: 'vendas' }

  it('aceita números que estão nos dados (120 e 95)', () => {
    const spec = withSlides([title, table, { layout: 'bullets', titulo: 'Destaques', itens: ['Eletrônicos somou 120 no Sul e 95 no Norte'] }])
    expect(failure(() => validatePptx(spec, catalog))).toBeUndefined()
  })

  const invalid: [string, unknown[], Record<string, unknown>, string][] = [
    ['item de bullets', [title, table, { layout: 'bullets', titulo: 'Destaques', itens: ['Crescimento de 35%'] }], {}, '/slides/2/itens/0'],
    ['título de slide', [title, table, { layout: 'bullets', titulo: 'Meta de 777', itens: ['x'] }], {}, '/slides/2/titulo'],
    ['subtítulo', [{ layout: 'titulo', titulo: 'Vendas', subtitulo: 'Ano 2031' }, table], {}, '/slides/0/subtitulo'],
    ['coluna da direita', [title, table, { layout: 'duas_colunas', titulo: 'C', esquerda: ['ok'], direita: ['até 999'] }], {}, '/slides/2/direita/0'],
    ['título da apresentação', [title, table], { title: 'Vendas de 2031' }, '/title'],
    ['nota do apresentador', [title, table], { notas: { '2': 'Cresceu 35%' } }, '/notas/2']
  ]
  for (const [where, slides, extra, path] of invalid) {
    it(`rejeita número sem origem em ${where} (${path})`, () => {
      expect(failure(() => validatePptx(withSlides(slides, extra), catalog))).toMatchObject({ code: 'E_SPEC_SEMANTICA', subcode: 'E_NUMERO_SEM_ORIGEM', path })
    })
  }

  it('sem nenhum dataset referenciado, qualquer número é rejeitado', () => {
    const spec = withSlides([title, { layout: 'bullets', titulo: 'Passos', itens: ['Faça em 3 etapas'] }])
    expect(failure(() => validatePptx(spec, catalog))).toMatchObject({ subcode: 'E_NUMERO_SEM_ORIGEM', path: '/slides/1/itens/0' })
  })
})
