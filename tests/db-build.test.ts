import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Regression: `next build` opens the database from several workers at once,
// which failed with SQLITE_BUSY on Render's fresh checkout. During the build
// phase the app must not touch the real database (file or Turso) at all.
test('during next build the app uses an in-memory database, not the real file', async () => {
  const realPath = path.join(os.tmpdir(), `bikecoop-build-test-${process.pid}.db`)
  process.env.DATABASE_PATH = realPath
  process.env.NEXT_PHASE = 'phase-production-build'

  const { db, resolveDatabaseUrl } = await import('../lib/db')

  assert.equal(resolveDatabaseUrl(), ':memory:')
  // Opening the database (schema + migrations) must not create the file.
  await db.get('SELECT 1')
  assert.equal(fs.existsSync(realPath), false)
})

test('the build never points at Turso, even when Turso is configured', async () => {
  const { resolveDatabaseUrl } = await import('../lib/db')
  assert.equal(
    resolveDatabaseUrl({ NEXT_PHASE: 'phase-production-build', TURSO_DATABASE_URL: 'libsql://example.turso.io' }),
    ':memory:'
  )
})

test('Turso wins over a local file when configured; otherwise DATABASE_PATH or ./bikecoop.db', async () => {
  const { resolveDatabaseUrl } = await import('../lib/db')
  assert.equal(
    resolveDatabaseUrl({ TURSO_DATABASE_URL: 'libsql://example.turso.io', DATABASE_PATH: '/var/data/x.db' }),
    'libsql://example.turso.io'
  )
  assert.equal(resolveDatabaseUrl({ DATABASE_PATH: '/var/data/x.db' }), 'file:/var/data/x.db')
  assert.equal(resolveDatabaseUrl({ DATABASE_PATH: ':memory:' }), ':memory:')
  assert.equal(resolveDatabaseUrl({}), 'file:./bikecoop.db')
})
