import { createDesktopApp } from './app.ts'
import { Orchestrator } from '../agent/orchestrator.ts'
import { RunStore } from './run-store.ts'
import { startDesktopServer } from './runtime.ts'

const store = new RunStore()
const { app } = createDesktopApp(store, Orchestrator.fromEnv(store))
const mode = startDesktopServer(app.fetch)
if (mode === 'bun') console.log('Desktop server em http://127.0.0.1:8787')
