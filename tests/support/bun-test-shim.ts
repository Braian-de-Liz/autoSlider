/**
 * Shim de `bun:test` para o Deno (ADR-013: suíte roda nos dois runtimes).
 * O deno.json mapeia `bun:test` para este arquivo; no Bun, o módulo nativo é usado.
 * Cobre só a superfície usada pela suíte: describe, it/test, expect e describe.skipIf.
 */
import { describe as stdDescribe, it as stdIt } from '@std/testing/bdd'
import { expect } from '@std/expect'

type Body = () => void | Promise<void>

function it(name: string, fn: Body): void {
  // Igual ao Bun: o teste não falha por recursos (timers/streams) abertos por bibliotecas de terceiros.
  stdIt({ name, fn, sanitizeOps: false, sanitizeResources: false })
}

function describe(name: string, fn: () => void): void {
  stdDescribe(name, fn)
}

describe.skipIf = (condition: boolean) => (name: string, fn: () => void): void => {
  if (condition) stdDescribe.ignore(name, fn)
  else stdDescribe(name, fn)
}

it.skip = (name: string, fn: Body): void => { stdIt.ignore({ name, fn }) }

export { describe, it, it as test, expect }
