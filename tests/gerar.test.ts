import { describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import type { TSchema } from '@sinclair/typebox'
import { Orchestrator, defaultChartRender } from '../src/agent/orchestrator.ts'
import { gerarCommand } from '../src/commands/gerar.ts'
import { LLMError, type GenerationResult, type LLMProvider, type Msg } from '../src/llm/contracts.ts'

const VENDAS = join(import.meta.dirname ?? '.', '..', 'specs', 'fixtures', 'ingest', 'vendas.csv')
const chart = { id: 'vendas-produto', tipo: 'bar', datasetId: 'vendas', x: { campo: 'produto', titulo: 'Produto' }, y: { campo: 'valor', titulo: 'Valor', agregacao: 'sum' }, titulo: 'Valor por produto' }

interface Calls { count: number; messages?: Msg[] }

function provider(value: unknown, calls: Calls = { count: 0 }): LLMProvider {
  return {
    caps: { constrainedJson: true, ctx: 8192, remote: false },
    async generate<T extends TSchema>(args: { messages: Msg[] }): Promise<GenerationResult<T>> {
      calls.count++
      calls.messages = args.messages
      if (value instanceof Error) throw value
      return { value: value as T, usage: { provider: 'fake', model: 'fixture', durationMs: 0 } }
    }
  }
}

/** Roda `fn` num diretório de trabalho temporário e o apaga ao fim. */
async function inTempDir<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = mkdtempSync(join(tmpdir(), 'autoslider-gerar-'))
  try { return await fn(cwd) } finally { rmSync(cwd, { recursive: true, force: true }) }
}

const run = (argv: string[], cwd: string, value: unknown = chart, calls?: Calls) =>
  gerarCommand(argv, { cwd, createOrchestrator: (store) => new Orchestrator(store, provider(value, calls), defaultChartRender) })

