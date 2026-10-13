import { Type } from '@sinclair/typebox'

export const ChartSpec = Type.Object({
  id: Type.String({ minLength: 1 }),
  tipo: Type.Union([Type.Literal('bar'), Type.Literal('line'), Type.Literal('scatter'), Type.Literal('area')]),
  datasetId: Type.String({ minLength: 1 }),
  x: Type.Object({ campo: Type.String(), titulo: Type.String() }),
  y: Type.Object({
    campo: Type.String(),
    titulo: Type.String(),
    agregacao: Type.Optional(Type.Union([Type.Literal('sum'), Type.Literal('mean'), Type.Literal('count')]))
  }),
  serie: Type.Optional(Type.String()),
  titulo: Type.String({ minLength: 1 })
})

export const Slide = Type.Union([
  Type.Object({ layout: Type.Literal('titulo'), titulo: Type.String(), subtitulo: Type.Optional(Type.String()) }),
  Type.Object({
    layout: Type.Literal('bullets'),
    titulo: Type.String(),
    itens: Type.Array(Type.String({ maxLength: 120 }), { minItems: 1, maxItems: 6 })
  }),
  Type.Object({
    layout: Type.Literal('duas_colunas'),
    titulo: Type.String(),
    esquerda: Type.Array(Type.String()),
    direita: Type.Array(Type.String())
  }),
  Type.Object({ layout: Type.Literal('grafico'), titulo: Type.String(), chartId: Type.String() }),
  Type.Object({ layout: Type.Literal('tabela'), titulo: Type.String(), datasetId: Type.String() })
])

/** Campos comuns a todo documento persistido (seção 6.1). */
export const Base = {
  specVersion: Type.Literal('1.0'),
  title: Type.String({ minLength: 1, maxLength: 120 }),
  lang: Type.Literal('pt-BR')
}

/**
 * Bloco de texto longo (seção 6.8). Nasce `pendente`, sem texto, e a etapa LONG_TEXT o preenche.
 * A coerência entre `status` e `texto` é checada em validateDocxSpec.
 */
export const TextoLongo = Type.Object({
  tipo: Type.Literal('texto_longo'),
  papel: Type.Union([Type.Literal('resumo'), Type.Literal('conclusao')]),
  status: Type.Union([Type.Literal('pendente'), Type.Literal('gerado')]),
  texto: Type.Optional(Type.String()),
  fontes: Type.Array(Type.Object({
    datasetId: Type.Optional(Type.String()),
    calcId: Type.Optional(Type.String())
  }))
})

export const Bloco = Type.Union([
  Type.Object({ tipo: Type.Literal('heading'), nivel: Type.Integer({ minimum: 1, maximum: 3 }), texto: Type.String() }),
  Type.Object({ tipo: Type.Literal('paragrafo'), texto: Type.String() }),
  Type.Object({ tipo: Type.Literal('lista'), ordenada: Type.Boolean(), itens: Type.Array(Type.String(), { minItems: 1 }) }),
  Type.Object({ tipo: Type.Literal('tabela'), datasetId: Type.String(), legenda: Type.String() }),
  Type.Object({ tipo: Type.Literal('figura'), chartId: Type.String(), legenda: Type.String() }),
  Type.Object({ tipo: Type.Literal('quebra_pagina') }),
  TextoLongo
])

export const DocxSpec = Type.Object({
  ...Base,
  kind: Type.Literal('docx'),
  preset: Type.Union([Type.Literal('abnt'), Type.Literal('livre')]),
  charts: Type.Array(ChartSpec),
  blocos: Type.Array(Bloco, { minItems: 1 })
})

export const PptxSpec = Type.Object({
  ...Base,
  kind: Type.Literal('pptx'),
  charts: Type.Array(ChartSpec),
  slides: Type.Array(Slide, { minItems: 1, maxItems: 30 }),
  /** Notas do apresentador: chave = posição do slide (a partir de "1"), valor = texto. */
  notas: Type.Optional(Type.Record(Type.String(), Type.String()))
})

export const chartProbeExample = {
  id: 'chart-probe',
  tipo: 'bar' as const,
  datasetId: 'dataset-probe',
  x: { campo: 'categoria', titulo: 'Categoria' },
  y: { campo: 'valor', titulo: 'Valor', agregacao: 'sum' as const },
  titulo: 'Exemplo de gráfico'
}
