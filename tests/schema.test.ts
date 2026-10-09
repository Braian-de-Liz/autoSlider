import { describe, expect, it } from 'bun:test'
import { Type } from '@sinclair/typebox'
import { ChartSpec, Slide } from '../src/specs/schemas.ts'
import { stripNullOptionals, toProviderSchema } from '../src/llm/schema.ts'

describe('Seção 7, regra 3: schema strict da OpenAI', () => {
  const strict = toProviderSchema(ChartSpec, 'openai-strict') as any

  it('exige todos os campos e proíbe propriedades extras', () => {
    expect(strict.additionalProperties).toBe(false)
    expect(strict.required).toEqual(Object.keys(strict.properties))
    expect(strict.properties.y.required).toContain('agregacao')
  })

  it('torna anulável só o que era opcional', () => {
    expect(strict.properties.serie.anyOf).toContainEqual({ type: 'null' })
    expect(strict.properties.y.properties.agregacao.anyOf).toContainEqual({ type: 'null' })
    expect(strict.properties.titulo.anyOf).toBeUndefined()
  })

  it('remove minLength e maxLength, sem apagar campos com esses nomes', () => {
    expect(strict.properties.titulo.minLength).toBeUndefined()
    const tricky = toProviderSchema(Type.Object({ minLength: Type.String({ minLength: 1 }) }), 'openai-strict') as any
    expect(tricky.properties.minLength).toEqual({ type: 'string' })
  })

  it('Ollama recebe o schema original', () => {
    expect((toProviderSchema(ChartSpec, 'ollama') as any).properties.titulo.minLength).toBe(1)
  })
})

describe('stripNullOptionals', () => {
  it('remove null de campos opcionais, inclusive aninhados', () => {
    const value = { id: 'c', tipo: 'bar', datasetId: 'd', x: { campo: 'a', titulo: 'A' }, y: { campo: 'b', titulo: 'B', agregacao: null }, serie: null, titulo: 'T' }
    expect(stripNullOptionals(ChartSpec, value)).toEqual({ id: 'c', tipo: 'bar', datasetId: 'd', x: { campo: 'a', titulo: 'A' }, y: { campo: 'b', titulo: 'B' }, titulo: 'T' })
  })

  it('mantém null em campo obrigatório para o Validator rejeitar', () => {
    expect((stripNullOptionals(ChartSpec, { titulo: null }) as any).titulo).toBeNull()
  })

  it('escolhe o ramo certo de uma union discriminada', () => {
    expect(stripNullOptionals(Slide, { layout: 'titulo', titulo: 'Capa', subtitulo: null })).toEqual({ layout: 'titulo', titulo: 'Capa' })
  })
})