describe('RF-04: comando gerar', () => {
  it('lê o anexo, roda o pipeline e grava PNG e SVG em artifacts/<runId>', async () => {
    await inTempDir(async (cwd) => {
      const result = await run(['--anexo', VENDAS, 'gráfico de barras com o valor por produto'], cwd)
      expect(result.exitCode).toBe(0)
      const output = JSON.parse(result.output)
      expect(output).toMatchObject({ ok: true, tentativas: 1 })
      expect(output.estados).toEqual(['RECEBIDO', 'ROTEADO', 'SPEC_GERADA', 'VALIDADA', 'RENDERIZADA', 'ENTREGUE'])
      expect(output.arquivos).toHaveLength(2)
      const dir = join(cwd, 'artifacts', output.runId)
      for (const path of output.arquivos as string[]) expect(path.startsWith(dir + sep)).toBe(true)
      const [png, svg] = (output.arquivos as string[]).sort((a, b) => (a.endsWith('.png') ? -1 : 1) - (b.endsWith('.png') ? -1 : 1))
      expect([...readFileSync(png).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
      expect(readFileSync(svg, 'utf8')).toContain('<svg')
      expect(readdirSync(dir).sort()).toEqual(output.arquivos.map((path: string) => path.split(sep).pop()).sort())
    })
  })

  it('--out grava na pasta pedida, criando-a', async () => {
    await inTempDir(async (cwd) => {
      const result = await run(['--anexo', VENDAS, '--out', join('saida', 'graficos'), 'gráfico'], cwd)
      expect(result.exitCode).toBe(0)
      expect(readdirSync(join(cwd, 'saida', 'graficos'))).toHaveLength(2)
      expect(existsSync(join(cwd, 'artifacts'))).toBe(false)
    })
  })

  it('palavras soltas viram um único pedido', async () => {
    await inTempDir(async (cwd) => {
      const calls: Calls = { count: 0 }
      await run(['--anexo', VENDAS, 'gráfico', 'de', 'barras'], cwd, chart, calls)
      expect(calls.messages![0].content).toContain('<pedido>\ngráfico de barras\n</pedido>')
    })
  })

  it('--out fora do diretório de trabalho é recusado antes de chamar o modelo', async () => {
    await inTempDir(async (cwd) => {
      const calls: Calls = { count: 0 }
      for (const out of [`..${sep}fora`, '../fora', join(cwd, '..', 'fora')]) {
        const result = await run(['--anexo', VENDAS, '--out', out, 'gráfico'], cwd, chart, calls)
        expect(result.exitCode).toBe(1)
        expect(JSON.parse(result.output)).toMatchObject({ ok: false, code: 'E_CONFIG_INVALIDA' })
      }
      expect(calls.count).toBe(0)
    })
  })

  it('uso incorreto termina com exit 2: sem pedido, opção desconhecida, opção sem valor e anexo inexistente', async () => {
    await inTempDir(async (cwd) => {
      for (const argv of [[], ['--anexo', VENDAS], ['--foo', 'x'], ['gráfico', '--out'], ['--kind', '--anexo', VENDAS, 'x'], ['--anexo', join(cwd, 'nao-existe.csv'), 'gráfico']]) {
        const result = await run(argv, cwd)
        expect(result.exitCode).toBe(2)
        expect(JSON.parse(result.output).ok).toBe(false)
      }
      expect(JSON.parse((await run(['--anexo', join(cwd, 'nao-existe.csv'), 'x'], cwd)).output).message).toContain('nao-existe.csv')
    })
  })

  it('erro de ingestão termina com exit 1, o código tipado e nenhum arquivo gravado', async () => {
    await inTempDir(async (cwd) => {
      const broken = join(cwd, 'quebrado.csv')
      writeFileSync(broken, 'a,b\n1,2\n3\n')
      const calls: Calls = { count: 0 }
      const result = await run(['--anexo', broken, 'gráfico'], cwd, chart, calls)
      expect(result.exitCode).toBe(1)
      expect(JSON.parse(result.output)).toMatchObject({ ok: false, code: 'E_INGEST_INVALIDO' })
      expect(calls.count).toBe(0)
      expect(existsSync(join(cwd, 'artifacts'))).toBe(false)
    })
  })

  it('falha do provedor e formato sem pipeline terminam com exit 1 e o código tipado', async () => {
    await inTempDir(async (cwd) => {
      const failed = await run(['--anexo', VENDAS, 'gráfico'], cwd, new LLMError('E_PROVIDER', 'fora do ar'))
      expect(failed.exitCode).toBe(1)
      expect(JSON.parse(failed.output)).toMatchObject({ ok: false, code: 'E_PROVIDER', tentativas: 0 })
      const route = await run(['--kind', 'pptx', '--anexo', VENDAS, 'x'], cwd)
      expect(route.exitCode).toBe(1)
      expect(JSON.parse(route.output)).toMatchObject({ ok: false, code: 'E_ROTA' })
      expect(existsSync(join(cwd, 'artifacts'))).toBe(false)
    })
  })

  it('conta as tentativas quando o modelo erra e corrige', async () => {
    await inTempDir(async (cwd) => {
      const replies = [{ ...chart, x: { campo: 'produto_errado', titulo: 'P' } }, chart]
      let call = 0
      const flaky: LLMProvider = { caps: { constrainedJson: true, ctx: 8192, remote: false }, async generate<T extends TSchema>(): Promise<GenerationResult<T>> { return { value: replies[call++] as unknown as T, usage: { provider: 'fake', model: 'fixture', durationMs: 0 } } } }
      const result = await gerarCommand(['--anexo', VENDAS, 'gráfico'], { cwd, createOrchestrator: (store) => new Orchestrator(store, flaky, defaultChartRender) })
      expect(result.exitCode).toBe(0)
      const output = JSON.parse(result.output)
      expect(output.tentativas).toBe(2)
      expect(output.estados).toContain('SPEC_INVALIDA')
    })
  })
})
