import { Hono } from 'hono'
import type { Attachment, Orchestrator } from '../agent/orchestrator.ts'
import { RunStore, type RunEvent } from './run-store.ts'
import { pageTemplate, statusTemplate } from './templates.ts'
import { FAVICON_1X1_PNG } from './static-content.ts'

export function createDesktopApp(store = new RunStore(), orchestrator?: Orchestrator) {
  const app = new Hono()

  app.get('/', (c) => c.html(pageTemplate(store.latest(), orchestrator?.describe())))
  app.get('/assets/logo.fav.png', () => new Response(FAVICON_1X1_PNG as unknown as BodyInit, { headers: { 'content-type': 'image/png' } }))
  app.get('/api/runs', (c) => c.json(store.all()))
  app.get('/api/runs/:runId/candidate', (c) => {
    const candidate = store.getCandidate(c.req.param('runId'))
    return candidate === undefined ? c.notFound() : c.json(candidate)
  })
  app.get('/api/runs/:runId/artifact/:format', (c) => {
    const artifact = store.getArtifact(c.req.param('runId'))
    const format = c.req.param('format')
    if (!artifact || (format !== 'png' && format !== 'svg')) return c.notFound()
    return new Response((format === 'png' ? artifact.png : artifact.svg) as unknown as BodyInit, { headers: { 'content-type': format === 'png' ? 'image/png' : 'image/svg+xml', 'cache-control': 'no-store', 'content-disposition': 'inline' } })
  })
  app.post('/api/runs', async (c) => {
    const contentType = c.req.header('content-type') ?? ''
    let prompt = ''
    let kind = ''
    let attachments: Attachment[] = []
    if (contentType.includes('application/json')) {
      const body = await c.req.json<{ prompt?: string; kind?: string }>()
      prompt = body.prompt ?? ''
      kind = body.kind ?? ''
    } else {
      const body = await c.req.parseBody({ all: true })
      const field = (name: string) => String([body[name]].flat()[0] ?? '')
      prompt = field('prompt')
      kind = field('kind')
      // Formulário sem arquivo escolhido manda uma parte vazia (nome ''): não é anexo.
      const files = [body.anexo].flat().filter((value): value is File => value instanceof File && value.size > 0 && value.name !== '')
      attachments = await Promise.all(files.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })))
    }
    const first = orchestrator
      ? orchestrator.start({ prompt: prompt || 'Crie um gráfico de vendas por categoria.', kind: kind || undefined, ...(attachments.length ? { attachments } : {}) })
      : store.start()
    // O run pode já ter avançado (ou falhado) antes desta resposta; devolve o estado atual.
    return c.html(statusTemplate(store.get(first.runId) ?? first))
  })
  app.get('/events', (c) => {
    const encoder = new TextEncoder()
    let unsubscribe = () => {}
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: RunEvent) => controller.enqueue(encoder.encode(`event: run\ndata: ${statusTemplate(event).replaceAll('\n', '')}\n\n`))
        const latest = store.latest()
        if (latest) send(latest)
        unsubscribe = store.subscribe(send)
      },
      cancel() { unsubscribe() }
    })
    return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' } })
  })
  return { app, store }
}
