import { db } from '@/lib/db'

export type Note = {
  id: number
  person_id: number
  text: string
  logged_by: string | null
  created_at: string
}

export function getNotesForPerson(personId: number): Promise<Note[]> {
  return db.all<Note>('SELECT * FROM notes WHERE person_id = ? ORDER BY created_at DESC', personId)
}

export async function createNote(input: { personId: number; text: string; loggedBy: string | null }): Promise<void> {
  await db.run(
    'INSERT INTO notes (person_id, text, logged_by) VALUES (?, ?, ?)',
    input.personId,
    input.text,
    input.loggedBy
  )
}
