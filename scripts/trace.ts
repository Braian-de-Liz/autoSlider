/**
 * Matriz de rastreabilidade (SPEC seção 3.3, RNF-11).
 *
 * Lê os requisitos (tabelas da seção 4) e o status de cada um (tabela "Status dos requisitos")
 * de specs/SPEC.md, e os IDs presentes nos títulos de describe/it em tests/. Gera specs/TRACE.md.
 *
 * Falha (exit 1) quando:
 * - um bloco describe não carrega ID de requisito (teste sem requisito);
 * - um teste cita ID que não existe na spec;
 * - um requisito `ativo` não tem teste;
 * - um requisito não tem status, ou o status cita ID inexistente.
 * Requisitos `planejado` e `adiado` sem teste são esperados e só aparecem na matriz.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export const STATUSES = ['ativo', 'planejado', 'adiado'] as const
export type Status = typeof STATUSES[number]

export interface Requirement { id: string; description: string; status?: Status; milestone?: string }
export interface TestBlock { file: string; title: string; ids: string[]; modules: string[] }
export interface TraceRow { requirement: Requirement; tests: TestBlock[] }
export interface TraceResult { rows: TraceRow[]; errors: string[] }

const ID = /\bRN?F-\d{2}\b/g
const ROW = /^\|\s*(RN?F-\d{2})\s*\|(.*)\|\s*$/
const cells = (rest: string) => rest.split('|').map((cell) => cell.trim())

export function parseSpec(text: string): { requirements: Requirement[]; errors: string[] } {
  const byId = new Map<string, Requirement>()
  const statusRows: { id: string; status: string; milestone: string }[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = ROW.exec(line)
    if (!match) continue
    const [id, rest] = [match[1], cells(match[2])]
    if ((STATUSES as readonly string[]).includes(rest[0])) statusRows.push({ id, status: rest[0], milestone: rest[1] ?? '' })
    else if (!byId.has(id)) byId.set(id, { id, description: rest[0] })
  }
  const errors: string[] = []
  for (const row of statusRows) {
    const requirement = byId.get(row.id)
    if (!requirement) { errors.push(`Status para ${row.id}, que não está nas tabelas de requisitos.`); continue }
    requirement.status = row.status as Status
    requirement.milestone = row.milestone
  }
  for (const requirement of byId.values()) {
    if (!requirement.status) errors.push(`${requirement.id} não tem status na tabela "Status dos requisitos".`)
  }
  return { requirements: [...byId.values()], errors }
}

// Só chamadas no início da linha: describe de nível superior e it/test indentados.
// Assim, fixtures em strings (como em tests/trace.test.ts) não contam como testes.
const DESCRIBE = /^describe(?:\.\w+\([^)]*\))?\(\s*(['"`])(.*?)\1/gm
const IT = /^\s+(?:it|test)(?:\.\w+)?\(\s*(['"`])(.*?)\1/gm
const SRC_IMPORT = /^import\b[^'"]*?from\s+['"](?:\.\.\/)+((?:src|scripts)\/[^'"]+)['"]/gm

/** Cada describe é um bloco; seus `it` herdam os IDs do bloco e podem acrescentar outros. */
export function parseTests(files: { path: string; text: string }[]): { blocks: TestBlock[]; errors: string[] } {
  const blocks: TestBlock[] = []
  const errors: string[] = []
  for (const { path, text } of files) {
    const modules = [...new Set([...text.matchAll(SRC_IMPORT)].map((match) => match[1]))]
    const describes = [...text.matchAll(DESCRIBE)].map((match) => ({ index: match.index!, title: match[2] }))
    if (describes.length === 0 && IT.test(text)) errors.push(`${path}: testes fora de describe; agrupe-os em um describe com ID.`)
    IT.lastIndex = 0
    describes.forEach((block, position) => {
      const end = describes[position + 1]?.index ?? text.length
      const body = text.slice(block.index, end)
      const itIds = [...body.matchAll(IT)].flatMap((match) => match[2].match(ID) ?? [])
      const ids = [...new Set([...(block.title.match(ID) ?? []), ...itIds])]
      if ((block.title.match(ID) ?? []).length === 0) errors.push(`${path}: describe "${block.title}" sem ID de requisito.`)
      blocks.push({ file: path, title: block.title, ids, modules })
    })
  }
  return { blocks, errors }
}

export function buildTrace(requirements: Requirement[], blocks: TestBlock[]): TraceResult {
  const known = new Set(requirements.map((requirement) => requirement.id))
  const errors: string[] = []
  for (const block of blocks) {
    for (const id of block.ids) if (!known.has(id)) errors.push(`${block.file}: "${block.title}" cita ${id}, que não existe na spec.`)
  }
  const rows = requirements.map((requirement) => ({ requirement, tests: blocks.filter((block) => block.ids.includes(requirement.id)) }))
  for (const row of rows) {
    if (row.requirement.status === 'ativo' && row.tests.length === 0) errors.push(`${row.requirement.id} está ativo e não tem teste.`)
  }
  return { rows, errors }
}

export function renderTrace({ rows, errors }: TraceResult): string {
  const escape = (text: string) => text.replaceAll('|', '\\|')
  const lines = [
    '# Matriz de rastreabilidade',
    '',
    'Gerado por `bun run trace` a partir de `specs/SPEC.md` e `tests/`. Não edite à mão.',
    '',
    '| Requisito | Status | Marco | Testes | Módulos |',
    '|---|---|---|---|---|',
    ...rows.map(({ requirement, tests }) => {
      const testCell = tests.map((test) => `${test.file} › ${escape(test.title)}`).join('<br>') || '—'
      const modules = [...new Set(tests.flatMap((test) => test.modules))].sort().join('<br>') || '—'
      return `| ${requirement.id} | ${requirement.status ?? '?'} | ${requirement.milestone || '—'} | ${testCell} | ${modules} |`
    }),
    '',
    errors.length ? `## Lacunas (${errors.length})\n\n${errors.map((error) => `- ${error}`).join('\n')}` : 'Sem lacunas.',
    ''
  ]
  return lines.join('\n')
}

function testFiles(dir: string, root: string): { path: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return testFiles(full, root)
    return entry.name.endsWith('.test.ts') ? [{ path: relative(root, full).replaceAll('\\', '/'), text: readFileSync(full, 'utf8') }] : []
  })
}

export function runTrace(root: string): TraceResult {
  const spec = parseSpec(readFileSync(join(root, 'specs', 'SPEC.md'), 'utf8'))
  const tests = parseTests(testFiles(join(root, 'tests'), root))
  const trace = buildTrace(spec.requirements, tests.blocks)
  return { rows: trace.rows, errors: [...spec.errors, ...tests.errors, ...trace.errors] }
}

if (import.meta.main) {
  const root = join(import.meta.dirname ?? '.', '..')
  const result = runTrace(root)
  writeFileSync(join(root, 'specs', 'TRACE.md'), renderTrace(result))
  const active = result.rows.filter((row) => row.requirement.status === 'ativo').length
  console.log(`TRACE: ${result.rows.length} requisitos (${active} ativos), ${result.errors.length} lacunas → specs/TRACE.md`)
  for (const error of result.errors) console.error(`  ✗ ${error}`)
  if (result.errors.length) process.exitCode = 1
}
