import { describe, expect, it } from 'bun:test'
import type { Static, TSchema } from '@sinclair/typebox'
import { DECK_REQUESTS, renderDeckReport, runDeckProbe } from '../src/agent/probe-deck.ts'
import { probeDeckCommand, type ProbeDeckDeps } from '../src/commands/probe-deck.ts'
import { DatasetCatalog, SAMPLE_DATASETS } from '../src/data/catalog.ts'
import { LLMError, type LLMProvider, type Msg } from '../src/llm/contracts.ts'
import { readFileSync } from 'node:fs'

const label = { provider: 'fake', model: 'fake-1' }
const usage = { provider: 'fake', model: 'fake-1', durationMs: 1, outputTokens: 10 }

const minimal = { specVersion: '1.0', title: 'Teste', lang: 'pt-BR', kind: 'pptx', charts: [], slides: [{ layout: 'titulo', titulo: 'Olá' }] }
const badFirstSlide = { ...minimal, slides: [{ layout: 'bullets', titulo: 'A', itens: ['x'] }] }

/** Provedor falso: devolve ou lança o próximo item da fila e guarda as mensagens recebidas. */
function fakeProvider(queue: (unknown | Error)[], remote = false) {
  const calls: Msg[][] = []
  const provider: LLMProvider = {
    caps: { constrainedJson: true, ctx: 8192, remote },
    async generate<T extends TSchema>(args: { messages: Msg[] }) {
      calls.push([...args.messages])
      const next = queue.length > 1 ? queue.shift() : queue[0]
      if (next instanceof Error) throw next
      return { value: next as Static<T>, usage }
    }
  }
  return { provider, calls }
}

const catalogFor = () => new DatasetCatalog(SAMPLE_DATASETS)
const one = DECK_REQUESTS.slice(0, 1)

describe('RF-22: sonda de apresentação (runDeckProbe)', () => {
  it('há 10 pedidos com ids únicos, cobrindo fontes e a armadilha de número inventado', () => {
    expect(DECK_REQUESTS).toHaveLength(10)
    expect(new Set(DECK_REQUESTS.map((request) => request.id)).size).toBe(10)
    expect(new Set(DECK_REQUESTS.map((request) => request.fonte)).size).toBe(4)
    expect(DECK_REQUESTS.some((request) => /35%/.test(request.prompt))).toBe(true)
  })

  it('conta válida de primeira e devolve a spec para leitura', async () => {
    const { provider, calls } = fakeProvider([minimal])
    const report = await runDeckProbe(provider, label, one, { catalogFor })
    expect(report).toMatchObject({ total: 1, firstAttemptValid: 1, finallyValid: 1, byErrorCode: {} })
    expect(report.results[0]).toMatchObject({ ok: true, attempts: 1, outputTokens: 10 })
    expect(calls).toHaveLength(1)
    expect(calls[0][0].content).toContain('<pedido>')
  })

  it('retenta com "Campo <caminho> — <regra>" e conta o primeiro erro por código', async () => {
    const { provider, calls } = fakeProvider([badFirstSlide, minimal])
    const report = await runDeckProbe(provider, label, one, { catalogFor })
    expect(report).toMatchObject({ firstAttemptValid: 0, finallyValid: 1, byErrorCode: { E_SPEC_SCHEMA: 1 } })
    expect(report.results[0].attempts).toBe(2)
    expect(calls[1].at(-1)?.content).toContain('Campo /slides/0/layout')
    expect(calls[1].some((message) => message.role === 'assistant')).toBe(true)
  })

  it('desiste após 1 tentativa + 2 retentativas e guarda a última candidata', async () => {
    const { provider, calls } = fakeProvider([badFirstSlide])
    const report = await runDeckProbe(provider, label, one, { catalogFor })
    expect(calls).toHaveLength(3)
    expect(report.results[0]).toMatchObject({ ok: false, attempts: 3, error: { code: 'E_SPEC_SCHEMA' } })
    expect(report.results[0].spec).toEqual(badFirstSlide)
    expect(report.results[0].failures).toHaveLength(3)
  })

  it('erro de provedor não consome retentativa e a sonda segue para o próximo pedido', async () => {
    const { provider, calls } = fakeProvider([new LLMError('E_PROVIDER', 'sem conexão'), minimal])
    const report = await runDeckProbe(provider, label, DECK_REQUESTS.slice(0, 2), { catalogFor })
    expect(calls).toHaveLength(2)
    expect(report.results[0]).toMatchObject({ ok: false, attempts: 1, error: { code: 'E_PROVIDER' } })
    expect(report.results[1].ok).toBe(true)
  })

  it('o relatório legível mostra layouts, itens, notas e as falhas', async () => {
    const withNotes = { ...minimal, slides: [{ layout: 'titulo', titulo: 'Olá' }, { layout: 'bullets', titulo: 'Pontos', itens: ['um', 'dois'] }], notas: { '2': 'Fale devagar' } }
    const { provider } = fakeProvider([badFirstSlide, withNotes])
    const text = renderDeckReport(await runDeckProbe(provider, label, one, { catalogFor }))
    expect(text).toContain('Válidas de primeira: 0 de 1')
    expect(text).toContain('tentativa 1 falhou: E_SPEC_SCHEMA em /slides/0/layout')
    expect(text).toContain('**2. [bullets] Pontos**')
    expect(text).toContain('- dois')
    expect(text).toContain('Fale devagar')
  })
})

