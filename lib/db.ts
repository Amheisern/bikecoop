import { createClient, type Client, type InStatement, type InValue } from '@libsql/client'
import fs from 'node:fs'
import path from 'node:path'

// Where the data lives (libSQL, the SQLite fork Turso runs on, so the schema
// and every query are plain SQLite):
// - Production: a Turso database. Set TURSO_DATABASE_URL (libsql://...) and
//   TURSO_AUTH_TOKEN. Render's free tier wipes local files on every deploy and
//   restart, so production data must not live on Render's disk.
// - Local dev: a SQLite file at DATABASE_PATH (default ./bikecoop.db).
// - Tests: DATABASE_PATH=:memory:.
// - `next build`: always in-memory (see below), never Turso or a real file.
type DatabaseEnv = Record<string, string | undefined>

export function resolveDatabaseUrl(env: DatabaseEnv = process.env): string {
  // `next build` imports every route in several parallel workers to collect
  // page data. The build never needs real data (every page renders per
  // request, behind the login), so build workers get a throwaway in-memory DB
  // instead of racing each other on a real one.
  if (env.NEXT_PHASE === 'phase-production-build') return ':memory:'
  if (env.TURSO_DATABASE_URL) return env.TURSO_DATABASE_URL
  const filePath = env.DATABASE_PATH || './bikecoop.db'
  return filePath === ':memory:' ? ':memory:' : `file:${filePath}`
}

export type RunResult = { changes: number; lastInsertRowid: number }

// The small query API the rest of the app uses. Same shape as before the move
// to libSQL (all / get / run with positional `?` args), but every call is
// async because a Turso query is a network round trip.
export type Queries = {
  all<T>(sql: string, ...args: InValue[]): Promise<T[]>
  get<T>(sql: string, ...args: InValue[]): Promise<T | undefined>
  run(sql: string, ...args: InValue[]): Promise<RunResult>
}

type Executor = Pick<Client, 'execute'>

function queriesFor(executor: Executor): Queries {
  return {
    async all<T>(sql: string, ...args: InValue[]) {
      const result = await executor.execute({ sql, args })
      return result.rows as unknown as T[]
    },
    async get<T>(sql: string, ...args: InValue[]) {
      const result = await executor.execute({ sql, args })
      return result.rows[0] as unknown as T | undefined
    },
    async run(sql: string, ...args: InValue[]) {
      const result = await executor.execute({ sql, args })
      return { changes: result.rowsAffected, lastInsertRowid: Number(result.lastInsertRowid ?? 0) }
    },
  }
}

// Adds any missing columns to an existing table. schema.sql's CREATE TABLE IF
// NOT EXISTS only applies to brand-new databases, so columns added after a
// table already exists (on an already-deployed DB) need this.
async function ensureColumns(client: Client, table: string, columns: [name: string, definition: string][]) {
  const existing = new Set((await client.execute(`PRAGMA table_info(${table})`)).rows.map((row) => String(row.name)))
  for (const [name, definition] of columns) {
    if (!existing.has(name)) {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
    }
  }
}

// One-off data fixes that must run exactly once per database, tracked in
// schema_migrations so re-deploys don't re-apply (or permanently re-force)
// them. The fix and its bookkeeping row commit together.
async function runOnce(client: Client, name: string, sql: string) {
  const alreadyRan = await client.execute({ sql: 'SELECT 1 FROM schema_migrations WHERE name = ?', args: [name] })
  if (alreadyRan.rows.length > 0) return
  await client.batch([sql, { sql: 'INSERT INTO schema_migrations (name) VALUES (?)', args: [name] }], 'write')
}

async function migrate(client: Client) {
  await ensureColumns(client, 'people', [
    ['is_site_lead', 'INTEGER NOT NULL DEFAULT 0'],
    ['street1', 'TEXT'],
    ['street2', 'TEXT'],
    ['city', 'TEXT'],
    ['state', 'TEXT'],
    ['postal_code', 'TEXT'],
    ['country', 'TEXT'],
    ['year_of_birth', 'INTEGER'],
    ['tags', 'TEXT'],
    // Legacy Freehub person id, set by the Phase 6 CSV import so re-running
    // the import matches people instead of duplicating them.
    ['freehub_id', 'INTEGER'],
  ])
  await ensureColumns(client, 'visits', [['checked_out', 'INTEGER NOT NULL DEFAULT 0']])

  // is_site_lead used to be conflated with is_staff (whoever had is_staff = 1
  // populated the "Working today" dropdown). Preserve that prior behavior for
  // already-existing people the first time this runs, without permanently
  // forcing the two flags to stay in sync going forward.
  await runOnce(client, 'backfill_site_lead_from_staff', 'UPDATE people SET is_site_lead = 1 WHERE is_staff = 1')

  // watch and heads_up were functionally identical (both just non-blocking
  // banners) — merged into a single "watch" level.
  await runOnce(client, 'merge_heads_up_into_watch', "UPDATE flags SET level = 'watch' WHERE level = 'heads_up'")
}

async function openClient(): Promise<Client> {
  const client = createClient({
    url: resolveDatabaseUrl(),
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    // Busy timeout for local files (ignored for Turso).
    timeout: 10000,
  })
  const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8')
  await client.executeMultiple(schema)
  await migrate(client)
  return client
}

// One client per server process, opened (and the schema/migrations applied)
// on first use. Kept on globalThis so dev hot reloads don't reopen it.
const globalForDb = globalThis as unknown as { dbClient?: Promise<Client> }

function getClient(): Promise<Client> {
  if (!globalForDb.dbClient) {
    globalForDb.dbClient = openClient().catch((error) => {
      // Let the next request try again (e.g. Turso briefly unreachable).
      globalForDb.dbClient = undefined
      throw error
    })
  }
  return globalForDb.dbClient
}

const lazyExecutor: Executor = {
  execute: (async (stmt: InStatement) => (await getClient()).execute(stmt)) as Client['execute'],
}

export const db = {
  ...queriesFor(lazyExecutor),

  // Several writes that must all happen or none, sent in one round trip.
  async batch(statements: { sql: string; args?: InValue[] }[]): Promise<RunResult[]> {
    if (statements.length === 0) return []
    const results = await (await getClient()).batch(
      statements.map(({ sql, args = [] }) => ({ sql, args })),
      'write'
    )
    return results.map((result) => ({
      changes: result.rowsAffected,
      lastInsertRowid: Number(result.lastInsertRowid ?? 0),
    }))
  },

  // A read-then-write that must not interleave with other writes (e.g. a slot
  // cap check). Use `tx` for every query inside. Turso cancels interactive
  // transactions after 5 seconds, so keep these to a few quick statements;
  // bulk work belongs in batch().
  async transaction<T>(fn: (tx: Queries) => Promise<T>): Promise<T> {
    const tx = await (await getClient()).transaction('write')
    try {
      const result = await fn(queriesFor(tx))
      await tx.commit()
      return result
    } finally {
      tx.close()
    }
  },
}
