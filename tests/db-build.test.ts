import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Regression: `next build` opens the database from several workers at once,
// which failed with SQLITE_BUSY on Render's fresh checkout. During the build
// phase the app must not touch the real database file at all.
test('during next build the app uses an in-memory database, not the real file', async () => {
  const realPath = path.join(os.tmpdir(), `bikecoop-build-test-${process.pid}.db`)
  process.env.DATABASE_PATH = realPath
  process.env.NEXT_PHASE = 'phase-production-build'

  const { db } = await import('../lib/db')

  assert.equal(db.memory, true)
  assert.equal(fs.existsSync(realPath), false)
})
