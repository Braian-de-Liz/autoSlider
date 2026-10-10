import { describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_INGEST_BYTES } from '../src/ingest/common.ts'
import { ingestCsv, parseCsv } from '../src/ingest/csv.ts'
import { ingestAll, ingestFile } from '../src/ingest/index.ts'
import { describeDatasetsForPrompt } from '../src/data/catalog.ts'
import { ingerirCommand } from '../src/commands/ingerir.ts'
import { LLMError } from '../src/llm/contracts.ts'

const FIXTURES = join(import.meta.dirname ?? '.', '..', 'specs', 'fixtures', 'ingest')
const fixturePath = (name: string) => join(FIXTURES, name)
const fixtureBytes = (name: string) => new Uint8Array(readFileSync(fixturePath(name)))
const bytes = (text: string) => new TextEncoder().encode(text)
const csv = (text: string, options = {}) => ingestCsv({ name: 'teste.csv', bytes: bytes(text) }, options).datasets[0]

function failure(fn: () => unknown): LLMError {
  try { fn() } catch (error) {
    if (error instanceof LLMError) return error
    throw error
  }
  throw new Error('esperava um erro e nada foi lançado')
}

describe('RF-18: ingestão de CSV (seção 6.9)', () => {
  it('vendas.csv: id, linhas, tipos, amostra, origem e hash', () => {
    const file = fixtureBytes('vendas.csv')
    const { doc, datasets } = ingestFile({ name: 'vendas.csv', bytes: file, path: 'specs/fixtures/ingest/vendas.csv' })
    const [dataset] = datasets
    expect(dataset.id).toBe('vendas')
    expect(dataset.rows).toHaveLength(100)
    expect(dataset.columns).toEqual([
      { name: 'data', type: 'date' }, { name: 'produto', type: 'string' }, { name: 'regiao', type: 'string' }, { name: 'valor', type: 'number' }
    ])
    expect(dataset.sample).toHaveLength(5)
    expect(dataset.origin).toEqual({ path: 'specs/fixtures/ingest/vendas.csv', sha256: createHash('sha256').update(file).digest('hex') })
    expect(doc.format).toBe('csv')
    expect(doc.units).toEqual([])
    // O SourceDoc guarda só esquema e amostra: as linhas completas ficam no dataset tabular.
    expect(doc.datasets[0]).not.toHaveProperty('rows')
    expect(doc.datasets[0].sample).toHaveLength(5)
    expect((dataset.rows.find((row) => (row.valor as number) >= 1000)?.valor as number)).toBeGreaterThanOrEqual(1000)
  })

  it('vendas-br.csv: ;, BOM, CRLF, dd/mm/yyyy, números pt-BR e aspas', () => {
    const [dataset] = ingestFile({ name: 'vendas-br.csv', bytes: fixtureBytes('vendas-br.csv') }).datasets
    expect(dataset.rows).toHaveLength(30)
    // BOM removido: a primeira coluna não carrega U+FEFF.
    expect(dataset.columns.map((column) => column.name)).toEqual(['data', 'produto', 'regiao', 'valor'])
    expect(dataset.columns.map((column) => column.type)).toEqual(['date', 'string', 'string', 'number'])
    expect(dataset.rows[0].data).toBe('2024-01-01')
    expect(dataset.rows[4].produto).toBe('Cabo USB; 2m')
    expect(dataset.rows[11].produto).toBe('Monitor "Gamer"')
    expect(dataset.rows[2].produto).toBe('Teclado mecânico')
    expect(dataset.rows.every((row) => typeof row.valor === 'number')).toBe(true)
  })

  it('pt-BR: 1.234,50 vira 1234.5 e dd/mm/yyyy vira ISO', () => {
    const dataset = csv('data;valor\r\n31/12/2024;1.234,50\r\n01/02/2025;7\r\n')
    expect(dataset.rows).toEqual([{ data: '2024-12-31', valor: 1234.5 }, { data: '2025-02-01', valor: 7 }])
  })

  it('en: 1,234.50 vira 1234.5 e dd/mm/yyyy continua texto', () => {
    const dataset = csv('data,valor\n31/12/2024,"1,234.50"\n')
    expect(dataset.rows).toEqual([{ data: '31/12/2024', valor: 1234.5 }])
    expect(dataset.columns[0].type).toBe('string')
  })

  it('detecta tab, ignora delimitador dentro de aspas e aceita sobrescrita de delimitador e locale', () => {
    expect(csv('a\tb\n1\t2\n').columns.map((column) => column.name)).toEqual(['a', 'b'])
    expect(csv('"a,b";c\n1;2\n').columns.map((column) => column.name)).toEqual(['a,b', 'c'])
    expect(csv('a|b\n1|2\n', { delimiter: '|' }).rows).toEqual([{ a: 1, b: 2 }])
    expect(csv('v;w\n1,234.5;2\n', { locale: 'en' }).rows).toEqual([{ v: 1234.5, w: 2 }])
  })

  it('parser: CRLF, LF e CR, quebra de linha dentro de aspas, aspas escapadas e linhas em branco', () => {
    expect(parseCsv('a,b\r\n1,2\r\n\r\n3,4\r5,6\n', ',')).toEqual([['a', 'b'], ['1', '2'], ['3', '4'], ['5', '6']])
    expect(csv('nome,nota\n"linha1\nlinha2",5\n"disse ""oi""",6\n').rows).toEqual([
      { nome: 'linha1\nlinha2', nota: 5 }, { nome: 'disse "oi"', nota: 6 }
    ])
  })

  it('célula vazia vira null, sem inventar valor', () => {
    const dataset = csv('a,b\n1,\n,x\n')
    expect(dataset.rows).toEqual([{ a: 1, b: null }, { a: null, b: 'x' }])
    expect(dataset.columns).toEqual([{ name: 'a', type: 'number' }, { name: 'b', type: 'string' }])
  })

  it('tipos: booleano, zeros à esquerda, anos, coluna mista, datas inválidas e moeda', () => {
    const dataset = csv('ativo,cod,ano,misto,dia,preco\nTrue,00123,2023,1,2024-02-29,R$ 10\nfalse,00456,2024,abc,2024-02-29,R$ 20\n')
    expect(Object.fromEntries(dataset.columns.map((column) => [column.name, column.type]))).toEqual({
      ativo: 'boolean', cod: 'string', ano: 'number', misto: 'string', dia: 'date', preco: 'string'
    })
    expect(dataset.rows[0]).toMatchObject({ ativo: true, cod: '00123', ano: 2023, misto: '1', dia: '2024-02-29', preco: 'R$ 10' })
    expect(csv('d\n2024-02-30\n').columns[0].type).toBe('string')
    expect(csv('d\n2023-02-29\n').columns[0].type).toBe('string')
  })

  it('o id vem do nome sem acento nem extensão', () => {
    expect(ingestCsv({ name: 'C:\\dados\\Vendas Março 2024!.csv', bytes: bytes('a\n1\n') }).datasets[0].id).toBe('vendas-marco-2024')
    expect(ingestCsv({ name: '___.csv', bytes: bytes('a\n1\n') }).datasets[0].id).toBe('dados')
  })
})