describe('RNF-04: a sonda barra número sem origem', () => {
  it('conta E_NUMERO_SEM_ORIGEM como primeiro erro quando o modelo repete o número da armadilha', async () => {
    const trap = { ...minimal, slides: [{ layout: 'titulo', titulo: 'Vendas', subtitulo: 'Crescimento de 35%' }] }
    const { provider } = fakeProvider([trap, minimal])
    const report = await runDeckProbe(provider, label, one, { catalogFor })
    expect(report.byErrorCode).toEqual({ E_NUMERO_SEM_ORIGEM: 1 })
    expect(report.results[0].failures[0]).toMatchObject({ code: 'E_NUMERO_SEM_ORIGEM', path: '/slides/0/subtitulo' })
  })
})

describe('RF-22: comando probe --schema deck', () => {
  function deps(overrides: Partial<ProbeDeckDeps> = {}) {
    const written = new Map<string, string>()
    const { provider, calls } = fakeProvider([minimal])
    const base: ProbeDeckDeps = {
      provider,
      label,
      localOnly: true,
      cwd: process.cwd(),
      readFile: (path) => new Uint8Array(readFileSync(path)),
      writeFile: (path, data) => { written.set(path.replaceAll('\\', '/'), data) },
      mkdir: () => {},
      now: () => new Date('2026-10-12T22:00:00.000Z'),
      ...overrides
    }
    return { base, written, calls }
  }

  it('roda os 10 pedidos (carregando os fixtures reais) e grava o JSON e o Markdown em artifacts/', async () => {
    const { base, written, calls } = deps()
    const result = await probeDeckCommand([], base)
    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.output)
    expect(output).toMatchObject({ ok: true, total: 10, validasDePrimeira: 10 })
    expect(calls).toHaveLength(10)
    const files = [...written.keys()]
    expect(files.some((file) => file.endsWith('artifacts/probe-deck/2026-10-12T22-00-00-000Z/probe-deck.json'))).toBe(true)
    expect(files.some((file) => file.endsWith('probe-deck.md'))).toBe(true)
    // O prompt dos pedidos com fixture traz o esquema real do CSV.
    expect(calls.some((messages) => messages[0].content.includes('produto (string)'))).toBe(true)
  })

  it('--only roda só os pedidos escolhidos', async () => {
    const { base, calls } = deps()
    const result = await probeDeckCommand(['--only', 'd03,D10'], base)
    expect(result.exitCode).toBe(0)
    expect(calls).toHaveLength(2)
  })

  it('pedido desconhecido, opção sem valor e argumento solto são erro de uso (exit 2)', async () => {
    const { base, calls } = deps()
    expect((await probeDeckCommand(['--only', 'D99'], base)).exitCode).toBe(2)
    expect((await probeDeckCommand(['--out'], base)).exitCode).toBe(2)
    expect((await probeDeckCommand(['solto'], base)).exitCode).toBe(2)
    expect(calls).toHaveLength(0)
  })

  it('projeto localOnly com provedor remoto termina em E_LOCAL_ONLY sem chamar o modelo', async () => {
    const remote = fakeProvider([minimal], true)
    const { base } = deps({ provider: remote.provider })
    const result = await probeDeckCommand([], base)
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.output).code).toBe('E_LOCAL_ONLY')
    expect(remote.calls).toHaveLength(0)
  })

  it('provedor fora do ar: para após 3 falhas seguidas e o comando falha com E_PROVIDER, sem gravar relatório', async () => {
    const down = fakeProvider([new LLMError('E_PROVIDER', 'sem conexão')])
    const { base, written } = deps({ provider: down.provider })
    const result = await probeDeckCommand([], base)
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.output)).toMatchObject({ ok: false, code: 'E_PROVIDER' })
    expect(JSON.parse(result.output).message).toContain('7 não rodaram')
    expect(down.calls).toHaveLength(3)
    expect(written.size).toBe(0)
  })

  it('--out fora do diretório de trabalho é E_CONFIG_INVALIDA antes de chamar o modelo', async () => {
    const { base, calls } = deps()
    const result = await probeDeckCommand(['--out', '../fora'], base)
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.output).code).toBe('E_CONFIG_INVALIDA')
    expect(calls).toHaveLength(0)
  })
})
