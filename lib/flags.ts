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

export function getActiveFlags(personId: number): Promise<Flag[]> {
  return db.all<Flag>(
    'SELECT * FROM flags WHERE person_id = ? AND resolved_at IS NULL ORDER BY created_at DESC',
    personId
  )
}

// The most serious active flag on a person (banned outranks watch), or null.
// Used for the compact flag marker on front-desk search results and tiles.
export async function getTopFlagLevel(personId: number): Promise<FlagLevel | null> {
  const row = await db.get<{ level: FlagLevel }>(
    `SELECT level FROM flags
     WHERE person_id = ? AND resolved_at IS NULL
     ORDER BY level = 'banned' DESC
     LIMIT 1`,
    personId
  )
  return row?.level ?? null
}

export async function createFlag(input: {
  personId: number
  level: FlagLevel
  note: string | null
  loggedBy: string | null
}): Promise<void> {
  await db.run(
    `INSERT INTO flags (person_id, level, note, logged_by) VALUES (?, ?, ?, ?)`,
    input.personId,
    input.level,
    input.note,
    input.loggedBy
  )
}

export async function resolveFlag(flagId: number): Promise<void> {
  await db.run(`UPDATE flags SET resolved_at = datetime('now') WHERE id = ?`, flagId)
}
