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

export const chartProbeExample = {
  id: 'chart-probe',
  tipo: 'bar' as const,
  datasetId: 'dataset-probe',
  x: { campo: 'categoria', titulo: 'Categoria' },
  y: { campo: 'valor', titulo: 'Valor', agregacao: 'sum' as const },
  titulo: 'Exemplo de gráfico'
}
