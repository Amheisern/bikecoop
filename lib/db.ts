import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const globalForDb = globalThis as unknown as { db?: Database.Database }

// Adds a column to an existing table if it's not already there. schema.sql's
// CREATE TABLE IF NOT EXISTS only applies to brand-new databases, so columns
// added after a table already exists (on an already-deployed DB) need this.
function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.pragma(`table_info(${table})`) as { name: string }[]
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

// One-off data fixes that must run exactly once per database, tracked in
// schema_migrations so re-deploys don't re-apply (or permanently re-force) them.
function runOnce(db: Database.Database, name: string, fn: () => void) {
  const alreadyRan = db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(name)
  if (alreadyRan) return
  fn()
  db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name)
}

function migrate(db: Database.Database) {
  ensureColumn(db, 'people', 'is_site_lead', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'people', 'street1', 'TEXT')
  ensureColumn(db, 'people', 'street2', 'TEXT')
  ensureColumn(db, 'people', 'city', 'TEXT')
  ensureColumn(db, 'people', 'state', 'TEXT')
  ensureColumn(db, 'people', 'postal_code', 'TEXT')
  ensureColumn(db, 'people', 'country', 'TEXT')
  ensureColumn(db, 'people', 'year_of_birth', 'INTEGER')
  ensureColumn(db, 'people', 'tags', 'TEXT')
  // Legacy Freehub person id, set by the Phase 6 CSV import so re-running the
  // import matches people instead of duplicating them.
  ensureColumn(db, 'people', 'freehub_id', 'INTEGER')

  // is_site_lead used to be conflated with is_staff (whoever had is_staff = 1
  // populated the "Working today" dropdown). Preserve that prior behavior for
  // already-existing people the first time this runs, without permanently
  // forcing the two flags to stay in sync going forward.
  runOnce(db, 'backfill_site_lead_from_staff', () => {
    db.exec('UPDATE people SET is_site_lead = 1 WHERE is_staff = 1')
  })

  // watch and heads_up were functionally identical (both just non-blocking
  // banners) — merged into a single "watch" level.
  runOnce(db, 'merge_heads_up_into_watch', () => {
    db.exec("UPDATE flags SET level = 'watch' WHERE level = 'heads_up'")
  })
}

// Waits synchronously without spinning the CPU (better-sqlite3 is sync, so a
// promise-based sleep can't help here).
function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function createConnection() {
  // `next build` imports every route in several parallel workers to collect
  // page data. On a fresh checkout (like every Render build) they all try to
  // create and migrate the same database file at once and the build fails
  // with SQLITE_BUSY. The build never needs real data (every page renders per
  // request, behind the login), so build workers get a throwaway in-memory DB.
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
  const dbPath = isBuild ? ':memory:' : process.env.DATABASE_PATH || './bikecoop.db'
  const db = new Database(dbPath, { timeout: 10000 })
  db.pragma('busy_timeout = 10000')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const schemaPath = path.join(process.cwd(), 'db', 'schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf8')

  // Several processes can open the database at once (e.g. next build's
  // parallel workers on a brand-new file). Schema setup and migrations are
  // idempotent, so on lock contention just wait and try again.
  for (let attempt = 0; ; attempt++) {
    try {
      db.exec(schema)
      migrate(db)
      break
    } catch (error) {
      const busy = error instanceof Error && 'code' in error && error.code === 'SQLITE_BUSY'
      if (!busy || attempt >= 50) throw error
      sleepSync(100)
    }
  }

  return db
}

export const db = globalForDb.db ?? createConnection()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db
}
