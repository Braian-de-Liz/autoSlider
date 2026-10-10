import { describe, expect, it } from 'bun:test'
import { Resvg } from '@resvg/resvg-js'

const runtime = 'Deno' in globalThis ? 'deno' : 'Bun' in globalThis ? 'bun' : 'node'

/**
 * Smoke do M0 (seção 5.1 e questão aberta 6): o driver SQLite e o addon resvg
 * precisam funcionar em Bun e Deno antes do Store (M5). Resultado registrado na ADR-015.
 */
describe(`RNF-10: smoke de runtime (${runtime})`, () => {
  it('node:sqlite abre banco em memória, cria tabela, grava em transação e lê', async () => {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(':memory:')
    try {
      db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY, nome TEXT NOT NULL, local_only INTEGER NOT NULL)')
      db.exec('BEGIN')
      const insert = db.prepare('INSERT INTO projects (id, nome, local_only) VALUES (?, ?, ?)')
      insert.run('p1', 'Relatório mensal', 1)
      insert.run('p2', 'Apresentação', 0)
      db.exec('COMMIT')
      const rows = db.prepare('SELECT id, nome, local_only FROM projects ORDER BY id').all()
      expect(rows).toEqual([
        { id: 'p1', nome: 'Relatório mensal', local_only: 1 },
        { id: 'p2', nome: 'Apresentação', local_only: 0 }
      ])
    } finally {
      db.close()
    }
  })

  it('node:sqlite desfaz a transação em caso de erro (persistência atômica, seção 8)', async () => {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(':memory:')
    try {
      db.exec('CREATE TABLE versions (id TEXT PRIMARY KEY, n INTEGER NOT NULL)')
      db.exec('BEGIN')
      db.prepare('INSERT INTO versions VALUES (?, ?)').run('v1', 1)
      expect(() => db.prepare('INSERT INTO versions VALUES (?, ?)').run('v1', 2)).toThrow()
      db.exec('ROLLBACK')
      expect(db.prepare('SELECT count(*) AS total FROM versions').get()).toEqual({ total: 0 })
    } finally {
      db.close()
    }
  })

  it('@resvg/resvg-js carrega o addon nativo e converte SVG em PNG', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#0b1120"/></svg>'
    const png = new Resvg(svg).render().asPng()
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })
})
