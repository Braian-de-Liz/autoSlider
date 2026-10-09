import { describe, expect, it } from 'bun:test'
import { createDesktopApp } from '../src/desktop/app.ts'
import { RUN_STATES, RunStore } from '../src/desktop/run-store.ts'

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
