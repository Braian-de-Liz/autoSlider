import { readFileSync } from 'node:fs'
import { ingestAll } from '../ingest/index.ts'
import { describeExcerptsForPrompt, excerptOf, searchUnits } from '../ingest/search.ts'
import { LLMError } from '../llm/contracts.ts'
import { usageError, type CommandResult } from './result.ts'

/**
 * `buscar "<consulta>" <arquivo...>`: ingere os arquivos, busca por BM25 e mostra os trechos e o
 * bloco exato que iria ao prompt. Sem Store ainda, cada chamada reingere os arquivos.
 */
export function buscarCommand(query: string | undefined, paths: string[]): CommandResult {
  if (!query?.trim() || paths.length === 0) return usageError('Uso: bun run src/cli.ts buscar "<consulta>" <arquivo...>')
  const inputs = []
  for (const path of paths) {
    try {
      inputs.push({ name: path, bytes: new Uint8Array(readFileSync(path)), path })
    } catch (error: unknown) {
      return usageError(`Não foi possível ler "${path}": ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  try {
    const hits = searchUnits(ingestAll(inputs).map((source) => source.doc), query)
    return {
      exitCode: 0,
      output: JSON.stringify({
        ok: true,
        consulta: query,
        resultados: hits.map((hit) => ({
          fonte: hit.docName,
          secao: hit.unit.title ?? null,
          indice: hit.unit.index,
          score: Number(hit.score.toFixed(4)),
          trecho: excerptOf(hit.unit.text, 1500)
        })),
        prompt: describeExcerptsForPrompt(hits)
      }, null, 2)
    }
  } catch (error: unknown) {
    if (error instanceof LLMError) return { exitCode: 1, output: JSON.stringify({ ok: false, code: error.code, message: error.message }) }
    throw error
  }
}
