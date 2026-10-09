import { describe, expect, it } from 'bun:test'
import type { TSchema } from '@sinclair/typebox'
import { createDesktopApp } from '../src/desktop/app.ts'
import { Orchestrator, type ChartRender, type OrchestratorOptions } from '../src/agent/orchestrator.ts'
import { RunStore, type RunEvent } from '../src/desktop/run-store.ts'
import { DatasetCatalog, makeDataset } from '../src/data/catalog.ts'
import { LLMError, type GenerationResult, type LLMProvider, type Msg } from '../src/llm/contracts.ts'

// Usa o dataset de exemplo "vendas" (categoria, regiao, valor).
const validChart = { id: 'c1', tipo: 'bar' as const, datasetId: 'vendas', x: { campo: 'categoria', titulo: 'Categoria' }, y: { campo: 'valor', titulo: 'Valor', agregacao: 'sum' as const }, titulo: 'Vendas por categoria' }

interface Calls { count: number; system?: string; messages?: Msg[] }

function fakeProvider(value: unknown, options: { error?: Error; remote?: boolean; calls?: Calls } = {}): LLMProvider {
  return {
    caps: { constrainedJson: true, ctx: 8192, remote: options.remote ?? false },
    async generate<T extends TSchema>(args: { system: string; messages: Msg[] }): Promise<GenerationResult<T>> {
      if (options.calls) { options.calls.count++; options.calls.system = args.system; options.calls.messages = args.messages }
      if (options.error) throw options.error
      return { value: value as T, usage: { provider: 'fake', model: 'fixture', durationMs: 0 } }
    }
  }
}

const fakeRenderer: ChartRender = async () => ({
  artifact: { path: 'x.png', svgPath: 'x.svg', pngPath: 'x.png', hash: 'a'.repeat(64), rendererVersion: 'test' },
  png: new Uint8Array([137, 80, 78, 71]),
  svg: new TextEncoder().encode('<svg></svg>')
})

async function runOnce(provider: LLMProvider, request: { prompt: string; kind?: string } = { prompt: 'gráfico' }, options?: OrchestratorOptions, renderer: ChartRender = fakeRenderer): Promise<RunEvent> {
  const store = new RunStore()
  const terminal = waitForTerminal(store)
  new Orchestrator(store, provider, renderer, options).start(request)
  return await terminal
}

async function waitForTerminal(store: RunStore): Promise<RunEvent> {
  return await new Promise((resolve) => {
    const unsubscribe = store.subscribe((event) => {
      if (event.state === 'ENTREGUE' || event.state === 'FALHOU') {
        unsubscribe()
        resolve(event)
      }
    })
  })
}

describe('RF-03: Orchestrator com ChartSpec', () => {
  it('gera, valida e entrega uma ChartSpec pelo POST /api/runs', async () => {
    const store = new RunStore()
    const { app } = createDesktopApp(store, new Orchestrator(store, fakeProvider(validChart), fakeRenderer))
    const terminal = waitForTerminal(store)
    const response = await app.request('http://desktop.test/api/runs', { method: 'POST', body: JSON.stringify({ prompt: 'gráfico de vendas', kind: 'chart' }), headers: { 'content-type': 'application/json' } })
    expect(response.status).toBe(200)
    expect((await terminal).state).toBe('ENTREGUE')
  })

  it('termina em FALHOU com E_SPEC_SCHEMA quando a saída viola o schema', async () => {
    const event = await runOnce(fakeProvider({ id: '' }))
    expect(event.state).toBe('FALHOU')
    expect(event.errorCode).toBe('E_SPEC_SCHEMA')
  })

  it('termina em FALHOU com E_PROVIDER quando o provider falha', async () => {
    const event = await runOnce(fakeProvider(validChart, { error: new Error('timeout fixture') }))
    expect(event.errorCode).toBe('E_PROVIDER')
  })

  it('termina em FALHOU com E_RENDER quando o renderer falha', async () => {
    const event = await runOnce(fakeProvider(validChart), undefined, undefined, async () => { throw new Error('resvg quebrou') })
    expect(event.errorCode).toBe('E_RENDER')
  })
})

