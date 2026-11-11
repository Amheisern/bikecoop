import { db } from '@/lib/db'
import { HOURS_PER_VOLUNTEER_VISIT } from '@/lib/hours'

export type PeriodType = 'monthly' | 'quarterly' | 'annual'

export type Period = {
  type: PeriodType
  year: number
  month?: number // 1-12, monthly only
  quarter?: number // 1-4, quarterly only
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function getPeriodRange(period: Period): { start: string; end: string; label: string } {
  if (period.type === 'monthly') {
    const month = period.month ?? 1
    const start = `${period.year}-${pad2(month)}-01`
    const end = `${period.year}-${pad2(month)}-${pad2(lastDayOfMonth(period.year, month))}`
    return { start, end, label: `${MONTH_NAMES[month - 1]} ${period.year}` }
  }

  if (period.type === 'quarterly') {
    const quarter = period.quarter ?? 1
    const startMonth = (quarter - 1) * 3 + 1
    const endMonth = startMonth + 2
    const start = `${period.year}-${pad2(startMonth)}-01`
    const end = `${period.year}-${pad2(endMonth)}-${pad2(lastDayOfMonth(period.year, endMonth))}`
    return { start, end, label: `Q${quarter} ${period.year}` }
  }

  return { start: `${period.year}-01-01`, end: `${period.year}-12-31`, label: `${period.year}` }
}

export type ReportMetrics = {
  totalVisits: number
  uniqueVisitors: number
  volunteerSessions: number
  volunteerHours: number
  newMembers: number
  lapsedMembers: number
}

export async function getReportMetrics(period: Period): Promise<ReportMetrics> {
  const { start, end } = getPeriodRange(period)

  const [visitStats, newMembers, lapsedMembers] = await Promise.all([
    db.get<{ total: number; uniqueVisitors: number; volunteerSessions: number | null }>(
      `SELECT COUNT(*) as total, COUNT(DISTINCT person_id) as uniqueVisitors, SUM(is_volunteer) as volunteerSessions
       FROM visits WHERE visit_date BETWEEN ? AND ?`,
      start,
      end
    ),
    db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM (
         SELECT person_id, MIN(start_date) as first_start FROM memberships GROUP BY person_id
       ) t WHERE t.first_start BETWEEN ? AND ?`,
      start,
      end
    ),
    db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM (
         SELECT person_id, MAX(end_date) as latest_end FROM memberships GROUP BY person_id
       ) t WHERE t.latest_end BETWEEN ? AND ?`,
      start,
      end
    ),
  ])

  const volunteerSessions = visitStats?.volunteerSessions ?? 0

  return {
    totalVisits: visitStats?.total ?? 0,
    uniqueVisitors: visitStats?.uniqueVisitors ?? 0,
    volunteerSessions,
    volunteerHours: volunteerSessions * HOURS_PER_VOLUNTEER_VISIT,
    newMembers: newMembers?.count ?? 0,
    lapsedMembers: lapsedMembers?.count ?? 0,
  }
}
