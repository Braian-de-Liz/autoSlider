/**
 * Gera as fixtures sintéticas de ingestão em specs/fixtures/ingest/.
 * Determinístico (LCG, sem Math.random e sem data atual): rodar de novo reproduz os mesmos bytes.
 * Uso: bun run fixtures
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(import.meta.dirname ?? '.', '..', 'specs', 'fixtures', 'ingest')

function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Dia `offset` a partir de 2024-01-01, como [ano, mês, dia]. */
function day(offset: number): [number, number, number] {
  const date = new Date(Date.UTC(2024, 0, 1 + offset))
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
}

const iso = ([year, month, date]: [number, number, number]) => `${year}-${pad(month)}-${pad(date)}`
const br = ([year, month, date]: [number, number, number]) => `${pad(date)}/${pad(month)}/${year}`

/** Centavos como `1234.50` (ponto decimal, sem separador de milhar). */
const plain = (cents: number) => `${Math.floor(cents / 100)}.${pad(cents % 100)}`

/** Centavos como `1.234,50` (vírgula decimal, ponto de milhar). */
const brazilian = (cents: number) => `${Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${pad(cents % 100)}`

const PRICE_RANGE: Record<string, [number, number]> = {
  Notebook: [3000, 5000], Monitor: [800, 1500], Teclado: [100, 300], Mouse: [50, 150], Cadeira: [600, 1200]
}

function vendasCsv(): string {
  const random = lcg(2024)
  const products = Object.keys(PRICE_RANGE)
  const regions = ['Sul', 'Norte', 'Sudeste']
  const lines = ['data,produto,regiao,valor']
  for (let i = 0; i < 100; i++) {
    const product = products[i % products.length]
    const [low, high] = PRICE_RANGE[product]
    const cents = Math.round((low + random() * (high - low)) * 100)
    lines.push(`${iso(day(i))},${product},${regions[Math.floor(random() * regions.length)]},${plain(cents)}`)
  }
  return `${lines.join('\n')}\n`
}

/** `;`, BOM, CRLF, `dd/mm/yyyy`, números pt-BR, acentos, `;` e aspas escapadas dentro de aspas. */
function vendasBrCsv(): string {
  const random = lcg(1989)
  const products = ['Notebook', 'Monitor', 'Teclado mecânico', 'Câmera', 'Cadeira']
  const regions = ['Sul', 'Nordeste', 'São Paulo']
  const ranges = [[3000, 5000], [800, 1500], [200, 400], [900, 2500], [600, 1200]]
  const lines = ['data;produto;regiao;valor']
  for (let i = 0; i < 30; i++) {
    let product = products[i % products.length]
    const [low, high] = ranges[i % ranges.length]
    const cents = Math.round((low + random() * (high - low)) * 100)
    if (i === 4) product = '"Cabo USB; 2m"'
    if (i === 11) product = '"Monitor ""Gamer"""'
    lines.push(`${br(day(i * 3))};${product};${regions[Math.floor(random() * regions.length)]};${brazilian(cents)}`)
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

function notasMd(): string {
  return [
    'Notas de planejamento do trimestre. Este texto vem antes do primeiro título.',
    '',
    '# Introdução',
    '',
    'Este documento resume as metas e os riscos do projeto de expansão. A equipe revisa os números a cada trimestre.',
    '',
    '## Metas',
    '',
    '| Trimestre | Meta | Realizado |',
    '| --- | ---: | ---: |',
    '| T1 | 1.200,50 | 1.100,00 |',
    '| T2 | 1.500,00 | **1.620,75** |',
    '| T3 | 1.800,00 | 1.750,25 |',
    '',
    'A meta anual é acompanhada pela diretoria.',
    '',
    '## Riscos',
    '',
    '- Atraso na entrega dos fornecedores',
    '- Variação cambial',
    '- Falta de pessoal',
    '',
    '## Exemplo técnico',
    '',
    '```',
    '# não é título',
    '| Coluna | Valor |',
    '| --- | --- |',
    '| a | 1 |',
    '```',
    ''
  ].join('\n')
}

mkdirSync(OUT, { recursive: true })
const files: [string, string][] = [['vendas.csv', vendasCsv()], ['vendas-br.csv', vendasBrCsv()], ['notas.md', notasMd()]]
for (const [name, content] of files) {
  writeFileSync(join(OUT, name), content, 'utf8')
  console.log(`${name}: ${content.length} caracteres`)
}
