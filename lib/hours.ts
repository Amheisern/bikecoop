import { db } from '@/lib/db'

export const MILESTONES = [5, 10, 20, 30, 50, 100, 200, 300, 400, 500]
export const HOURS_PER_VOLUNTEER_VISIT = 2.5

export async function getVolunteerHours(personId: number): Promise<number> {
  const row = await db.get<{ count: number }>(
    'SELECT COUNT(*) as count FROM visits WHERE person_id = ? AND is_volunteer = 1',
    personId
  )
  return (row?.count ?? 0) * HOURS_PER_VOLUNTEER_VISIT
}

export async function getFootTraffic(personId: number): Promise<number> {
  const row = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM visits WHERE person_id = ?', personId)
  return row?.count ?? 0
}

export function getCurrentMilestone(hours: number): number | null {
  let current: number | null = null
  for (const threshold of MILESTONES) {
    if (hours >= threshold) current = threshold
  }
  return current
}

export function getAchievedMilestones(hours: number): number[] {
  return MILESTONES.filter((threshold) => hours >= threshold)
}

export function getCrossedMilestone(hoursBefore: number, hoursAfter: number): number | null {
  let crossed: number | null = null
  for (const threshold of MILESTONES) {
    if (hoursBefore < threshold && hoursAfter >= threshold) crossed = threshold
  }
  return crossed
}

export type VolunteerRosterEntry = {
  id: number
  first_name: string
  last_name: string
  hours: number
}

export function getVolunteerRoster(): Promise<VolunteerRosterEntry[]> {
  return db.all<VolunteerRosterEntry>(
    `SELECT p.id, p.first_name, p.last_name, COUNT(*) * ? as hours
     FROM people p
     JOIN visits v ON v.person_id = p.id AND v.is_volunteer = 1
     GROUP BY p.id
     ORDER BY hours DESC`,
    HOURS_PER_VOLUNTEER_VISIT
  )
}