describe('Seção 6.4: validação semântica', () => {
  it('E_REF: datasetId inexistente', async () => {
    const event = await runOnce(fakeProvider({ ...validChart, datasetId: 'nao-existe' }))
    expect(event.errorCode).toBe('E_SPEC_SEMANTICA')
    expect(event.message).toContain('E_REF')
  })

  it('E_CAMPO: soma em coluna de texto', async () => {
    const event = await runOnce(fakeProvider({ ...validChart, y: { campo: 'regiao', titulo: 'Região', agregacao: 'sum' } }))
    expect(event.errorCode).toBe('E_SPEC_SEMANTICA')
    expect(event.message).toContain('E_CAMPO')
  })

  it('RNF-04: número no título sem origem nos dados', async () => {
    const event = await runOnce(fakeProvider({ ...validChart, titulo: 'Vendas de 2031' }))
    expect(event.errorCode).toBe('E_SPEC_SEMANTICA')
    expect(event.message).toContain('E_NUMERO_SEM_ORIGEM')
  })
})

describe('E_ROTA: formato não suportado', () => {
  it('recusa pptx sem chamar o provedor', async () => {
    const calls: Calls = { count: 0 }
    const event = await runOnce(fakeProvider(validChart, { calls }), { prompt: 'slides', kind: 'pptx' })
    expect(event.errorCode).toBe('E_ROTA')
    expect(calls.count).toBe(0)
  })
})

describe('RF-09: localOnly', () => {
  it('bloqueia provedor remoto sem enviar nada', async () => {
    const calls: Calls = { count: 0 }
    const event = await runOnce(fakeProvider(validChart, { remote: true, calls }), undefined, { project: { name: 'p', localOnly: true } })
    expect(event.errorCode).toBe('E_LOCAL_ONLY')
    expect(calls.count).toBe(0)
  })

  it('permite provedor remoto quando o projeto não é localOnly', async () => {
    const event = await runOnce(fakeProvider(validChart, { remote: true }), undefined, { project: { name: 'p', localOnly: false } })
    expect(event.state).toBe('ENTREGUE')
  })
})

describe('RF-11: só esquema e amostra entram no prompt', () => {
  it('envia colunas e no máximo 5 linhas, nunca o dataset inteiro', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ categoria: `cat-${i}`, valor: i + 1 }))
    const catalog = new DatasetCatalog([makeDataset('grande', 'Grande', [{ name: 'categoria', type: 'string' }, { name: 'valor', type: 'number' }], rows)])
    const calls: Calls = { count: 0 }
    await runOnce(fakeProvider({ ...validChart, datasetId: 'grande', titulo: 'Grande' }, { calls }), undefined, { catalog })
    const content = calls.messages?.map((message) => message.content).join('\n') ?? ''
    expect(content).toContain('categoria (string)')
    expect(content).toContain('cat-4')
    for (const hidden of ['cat-5', 'cat-6', 'cat-7']) expect(content).not.toContain(hidden)
    expect(content).toContain('<datasets>')
  })
})

