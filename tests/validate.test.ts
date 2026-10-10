import { describe, expect, it } from 'bun:test'
import { validateChartSemantics } from '../src/agent/validate.ts'
import { DatasetCatalog, makeDataset } from '../src/data/catalog.ts'
import { LLMError } from '../src/llm/contracts.ts'

const catalog = new DatasetCatalog([makeDataset('vendas', 'Vendas', [
  { name: 'mes', type: 'string' },
  { name: 'regiao', type: 'string' },
  { name: 'valor', type: 'number' }
], [{ mes: '2024-01', regiao: 'Sul', valor: 10 }, { mes: '2024-02', regiao: 'Norte', valor: 12.5 }])])

const base = { id: 'c', tipo: 'bar' as const, datasetId: 'vendas', x: { campo: 'mes', titulo: 'Mês' }, y: { campo: 'valor', titulo: 'Valor' }, titulo: 'Vendas' }

function subcodeOf(fn: () => unknown): unknown {
  try { fn() } catch (error) { if (error instanceof LLMError) return { code: error.code, ...error.details } }
  return undefined
}

describe('RF-03/RNF-04: validateChartSemantics (seção 6.4)', () => {
  it('aceita spec coerente e devolve o dataset', () => {
    expect(validateChartSemantics(base, catalog).id).toBe('vendas')
  })

  it('aceita count em coluna de texto', () => {
    expect(() => validateChartSemantics({ ...base, y: { campo: 'regiao', titulo: 'Qtd', agregacao: 'count' } }, catalog)).not.toThrow()
  })

  it('aceita números do título que existem nos dados (inclusive dentro de texto)', () => {
    expect(() => validateChartSemantics({ ...base, titulo: 'Vendas 2024, mínimo 10 e 12,5' }, catalog)).not.toThrow()
  })

  it('E_CAMPO aponta o caminho do campo inexistente', () => {
    expect(subcodeOf(() => validateChartSemantics({ ...base, x: { campo: 'produto', titulo: 'P' } }, catalog))).toEqual({ code: 'E_SPEC_SEMANTICA', subcode: 'E_CAMPO', path: '/x/campo' })
  })

  it('E_CAMPO para série inexistente', () => {
    expect(subcodeOf(() => validateChartSemantics({ ...base, serie: 'canal' }, catalog))).toMatchObject({ subcode: 'E_CAMPO', path: '/serie' })
  })

  it('E_CAMPO para eixo y sem agregação em coluna de texto', () => {
    expect(subcodeOf(() => validateChartSemantics({ ...base, y: { campo: 'regiao', titulo: 'R' } }, catalog))).toMatchObject({ subcode: 'E_CAMPO', path: '/y/campo' })
  })

  it('E_NUMERO_SEM_ORIGEM aponta o campo de texto', () => {
    expect(subcodeOf(() => validateChartSemantics({ ...base, y: { campo: 'valor', titulo: 'Valor (top 99)' } }, catalog))).toMatchObject({ subcode: 'E_NUMERO_SEM_ORIGEM', path: '/y/titulo' })
  })
})
