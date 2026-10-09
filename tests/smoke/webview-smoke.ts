// @ts-nocheck — script Deno-only, fora do typecheck do Bun.
// Smoke test do app desktop: abre a janela real e faz HTTP GET enquanto webview.run() está ativo.
// Uso: deno run --allow-run --allow-net tests/smoke/webview-smoke.ts
const child = new Deno.Command('deno', {
  args: ['run', '--allow-all', 'src/desktop/webview-main.ts'],
  stdout: 'piped',
  stderr: 'inherit'
}).spawn()

const decoder = new TextDecoder()
let buffer = ''
let port: string | undefined
const reader = child.stdout.getReader()
const deadline = setTimeout(() => { child.kill(); console.error('FALHOU: servidor não anunciou a porta em 30s'); Deno.exit(1) }, 30_000)

while (!port) {
  const { value, done } = await reader.read()
  if (done) break
  buffer += decoder.decode(value)
  port = buffer.match(/Listening on http:\/\/127\.0\.0\.1:(\d+)\//)?.[1]
}
clearTimeout(deadline)
reader.releaseLock()

let ok = false
try {
  if (!port) throw new Error('processo encerrou antes de anunciar a porta')
  // Espera a janela abrir e webview.run() assumir a thread principal antes de testar.
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const page = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(5000) })
  const html = await page.text()
  const icon = await fetch(`http://127.0.0.1:${port}/assets/logo.fav.png`, { signal: AbortSignal.timeout(5000) })
  await icon.body?.cancel()
  ok = page.status === 200 && html.includes('Gerador de Artefatos') && icon.headers.get('content-type') === 'image/png'
  console.log(`GET / -> ${page.status}; favicon -> ${icon.headers.get('content-type')}`)
} catch (error) {
  console.error(`FALHOU: ${error instanceof Error ? error.message : String(error)}`)
} finally {
  child.kill()
  await child.status
}
console.log(ok ? 'SMOKE OK: servidor respondeu com a janela aberta' : 'SMOKE FALHOU')
Deno.exit(ok ? 0 : 1)