describe('RF-03: retentativas guiadas pelo erro', () => {
  function sequenceProvider(values: unknown[], calls: { messages: Msg[][] }): LLMProvider {
    return {
      caps: { constrainedJson: true, ctx: 8192, remote: false },
      async generate<T extends TSchema>(args: { messages: Msg[] }): Promise<GenerationResult<T>> {
        calls.messages.push(args.messages.map((message) => ({ ...message })))
        const next = values[Math.min(calls.messages.length - 1, values.length - 1)]
        if (next instanceof Error) throw next
        return { value: next as T, usage: { provider: 'fake', model: 'fixture', durationMs: 0 } }
      }
    }
  }

  it('corrige na segunda tentativa com o caminho e a regra violada', async () => {
    const calls = { messages: [] as Msg[][] }
    const store = new RunStore()
    const states: string[] = []
    store.subscribe((event) => states.push(event.state))
    const terminal = waitForTerminal(store)
    new Orchestrator(store, sequenceProvider([{ ...validChart, x: { campo: 'produto', titulo: 'P' } }, validChart], calls), fakeRenderer).start({ prompt: 'x' })
    expect((await terminal).state).toBe('ENTREGUE')
    expect(calls.messages).toHaveLength(2)
    const feedback = calls.messages[1].at(-1)!.content
    expect(feedback).toContain('/x/campo')
    expect(feedback).toContain('E_CAMPO')
    expect(calls.messages[1].at(-2)!.role).toBe('assistant')
    expect(states).toContain('SPEC_INVALIDA')
  })

  it('para após 3 tentativas e preserva a última candidata', async () => {
    const calls = { messages: [] as Msg[][] }
    const bad = { ...validChart, datasetId: 'nao-existe' }
    const store = new RunStore()
    const terminal = waitForTerminal(store)
    new Orchestrator(store, sequenceProvider([bad], calls), fakeRenderer).start({ prompt: 'x' })
    const event = await terminal
    expect(event.errorCode).toBe('E_SPEC_SEMANTICA')
    expect(event.message).toContain('3 tentativas')
    expect(calls.messages).toHaveLength(3)
    expect(store.getCandidate(event.runId)).toEqual(bad)
  })

  it('JSON ilegível consome retentativa como E_SPEC_SCHEMA', async () => {
    const calls = { messages: [] as Msg[][] }
    const parse = new LLMError('E_SPEC_PARSE', 'A resposta do modelo não é um JSON válido.')
    const event = await runOnce(sequenceProvider([parse, parse, parse], calls))
    expect(event.errorCode).toBe('E_SPEC_SCHEMA')
    expect(calls.messages).toHaveLength(3)
  })

  it('erro de provedor não é repetido', async () => {
    const calls = { messages: [] as Msg[][] }
    const event = await runOnce(sequenceProvider([new LLMError('E_PROVIDER', 'timeout')], calls))
    expect(event.errorCode).toBe('E_PROVIDER')
    expect(calls.messages).toHaveLength(1)
  })
})

describe('RF-04: entrega do artefato', () => {
  it('registra bytes e entrega PNG/SVG pela API', async () => {
    const store = new RunStore()
    const { app } = createDesktopApp(store, new Orchestrator(store, fakeProvider(validChart), fakeRenderer))
    const terminal = waitForTerminal(store)
    await app.request('http://desktop.test/api/runs', { method: 'POST' })
    const event = await terminal
    const png = await app.request(`http://desktop.test/api/runs/${event.runId}/artifact/png`)
    const svg = await app.request(`http://desktop.test/api/runs/${event.runId}/artifact/svg`)
    expect(png.headers.get('content-type')).toContain('image/png')
    expect(new Uint8Array(await png.arrayBuffer())[0]).toBe(137)
    expect(svg.headers.get('content-type')).toContain('image/svg+xml')
  })

  it('POST devolve o estado atual quando o run já falhou', async () => {
    const store = new RunStore()
    const { app } = createDesktopApp(store, new Orchestrator(store, fakeProvider(validChart), fakeRenderer))
    const response = await app.request('http://desktop.test/api/runs', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'prompt=x&kind=pptx' })
    expect(await response.text()).toContain('E_ROTA')
  })
})

describe('Interface reflete o projeto real', () => {
  it('mostra localOnly, provedor e desabilita formatos sem pipeline', async () => {
    const store = new RunStore()
    const orchestrator = new Orchestrator(store, fakeProvider(validChart), fakeRenderer, { providerLabel: { provider: 'ollama-native', model: 'qwen3:8b' } })
    const html = await (await createDesktopApp(store, orchestrator).app.request('http://desktop.test/')).text()
    expect(html).toContain('localOnly')
    expect(html).toContain('qwen3:8b')
    expect(html).toContain('<option value="chart">')
    expect(html).toContain('<option value="pptx" disabled>')
    expect(html).toContain('vendas')
  })
})
