import { createHash } from 'node:crypto'
import { LLMError, type Dataset } from '../llm/contracts.ts'
import type { TabularDataset } from '../data/catalog.ts'

/** Limite inicial por arquivo (seção 6.9). É uma hipótese calibrável (questão aberta 7). */
export const MAX_INGEST_BYTES = 25 * 1024 * 1024

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Nome do arquivo sem diretório. */
export function baseName(name: string): string {
  return name.split(/[\\/]/).pop() ?? name
}

/** Nome sem diretório e sem a última extensão. */
export function stem(name: string): string {
  const file = baseName(name)
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(0, dot) : file
}

export function extensionOf(name: string): string {
  const file = baseName(name)
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(dot + 1).toLowerCase() : ''
}

/** Slug de texto livre (ex.: título): minúsculas, sem acento, só `a-z0-9` e hífen, até 40 caracteres. */
export function slugText(text: string): string {
  const slug = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '')
  return slug || 'dados'
}

/** Identificador estável e legível de um arquivo: nome-base sem diretório nem extensão, em slug. */
export function slugify(name: string): string {
  return slugText(stem(name))
}

/** Devolve `base`, `base-2`, `base-3`... e registra o escolhido em `taken`. */
export function allocateId(base: string, taken: Set<string>): string {
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  taken.add(id)
  return id
}

export function assertSize(bytes: Uint8Array, name: string): void {
  if (bytes.length > MAX_INGEST_BYTES) {
    const size = (bytes.length / (1024 * 1024)).toFixed(1)
    throw new LLMError('E_INGEST_LIMITE', `O arquivo "${baseName(name)}" tem ${size} MB e excede o limite de ${MAX_INGEST_BYTES / (1024 * 1024)} MB.`, { details: { limitBytes: MAX_INGEST_BYTES, sizeBytes: bytes.length } })
  }
}

/** UTF-8 estrito, sem BOM. Sem fallback silencioso para outras codificações (P6). */
export function decodeUtf8(bytes: Uint8Array, name: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
  } catch {
    throw new LLMError('E_INGEST_INVALIDO', `O arquivo "${baseName(name)}" não está em UTF-8. Salve-o como UTF-8 e tente de novo.`)
  }
}

/** Versão do dataset que vai ao `SourceDoc`: esquema e amostra, sem as linhas. */
export function toSourceDataset(dataset: TabularDataset): Dataset {
  return { id: dataset.id, name: dataset.name, columns: dataset.columns, sample: dataset.sample }
}
