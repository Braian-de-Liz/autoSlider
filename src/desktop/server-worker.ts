// @ts-nocheck — Worker Deno-only; usa a API global Deno, fora do typecheck do Bun.
// Roda o servidor numa thread própria: webview.run() bloqueia a thread principal.
import { createDesktopApp } from './app.ts'
import { Orchestrator } from '../agent/orchestrator.ts'
import { RunStore } from './run-store.ts'

const store = new RunStore()
const { app } = createDesktopApp(store, Orchestrator.fromEnv(store))

Deno.serve({
  hostname: '127.0.0.1',
  port: 0,
  onListen: ({ port }) => {
    console.log(`Listening on http://127.0.0.1:${port}/`)
    self.postMessage({ type: 'listening', port })
  }
}, app.fetch)