describe('RF-18: limites e erros do CSV', () => {
  const invalid = (text: string, pattern: RegExp) => {
    const error = failure(() => csv(text))
    expect(error.code).toBe('E_INGEST_INVALIDO')
    expect(error.message).toMatch(pattern)
  }

  it('arquivo vazio, só cabeçalho e só linhas em branco', () => {
    invalid('', /vazio/)
    invalid('\n\r\n', /vazio/)
    invalid('a,b\n', /só tem o cabeçalho/)
  })

  it('coluna sem nome e colunas duplicadas', () => {
    invalid('a,,c\n1,2,3\n', /coluna 2/)
    invalid('a,a\n1,2\n', /"a" aparece mais de uma vez/)
  })

  it('registro com número de colunas errado cita o registro e as contagens (sem preencher nem cortar)', () => {
    invalid('a,b\n1,2\n3\n', /registro 3.*1 colunas.*2/)
    invalid('a,b\n1,2,3\n', /registro 2.*3 colunas/)
  })

  it('aspas abertas sem fechar', () => {
    invalid('a,b\n"x,2\n', /Aspas abertas/)
  })

  it('bytes que não são UTF-8 não são convertidos em silêncio', () => {
    const error = failure(() => ingestCsv({ name: 'latin1.csv', bytes: new Uint8Array([0x61, 0x0a, 0xe7, 0xe3, 0x6f, 0x0a]) }))
    expect(error.code).toBe('E_INGEST_INVALIDO')
    expect(error.message).toContain('UTF-8')
  })

  it('arquivo acima do limite de 25 MB é E_INGEST_LIMITE, antes de qualquer leitura', () => {
    const error = failure(() => ingestCsv({ name: 'grande.csv', bytes: new Uint8Array(MAX_INGEST_BYTES + 1) }))
    expect(error.code).toBe('E_INGEST_LIMITE')
    expect(error.message).toContain('25 MB')
    expect(() => ingestCsv({ name: 'no-limite.csv', bytes: bytes('a\n1\n') })).not.toThrow()
  })

  it('formato desconhecido lista os suportados', () => {
    const error = failure(() => ingestFile({ name: 'a.pdf', bytes: bytes('x') }))
    expect(error.code).toBe('E_INGEST_INVALIDO')
    expect(error.message).toContain('.csv')
    expect(failure(() => ingestFile({ name: 'semextensao', bytes: bytes('x') })).message).toContain('sem extensão')
  })

  it('ids repetidos ganham sufixo', () => {
    const sources = ingestAll([
      { name: 'a/vendas.csv', bytes: bytes('x\n1\n') },
      { name: 'b/vendas.csv', bytes: bytes('x\n2\n') },
      { name: 'c/vendas.csv', bytes: bytes('x\n3\n') }
    ])
    expect(sources.map((source) => source.datasets[0].id)).toEqual(['vendas', 'vendas-2', 'vendas-3'])
    expect(sources.map((source) => source.doc.id)).toEqual(['vendas', 'vendas-2', 'vendas-3'])
  })
})

