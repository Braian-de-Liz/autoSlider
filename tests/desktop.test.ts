import { describe, expect, it } from 'bun:test'
import type { TSchema } from '@sinclair/typebox'
import { Orchestrator, defaultChartRender } from '../src/agent/orchestrator.ts'
import { createDesktopApp } from '../src/desktop/app.ts'
import { RUN_STATES, RunStore, type RunEvent } from '../src/desktop/run-store.ts'
import type { GenerationResult, LLMProvider, Msg } from '../src/llm/contracts.ts'

describe('RF-19: desktop local Hono/HTMX/SSE', () => {
  it('serve UI Hono com HTMX e estado inicial determinístico', async () => {
    const { app } = createDesktopApp()
    const response = await app.request('http://desktop.test/')
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).not.toContain('https://')
    expect(html).toContain("new EventSource('/events')")
    expect(html).not.toContain('sse-connect')
    expect(html).toContain('Novo pedido')
    expect(html).toContain('Projeto atual')
    expect(html).toContain('Execução')
    expect(html).toContain('RENDERIZADA')
    expect(html).toContain('Gerar artefato')
    expect(html).toContain('Nenhum run iniciado')
  })

  it('serve o favicon embutido', async () => {
    const { app } = createDesktopApp()
    const response = await app.request('http://desktop.test/assets/logo.fav.png')
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await response.arrayBuffer())[0]).toBe(137)
  })

  it('aceita o formulário urlencoded', async () => {
    const { app } = createDesktopApp()
    const response = await app.request('http://desktop.test/api/runs', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'prompt=crie+um+grafico&kind=chart' })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('RECEBIDO')
  })

  it('publica a sequência de estados por SSE', async () => {
    const store = new RunStore()
    const { app } = createDesktopApp(store)
    const start = await app.request('http://desktop.test/api/runs', { method: 'POST' })
    expect(start.status).toBe(200)
    const stream = await app.request('http://desktop.test/events')
    expect(stream.headers.get('content-type')).toContain('text/event-stream')
    const reader = stream.body!.getReader()
    const first = new TextDecoder().decode((await reader.read()).value)
    expect(first).toContain('event: run')
    expect(first).toContain('RECEBIDO')
    await reader.cancel()
  })

  it('mantém a sequência normativa no store', async () => {
    const store = new RunStore()
    const states: string[] = []
    const unsubscribe = store.subscribe((item) => states.push(item.state))
    const event = store.start()
    expect(event.state).toBe('RECEBIDO')
    await new Promise((resolve) => setTimeout(resolve, 700))
    unsubscribe()
    expect(states).toEqual([...RUN_STATES])
  })
})

describe('RNF-09: servidor não bloqueante', () => {
  it('responde uma requisição enquanto o run avança assincronamente', async () => {
    const { app } = createDesktopApp()
    const started = Date.now()
    const runResponse = await app.request('http://desktop.test/api/runs', { method: 'POST' })
    const healthResponse = await app.request('http://desktop.test/api/runs')
    expect(runResponse.status).toBe(200)
    expect(healthResponse.status).toBe(200)
    expect(Date.now() - started).toBeLessThan(100)
  })
})

