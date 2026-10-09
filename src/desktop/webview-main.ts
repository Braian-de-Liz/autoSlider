// @ts-nocheck — entrypoint Deno-only; os imports JSR não fazem parte do build Bun.
import { Webview } from '@webview/webview'

// O servidor roda num Worker porque webview.run() bloqueia esta thread (chamada FFI).
const worker = new Worker(new URL('./server-worker.ts', import.meta.url).href, { type: 'module' })

const port: number = await new Promise((resolve, reject) => {
  worker.onmessage = (event) => {
    if (event.data?.type === 'listening') resolve(event.data.port)
  }
  worker.onerror = (event) => {
    event.preventDefault()
    reject(new Error(`Servidor não iniciou: ${event.message}`))
  }
})

const webview = new Webview()
webview.title = 'Gerador de Artefatos'
webview.size = { width: 1280, height: 800, hint: 0 }
webview.navigate(`http://127.0.0.1:${port}/`)
webview.run()
worker.terminate()
