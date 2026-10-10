import { inflateRawSync } from 'node:zlib'
import { LLMError } from '../llm/contracts.ts'

/** Limites iniciais da seção 6.9 (hipóteses calibráveis, questão aberta 7). */
export const ZIP_MAX_ENTRIES = 2000
export const ZIP_MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024

export interface ZipLimits {
  maxEntries?: number
  maxUncompressedBytes?: number
}

function invalid(message: string): LLMError {
  return new LLMError('E_INGEST_INVALIDO', message)
}

/**
 * Leitor mínimo de ZIP (diretório central + `inflateRawSync`; métodos 0 e 8). Os tamanhos vêm do
 * diretório central, então entradas com data descriptor (bit 3), como as do JSZip, funcionam.
 * ZIP64 e criptografia não são suportados. Respeita limites de entradas e de tamanho descompactado
 * (`E_INGEST_LIMITE`), verificados antes de descomprimir, e limita a saída de cada entrada.
 */
export function readZip(data: Uint8Array, limits: ZipLimits = {}): Map<string, Uint8Array> {
  const maxEntries = limits.maxEntries ?? ZIP_MAX_ENTRIES
  const maxBytes = limits.maxUncompressedBytes ?? ZIP_MAX_UNCOMPRESSED_BYTES
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  let eocd = -1
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw invalid('Não é um ZIP: fim do diretório central não encontrado.')
  const total = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  if (total === 0xffff || offset === 0xffffffff) throw invalid('ZIP64 não é suportado.')
  if (total > maxEntries) throw new LLMError('E_INGEST_LIMITE', `O ZIP tem ${total} entradas; o limite é ${maxEntries}.`, { details: { entries: total, maxEntries } })

  const entries: { name: string; method: number; compressedSize: number; size: number; localOffset: number }[] = []
  let declared = 0
  for (let n = 0; n < total; n++) {
    if (offset + 46 > data.length || view.getUint32(offset, true) !== 0x02014b50) throw invalid('Entrada do diretório central inválida.')
    const nameLength = view.getUint16(offset + 28, true)
    const name = new TextDecoder().decode(data.subarray(offset + 46, offset + 46 + nameLength))
    if (view.getUint16(offset + 8, true) & 1) throw invalid(`Entrada criptografada: ${name}.`)
    const size = view.getUint32(offset + 24, true)
    declared += size
    if (declared > maxBytes) throw new LLMError('E_INGEST_LIMITE', `O ZIP descompactado passa de ${Math.round(maxBytes / (1024 * 1024))} MB.`, { details: { maxBytes } })
    entries.push({ name, method: view.getUint16(offset + 10, true), compressedSize: view.getUint32(offset + 20, true), size, localOffset: view.getUint32(offset + 42, true) })
    offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }

  const files = new Map<string, Uint8Array>()
  for (const entry of entries) {
    if (entry.localOffset + 30 > data.length || view.getUint32(entry.localOffset, true) !== 0x04034b50) throw invalid(`Cabeçalho local inválido: ${entry.name}.`)
    const start = entry.localOffset + 30 + view.getUint16(entry.localOffset + 26, true) + view.getUint16(entry.localOffset + 28, true)
    const raw = data.subarray(start, start + entry.compressedSize)
    if (entry.method === 0) files.set(entry.name, new Uint8Array(raw))
    else if (entry.method === 8) {
      // maxOutputLength protege de um tamanho declarado menor que o real (zip bomb).
      files.set(entry.name, new Uint8Array(inflateRawSync(raw, { maxOutputLength: Math.max(entry.size, 1) })))
    } else throw invalid(`Método de compressão ${entry.method} não suportado: ${entry.name}.`)
  }
  return files
}

export const decodeText = (entry: Uint8Array | undefined): string => new TextDecoder().decode(entry ?? new Uint8Array())
