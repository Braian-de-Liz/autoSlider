import { describe, expect, it } from 'bun:test'
import { startDesktopServer, type DesktopRuntime } from '../src/desktop/runtime.ts'

const handler = () => new Response('ok')

describe('RF-19: runtime Deno Desktop', () => {
  it('usa Deno.serve sem porta quando DENO_SERVE_ADDRESS existe', () => {
    let calledWith: unknown
    const runtime: DesktopRuntime = { Deno: { env: { get: () => 'tcp:127.0.0.1:54321' }, serve: (value) => { calledWith = value } } }
    expect(startDesktopServer(handler, runtime)).toBe('deno-desktop')
    expect(calledWith).toBe(handler)
  })

  it('preserva Bun como fallback explícito', () => {
    let options: unknown
    const runtime: DesktopRuntime = { process: { env: { PORT: '9999' } }, Bun: { serve: (value) => { options = value } } }
    expect(startDesktopServer(handler, runtime)).toBe('bun')
    expect(options).toEqual({ port: 9999, fetch: handler })
  })
})