describe('RF-11: ingestão de CSV mantém só esquema e amostra no prompt', () => {
  it('o prompt tem as colunas e no máximo 5 linhas, nunca as 100', () => {
    const { datasets } = ingestFile({ name: 'vendas.csv', bytes: fixtureBytes('vendas.csv') })
    const prompt = describeDatasetsForPrompt(datasets)
    expect(prompt).toContain('colunas: data (date), produto (string), regiao (string), valor (number)')
    expect(prompt.split('\n').filter((line) => line.startsWith('{'))).toHaveLength(5)
    expect(prompt).not.toContain(JSON.stringify(datasets[0].rows[5]))
    expect(prompt).not.toContain(JSON.stringify(datasets[0].rows[99]))
  })
})

describe('RF-18: comando ingerir', () => {
  it('mostra colunas, tipos, hash e amostra', () => {
    const result = ingerirCommand(fixturePath('vendas.csv'))
    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.output)
    expect(output.ok).toBe(true)
    expect(output.fonte).toEqual({ id: 'vendas', nome: 'vendas.csv', formato: 'csv' })
    expect(output.datasets[0].linhas).toBe(100)
    expect(output.datasets[0].colunas[3]).toEqual({ name: 'valor', type: 'number' })
    expect(output.datasets[0].amostra).toHaveLength(5)
    expect(output.datasets[0].origem.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('arquivo inexistente termina com exit 2', () => {
    const result = ingerirCommand(fixturePath('nao-existe.csv'))
    expect(result.exitCode).toBe(2)
    expect(JSON.parse(result.output).ok).toBe(false)
  })

  it('CSV inválido termina com exit 1 e o código tipado', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autoslider-'))
    try {
      const path = join(dir, 'quebrado.csv')
      writeFileSync(path, 'a,b\n1,2\n3\n')
      const result = ingerirCommand(path)
      expect(result.exitCode).toBe(1)
      expect(JSON.parse(result.output)).toMatchObject({ ok: false, code: 'E_INGEST_INVALIDO' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
