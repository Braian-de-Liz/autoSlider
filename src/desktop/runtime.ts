export type FetchHandler = (request: Request) => Response | Promise<Response>

export interface DesktopRuntime {
  process?: { env?: Record<string, string | undefined> }
  Deno?: {
    serve: (optionsOrHandler: { port: number } | FetchHandler, handler?: FetchHandler) => unknown
    env?: { get: (name: string) => string | undefined }
  }
  Bun?: { serve: (options: { port: number; fetch: FetchHandler }) => unknown }
}

export type ServerMode = 'deno-desktop' | 'deno-server' | 'bun'

export function startDesktopServer(handler: FetchHandler, runtime: DesktopRuntime = globalThis as DesktopRuntime): ServerMode {
  const port = Number(runtime.process?.env?.PORT ?? 8787)
  const denoDesktopAddress = runtime.Deno?.env?.get('DENO_SERVE_ADDRESS')
  if (runtime.Deno) {
    if (denoDesktopAddress) runtime.Deno.serve(handler)
    else runtime.Deno.serve({ port }, handler)
    return denoDesktopAddress ? 'deno-desktop' : 'deno-server'
  }
  if (runtime.Bun) {
    runtime.Bun.serve({ port, fetch: handler })
    return 'bun'
  }
  throw new Error('Runtime não suportado: use Bun ou Deno')
}
