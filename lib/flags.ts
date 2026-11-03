import { db } from '@/lib/db'

export type FlagLevel = 'banned' | 'watch'

export type Flag = {
  id: number
  person_id: number
  level: FlagLevel
  note: string | null
  logged_by: string | null
  created_at: string
  resolved_at: string | null
}

export function getActiveFlags(personId: number): Flag[] {
  return db
    .prepare('SELECT * FROM flags WHERE person_id = ? AND resolved_at IS NULL ORDER BY created_at DESC')
    .all(personId) as Flag[]
}

// The most serious active flag on a person (banned outranks watch), or null.
// Used for the compact flag marker on front-desk search results and tiles.
export function getTopFlagLevel(personId: number): FlagLevel | null {
  const row = db
    .prepare(
      `SELECT level FROM flags
       WHERE person_id = ? AND resolved_at IS NULL
       ORDER BY level = 'banned' DESC
       LIMIT 1`
    )
    .get(personId) as { level: FlagLevel } | undefined
  return row?.level ?? null
}

export function createFlag(input: {
  personId: number
  level: FlagLevel
  note: string | null
  loggedBy: string | null
}): void {
  db.prepare(
    `INSERT INTO flags (person_id, level, note, logged_by) VALUES (?, ?, ?, ?)`
  ).run(input.personId, input.level, input.note, input.loggedBy)
}

export function resolveFlag(flagId: number): void {
  db.prepare(`UPDATE flags SET resolved_at = datetime('now') WHERE id = ?`).run(flagId)
}
