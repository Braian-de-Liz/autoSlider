import type { SourceDoc } from '../llm/contracts.ts'
import type { TabularDataset } from '../data/catalog.ts'

/** Convenção numérica de um arquivo: `pt-BR` usa vírgula decimal e ponto de milhar; `en` o inverso. */
export type NumberLocale = 'pt-BR' | 'en'

/** Arquivo já lido pelo chamador. O Ingestor não toca o disco: o caminho é só o rótulo de origem. */
export interface IngestInput {
  name: string
  bytes: Uint8Array
  /** Caminho informado pelo usuário, gravado como origem do dataset (seção 6.5). */
  path?: string
}

export interface IngestOptions {
  /** Ids de dataset já usados; o Ingestor acrescenta os que alocar. */
  takenIds?: Set<string>
}

export interface CsvOptions extends IngestOptions {
  delimiter?: string
  locale?: NumberLocale
}

export interface IngestedSource {
  /** Documento rastreável. `doc.datasets` guarda só esquema e amostra. */
  doc: SourceDoc
  /** Datasets com as linhas completas, que ficam na máquina (RF-11). */
  datasets: TabularDataset[]
}
