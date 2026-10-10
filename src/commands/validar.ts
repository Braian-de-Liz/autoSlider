import { readFileSync } from 'node:fs'
import { validateChartSemantics, validateChartSpec } from '../agent/validate.ts'
import { validateDocx } from '../agent/validate-docx.ts'
import { DatasetCatalog, SAMPLE_DATASETS } from '../data/catalog.ts'
import { LLMError } from '../llm/contracts.ts'
import type { CommandResult } from './result.ts'

export type ValidarResult = CommandResult

/** Formatos que o comando `validar` conhece. Um JSON sem `kind` é tratado como ChartSpec. */
export const VALIDAR_KINDS = ['chart', 'docx'] as const

function failure(error: LLMError): ValidarResult {
  const { subcode, path } = (error.details ?? {}) as { subcode?: string; path?: string }
  return {
    exitCode: 1,
    output: JSON.stringify({ ok: false, code: error.code, ...(subcode ? { subcode } : {}), ...(path ? { path } : {}), message: error.message })
  }
}

export function validarText(text: string, catalog: DatasetCatalog = new DatasetCatalog(SAMPLE_DATASETS)): ValidarResult {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return failure(new LLMError('E_SPEC_PARSE', 'O arquivo não contém JSON válido.'))
  }
  const kind = value && typeof value === 'object' && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined
  try {
    if (kind === undefined || kind === 'chart') {
      validateChartSemantics(validateChartSpec(value), catalog)
      return { exitCode: 0, output: JSON.stringify({ ok: true, kind: 'chart' }) }
    }
    if (kind === 'docx') {
      validateDocx(value, catalog)
      return { exitCode: 0, output: JSON.stringify({ ok: true, kind: 'docx' }) }
    }
    return failure(new LLMError('E_ROTA', `O formato "${String(kind)}" ainda não é suportado. Disponível: ${VALIDAR_KINDS.join(', ')}.`))
  } catch (error: unknown) {
    if (error instanceof LLMError) return failure(error)
    throw error
  }
}

export function validarCommand(path: string, catalog?: DatasetCatalog): ValidarResult {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error: unknown) {
    return { exitCode: 2, output: JSON.stringify({ ok: false, message: `Não foi possível ler "${path}": ${error instanceof Error ? error.message : String(error)}` }) }
  }
  return validarText(text, catalog)
}
