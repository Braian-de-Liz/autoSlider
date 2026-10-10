import { readFileSync } from 'node:fs'
import { ingestFile } from '../ingest/index.ts'
import { LLMError } from '../llm/contracts.ts'
import { MAX_SAMPLE_ROWS } from '../data/catalog.ts'
import type { CommandResult } from './result.ts'

export function ingerirCommand(path: string): CommandResult {
  let bytes: Uint8Array
  try {
    bytes = readFileSync(path)
  } catch (error: unknown) {
    return { exitCode: 2, output: JSON.stringify({ ok: false, message: `Não foi possível ler "${path}": ${error instanceof Error ? error.message : String(error)}` }) }
  }
  try {
    const { doc, datasets } = ingestFile({ name: path, bytes, path })
    return {
      exitCode: 0,
      output: JSON.stringify({
        ok: true,
        fonte: { id: doc.id, nome: doc.name, formato: doc.format },
        unidades: doc.units.length,
        datasets: datasets.map((dataset) => ({
          id: dataset.id,
          nome: dataset.name,
          origem: dataset.origin ? { caminho: dataset.origin.path, sha256: dataset.origin.sha256 } : undefined,
          colunas: dataset.columns,
          linhas: dataset.rows.length,
          amostra: dataset.rows.slice(0, MAX_SAMPLE_ROWS)
        }))
      }, null, 2)
    }
  } catch (error: unknown) {
    if (error instanceof LLMError) return { exitCode: 1, output: JSON.stringify({ ok: false, code: error.code, message: error.message }) }
    throw error
  }
}
