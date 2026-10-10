import { describe, expect, it } from 'bun:test'
import { buildTrace, parseSpec, parseTests, renderTrace } from '../scripts/trace.ts'

const SPEC = `
| ID | Requisito |
| --- | --- |
| RF-01 | Criar projeto |
| RF-02 | Classificar pedido |
| RNF-01 | Spec válida | ≥ 85% |

| ID | Status | Marco |
|---|---|---|
| RF-01 | ativo | M2 |
| RF-02 | planejado | M4 |
| RNF-01 | adiado | — |
`

const file = (path: string, text: string) => ({ path, text })

describe('RNF-11: matriz de rastreabilidade', () => {
  it('lê requisitos, descrição e status da spec', () => {
    const { requirements, errors } = parseSpec(SPEC)
    expect(errors).toEqual([])
    expect(requirements.map((requirement) => [requirement.id, requirement.status, requirement.milestone])).toEqual([
      ['RF-01', 'ativo', 'M2'], ['RF-02', 'planejado', 'M4'], ['RNF-01', 'adiado', '—']
    ])
    expect(requirements[0].description).toBe('Criar projeto')
  })

  it('caso feliz: requisito ativo com teste, planejado sem teste, sem lacunas', () => {
    const { requirements } = parseSpec(SPEC)
    const { blocks, errors } = parseTests([file('tests/a.test.ts', `import { x } from '../src/agent/x.ts'\ndescribe('RF-01: cria', () => {\n  it('ok', () => {})\n})\nconst s = "from '../src/fake.ts'"`)])
    const trace = buildTrace(requirements, blocks)
    expect([...errors, ...trace.errors]).toEqual([])
    expect(trace.rows[0].tests[0].modules).toEqual(['src/agent/x.ts'])
    expect(renderTrace(trace)).toContain('Sem lacunas.')
  })

  it('falha com requisito ativo sem teste', () => {
    const { requirements } = parseSpec(SPEC)
    expect(buildTrace(requirements, []).errors).toEqual(['RF-01 está ativo e não tem teste.'])
  })

  it('falha com describe sem ID (teste sem requisito)', () => {
    const { errors } = parseTests([file('tests/b.test.ts', `describe('sem id', () => { it('RF-01 no it não basta', () => {}) })`)])
    expect(errors).toEqual(['tests/b.test.ts: describe "sem id" sem ID de requisito.'])
  })

  it('falha com ID inexistente na spec e com requisito sem status', () => {
    const { requirements, errors } = parseSpec(`${SPEC}\n| RF-09 | Sem status |`)
    expect(errors).toEqual(['RF-09 não tem status na tabela "Status dos requisitos".'])
    const { blocks } = parseTests([file('tests/c.test.ts', "describe(`RF-77: x ${1}`, () => {})")])
    expect(buildTrace(requirements, blocks).errors).toContain('tests/c.test.ts: "RF-77: x ${1}" cita RF-77, que não existe na spec.')
  })

  it('it herda o ID do describe e pode acrescentar outro; describe.skipIf é reconhecido', () => {
    const { blocks } = parseTests([file('tests/d.test.ts', `describe.skipIf(!on)('RF-01: a', () => {\n  it('RF-02: b', () => {})\n})\n  const s = "it('RNF-01: dentro de string')"`)])
    expect(blocks[0].ids).toEqual(['RF-01', 'RF-02'])
  })
})
