# ADR-015 — Driver SQLite: `node:sqlite`

Status: aceita · 09/10/2026 · Requisitos: RNF-10 (núcleo runtime-neutral), questão aberta 6

## Contexto

A seção 5.1 exige que o núcleo não importe `bun:*` e rode em Bun e Deno. O Store (M5) usa SQLite por uma interface `SqliteDriver`, com Drizzle como mapeamento. Candidatos: `node:sqlite` (embutido) e `better-sqlite3` (addon nativo).

## Evidência (smoke `tests/runtime-smoke.test.ts`)

| Runtime | Versão | `node:sqlite` (criar, transação, ler, rollback) | `@resvg/resvg-js` 2.6.2 |
|---|---|---|---|
| Bun | 1.4.2 (Windows x64) | passa | passa |
| Deno | 2.9.5 (Windows x64) | passa | passa |

`better-sqlite3` não foi testado: `node:sqlite` passou nos dois runtimes sem dependência extra.

## Decisão

Usar `node:sqlite` (`DatabaseSync`) como implementação de `SqliteDriver`. Drizzle documenta suporte nativo a `node:sqlite`; a integração é verificada na Task 20 (M5). O renderer de gráfico mantém `@resvg/resvg-js`; o plano B `@resvg/resvg-wasm` não é necessário.

## Consequências

- Zero addon nativo extra para o banco; nenhuma compilação no `bun install`.
- Versões fixadas: Deno 2.9.5 e Bun 1.4.2. O smoke roda em `bun test` e `deno task test`; a atualização de qualquer runtime exige rodar os dois.
- Se uma versão futura quebrar `node:sqlite` em um runtime, troca-se só o adapter de `SqliteDriver` para `better-sqlite3`, com nova ADR.
