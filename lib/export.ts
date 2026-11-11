import { db } from '@/lib/db'
import type { Person } from '@/lib/people'
import { membershipStatusFor } from '@/lib/memberships'
import { todayISO } from '@/lib/dates'
import { HOURS_PER_VOLUNTEER_VISIT, getCurrentMilestone } from '@/lib/hours'

export type ExportRow = {
  id: number
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  membership_status: 'active' | 'lapsed' | 'none'
  days_until_or_since_expiry: number | null
  total_volunteer_hours: number
  current_milestone: number | null
  active_flags: string
  email_opt_out: boolean
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

// Two queries for everyone, not a few per person: on Turso every query is a
// network round trip, and a per-person loop over a few thousand people would
// take minutes.
export async function getExportRows(): Promise<ExportRow[]> {
  const [people, activeFlags] = await Promise.all([
    db.all<Person & { latest_end_date: string | null; volunteer_visits: number }>(
      `SELECT people.*,
         (SELECT MAX(end_date) FROM memberships WHERE memberships.person_id = people.id) AS latest_end_date,
         (SELECT COUNT(*) FROM visits WHERE visits.person_id = people.id AND visits.is_volunteer = 1) AS volunteer_visits
       FROM people
       ORDER BY last_name, first_name`
    ),
    db.all<{ person_id: number; level: string }>(
      'SELECT person_id, level FROM flags WHERE resolved_at IS NULL ORDER BY created_at DESC, id DESC'
    ),
  ])
  const flagsByPerson = new Map<number, string[]>()
  for (const flag of activeFlags) {
    flagsByPerson.set(flag.person_id, [...(flagsByPerson.get(flag.person_id) ?? []), flag.level])
  }
  const todayMs = new Date(`${todayISO()}T00:00:00Z`).getTime()

  return people.map((person) => {
    const daysUntilOrSinceExpiry = person.latest_end_date
      ? Math.round((new Date(person.latest_end_date).getTime() - todayMs) / MS_PER_DAY)
      : null
    const hours = person.volunteer_visits * HOURS_PER_VOLUNTEER_VISIT

    return {
      id: person.id,
      first_name: person.first_name,
      last_name: person.last_name,
      // Opted-out addresses never leave the app — the export's stated purpose
      // is drafting email in external tools.
      email: person.email_opt_out === 1 ? null : person.email,
      phone: person.phone,
      membership_status: membershipStatusFor(person.latest_end_date),
      days_until_or_since_expiry: daysUntilOrSinceExpiry,
      total_volunteer_hours: hours,
      current_milestone: getCurrentMilestone(hours),
      active_flags: (flagsByPerson.get(person.id) ?? []).join(','),
      email_opt_out: person.email_opt_out === 1,
    }
  })
}

export function rowsToCSV(rows: ExportRow[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0]) as (keyof ExportRow)[]

  const escape = (value: unknown) => {
    const str = value === null || value === undefined ? '' : String(value)
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
  }

  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  return lines.join('\n')
}
