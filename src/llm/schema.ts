import type { TSchema } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

export type AdapterSchema = 'ollama' | 'openai-strict'

/** Keywords recusadas pelo modo strict da OpenAI. O Validator continua aplicando esses limites. */
const STRICT_UNSUPPORTED = new Set(['minLength', 'maxLength'])

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function nullable(schema: unknown): unknown {
  const object = schema as Record<string, unknown>
  return Array.isArray(object.anyOf)
    ? { ...object, anyOf: [...object.anyOf, { type: 'null' }] }
    : { anyOf: [schema, { type: 'null' }] }
}

/**
 * Modo strict: todo objeto com additionalProperties false e todos os campos em required.
 * Campo opcional passa a ser anulável, para o modelo não ser obrigado a inventar valor.
 */
function applyOpenAIStrict(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(applyOpenAIStrict)
  if (!value || typeof value !== 'object') return value

  const object = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(object)) {
    if (STRICT_UNSUPPORTED.has(key)) continue
    // Em `properties` as chaves são nomes de campo, não keywords: transforma cada valor, sem filtrar a chave.
    result[key] = key === 'properties' && child && typeof child === 'object' && !Array.isArray(child)
      ? Object.fromEntries(Object.entries(child as Record<string, unknown>).map(([name, schema]) => [name, applyOpenAIStrict(schema)]))
      : applyOpenAIStrict(child)
  }

  if (object.type === 'object' && object.properties && typeof object.properties === 'object') {
    const originallyRequired = new Set(Array.isArray(object.required) ? object.required as string[] : [])
    const properties = result.properties as Record<string, unknown>
    for (const key of Object.keys(properties)) {
      if (!originallyRequired.has(key)) properties[key] = nullable(properties[key])
    }
    result.additionalProperties = false
    result.required = Object.keys(properties)
  }
  return result
}

export function toProviderSchema(schema: TSchema, adapter: AdapterSchema): Record<string, unknown> {
  const normalized = clone(schema) as Record<string, unknown>
  return adapter === 'openai-strict'
    ? applyOpenAIStrict(normalized) as Record<string, unknown>
    : normalized
}

/**
 * Desfaz o efeito do strict: campo opcional devolvido como null volta a ser ausente,
 * para a validação contra o schema original (TypeBox) aceitá-lo.
 */
export function stripNullOptionals(schema: TSchema, value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return schema.items ? value.map((item) => stripNullOptionals(schema.items as TSchema, item)) : value
  }
  if (Array.isArray(schema.anyOf)) {
    for (const branch of schema.anyOf as TSchema[]) {
      const candidate = stripNullOptionals(branch, value)
      if (Value.Check(branch, candidate)) return candidate
    }
    return value
  }
  if (schema.type === 'object' && schema.properties) {
    const required = new Set<string>(Array.isArray(schema.required) ? schema.required : [])
    const properties = schema.properties as Record<string, TSchema>
    const result: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (child === null && !required.has(key)) continue
      result[key] = properties[key] ? stripNullOptionals(properties[key], child) : child
    }
    return result
  }
  return value
}
