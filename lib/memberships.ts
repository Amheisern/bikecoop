import { db } from '@/lib/db'
import { todayISO } from '@/lib/dates'

export type Membership = {
  id: number
  person_id: number
  start_date: string
  end_date: string
  logged_by: string | null
  created_at: string
}

export type MembershipStatus = 'active' | 'lapsed' | 'none'

export function getMembershipsForPerson(personId: number): Promise<Membership[]> {
  return db.all<Membership>('SELECT * FROM memberships WHERE person_id = ? ORDER BY end_date DESC', personId)
}

export function getLatestMembership(personId: number): Promise<Membership | undefined> {
  return db.get<Membership>('SELECT * FROM memberships WHERE person_id = ? ORDER BY end_date DESC LIMIT 1', personId)
}

// Active if the latest membership hasn't ended yet; also used for the export,
// which already has each person's latest end date in hand.
export function membershipStatusFor(latestEndDate: string | null | undefined): MembershipStatus {
  if (!latestEndDate) return 'none'
  return latestEndDate >= todayISO() ? 'active' : 'lapsed'
}

export async function getMembershipStatus(personId: number): Promise<{
  status: MembershipStatus
  latest: Membership | undefined
}> {
  const latest = await getLatestMembership(personId)
  return { status: membershipStatusFor(latest?.end_date), latest }
}

export async function createMembership(input: {
  personId: number
  startDate: string
  endDate: string
  loggedBy: string | null
}): Promise<void> {
  await db.run(
    `INSERT INTO memberships (person_id, start_date, end_date, logged_by) VALUES (?, ?, ?, ?)`,
    input.personId,
    input.startDate,
    input.endDate,
    input.loggedBy
  )
}

export type LapsedPerson = {
  id: number
  first_name: string
  last_name: string
  latest_end_date: string
}

export function getLapsedPeople(): Promise<LapsedPerson[]> {
  return db.all<LapsedPerson>(
    `SELECT p.id, p.first_name, p.last_name, m.end_date as latest_end_date
     FROM people p
     JOIN memberships m ON m.person_id = p.id
     WHERE m.end_date = (SELECT MAX(end_date) FROM memberships WHERE person_id = p.id)
       AND m.end_date < ?
     GROUP BY p.id
     ORDER BY m.end_date DESC`,
    todayISO()
  )
}