describe('RF-19: upload de anexos no desktop', () => {
  const chart = { id: 'estoque-item', tipo: 'bar', datasetId: 'estoque', x: { campo: 'item', titulo: 'Item' }, y: { campo: 'qtd', titulo: 'Quantidade', agregacao: 'sum' }, titulo: 'Estoque por item' }
  const sampleChart = { id: 'vendas-categoria', tipo: 'bar', datasetId: 'vendas', x: { campo: 'categoria', titulo: 'Categoria' }, y: { campo: 'valor', titulo: 'Valor', agregacao: 'sum' }, titulo: 'Vendas por categoria' }
  const csv = (text: string, name = 'estoque.csv') => new File([new TextEncoder().encode(text)], name, { type: 'text/csv' })

  /** App com provider falso que registra o prompt; devolve o evento terminal do run. */
  async function post(body: BodyInit, reply: unknown, headers?: HeadersInit) {
    const calls = { count: 0, prompt: '' }
    const provider: LLMProvider = {
      caps: { constrainedJson: true, ctx: 8192, remote: false },
      async generate<T extends TSchema>(args: { messages: Msg[] }): Promise<GenerationResult<T>> {
        calls.count++
        calls.prompt = args.messages[0].content
        return { value: reply as T, usage: { provider: 'fake', model: 'fixture', durationMs: 0 } }
      }
    }
    const store = new RunStore()
    const { app } = createDesktopApp(store, new Orchestrator(store, provider, defaultChartRender))
    const terminal = new Promise<RunEvent>((resolve) => { store.subscribe((event) => { if (event.state === 'ENTREGUE' || event.state === 'FALHOU') resolve(event) }) })
    const response = await app.request('http://desktop.test/api/runs', { method: 'POST', body, headers })
    expect(response.status).toBe(200)
    return { event: await terminal, calls, app }
  }

  const form = (...files: File[]) => {
    const data = new FormData()
    data.set('prompt', 'gráfico do estoque')
    data.set('kind', 'chart')
    for (const file of files) data.append('anexo', file)
    return data
  }

  it('o CSV enviado em multipart vira o catálogo do run e o gráfico é entregue', async () => {
    const { event, calls, app } = await post(form(csv('item,qtd\nParafuso,100\nPorca,80\n')), chart)
    expect(event.state).toBe('ENTREGUE')
    expect(calls.prompt).toContain('dataset id="estoque"')
    expect(calls.prompt).not.toContain('dataset id="vendas"')
    const png = await app.request(`http://desktop.test/api/runs/${event.runId}/artifact/png`)
    expect([...new Uint8Array(await png.arrayBuffer()).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('vários anexos no mesmo envio recebem ids distintos', async () => {
    const { calls } = await post(form(csv('item,qtd\nA,1\n'), csv('item,qtd\nB,2\n')), chart)
    expect(calls.prompt).toContain('dataset id="estoque"')
    expect(calls.prompt).toContain('dataset id="estoque-2"')
  })

  it('formulário sem arquivo escolhido (parte vazia) usa o dataset de exemplo', async () => {
    const { event, calls } = await post(form(new File([], '')), sampleChart)
    expect(event.state).toBe('ENTREGUE')
    expect(calls.prompt).toContain('dataset id="vendas"')
  })

  it('urlencoded e JSON continuam funcionando, sem anexos', async () => {
    const urlencoded = await post('prompt=gr%C3%A1fico&kind=chart', sampleChart, { 'content-type': 'application/x-www-form-urlencoded' })
    expect(urlencoded.event.state).toBe('ENTREGUE')
    const json = await post(JSON.stringify({ prompt: 'gráfico', kind: 'chart' }), sampleChart, { 'content-type': 'application/json' })
    expect(json.event.state).toBe('ENTREGUE')
    expect(json.calls.prompt).toContain('dataset id="vendas"')
  })

  it('arquivo inválido termina em FALHOU com E_INGEST_INVALIDO, sem chamar o modelo', async () => {
    const { event, calls } = await post(form(csv('a,b\n1,2\n3\n', 'quebrado.csv')), chart)
    expect(event).toMatchObject({ state: 'FALHOU', errorCode: 'E_INGEST_INVALIDO' })
    expect(event.message).toContain('registro 3')
    expect(calls.count).toBe(0)
  })

  it('formato de anexo não suportado termina em FALHOU com E_INGEST_INVALIDO', async () => {
    const { event, calls } = await post(form(new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' })), chart)
    expect(event).toMatchObject({ state: 'FALHOU', errorCode: 'E_INGEST_INVALIDO' })
    expect(calls.count).toBe(0)
  })

  it('a página tem o campo de arquivo e envia o FormData inteiro, não URLSearchParams', async () => {
    const html = await (await createDesktopApp().app.request('http://desktop.test/')).text()
    expect(html).toContain('<input type="file" id="anexo" name="anexo" multiple accept=".csv,.md,.markdown">')
    expect(html).toContain('Anexos (CSV ou Markdown)')
    expect(html).toContain('new FormData(form)')
    expect(html).not.toContain('URLSearchParams(new FormData')
  })
})
