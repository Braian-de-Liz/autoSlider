import { LLMError } from '../llm/contracts.ts'
import { baseName, extensionOf } from './common.ts'
import { ingestCsv } from './csv.ts'
import { ingestMarkdown } from './markdown.ts'
import type { IngestInput, IngestOptions, IngestedSource } from './types.ts'

type Ingestor = (input: IngestInput, options?: IngestOptions) => IngestedSource

/** Formatos com ingestor. XLSX, PDF, DOCX e PPTX entram nas tasks seguintes. */
const INGESTORS = new Map<string, Ingestor>([
  ['csv', ingestCsv],
  ['md', ingestMarkdown],
  ['markdown', ingestMarkdown]
])

export function supportedExtensions(): string[] {
  return [...INGESTORS.keys()]
}

export function ingestFile(input: IngestInput, options: IngestOptions = {}): IngestedSource {
  const extension = extensionOf(input.name)
  const ingestor = INGESTORS.get(extension)
  if (!ingestor) {
    const found = extension ? `".${extension}"` : 'sem extensão'
    throw new LLMError('E_INGEST_INVALIDO', `Formato ${found} não suportado em "${baseName(input.name)}". Suportados: ${supportedExtensions().map((item) => `.${item}`).join(', ')}.`)
  }
  return ingestor(input, options)
}

/** Ingere vários arquivos compartilhando os ids, para dois `vendas.csv` virarem `vendas` e `vendas-2`. */
export function ingestAll(inputs: IngestInput[]): IngestedSource[] {
  const taken = new Set<string>()
  return inputs.map((input) => ingestFile(input, { takenIds: taken }))
}
