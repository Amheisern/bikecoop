import { db } from '@/lib/db'
import { todayISO, addDaysISO } from '@/lib/dates'

// Days after a membership expires before the renewal notice is due — a grace
// week so people who renew in person never get emailed. Tunable, like
// REWARD_TIERS.
export const LAPSE_GRACE_DAYS = 7

export type LapseEmailQueueEntry = {
  id: number
  first_name: string
  last_name: string
  email: string
  latest_end_date: string
}

// Everyone due a lapsed notice: latest membership expired at least
// LAPSE_GRACE_DAYS ago, has an email, hasn't opted out, isn't banned, and
// hasn't already been sent a notice for this particular lapse.
export function getLapseEmailQueue(): Promise<LapseEmailQueueEntry[]> {
  const cutoff = addDaysISO(todayISO(), -LAPSE_GRACE_DAYS)
  return db.all<LapseEmailQueueEntry>(
      `SELECT p.id, p.first_name, p.last_name, p.email, m.end_date as latest_end_date
       FROM people p
       JOIN memberships m ON m.person_id = p.id
       WHERE m.end_date = (SELECT MAX(end_date) FROM memberships WHERE person_id = p.id)
         AND m.end_date <= ?
         AND p.email IS NOT NULL
         AND p.email_opt_out = 0
         AND NOT EXISTS (
           SELECT 1 FROM flags f
           WHERE f.person_id = p.id AND f.level = 'banned' AND f.resolved_at IS NULL
         )
         AND NOT EXISTS (
           SELECT 1 FROM lapse_emails le
           WHERE le.person_id = p.id AND le.membership_end_date = m.end_date
         )
       GROUP BY p.id
       ORDER BY m.end_date DESC`,
    cutoff
  )
}

// The notice itself. Edit freely — plain text on purpose (renders everywhere,
// never lands in Promotions as often as HTML blasts do).
export function renderLapseEmail(firstName: string, endDate: string): { subject: string; text: string } {
  return {
    subject: 'Your St. Pete Bike Coop membership has expired',
    text: [
      `Hi ${firstName},`,
      '',
      `Your annual membership at the St. Pete Bike Coop expired on ${endDate} — we'd love to have you back!`,
      '',
      'Renewing is easy: just stop by the shop any open evening (6:00–8:30pm) and any volunteer at the desk can renew you on the spot.',
      '',
      'Thanks for being part of the coop,',
      'St. Pete Bike Coop',
    ].join('\n'),
  }
}

export async function recordLapseEmail(input: {
  personId: number
  endDate: string
  status: 'sent' | 'dry_run'
  loggedBy: string | null
}): Promise<void> {
  await db.run(
    `INSERT INTO lapse_emails (person_id, membership_end_date, status, logged_by)
     VALUES (?, ?, ?, ?)`,
    input.personId,
    input.endDate,
    input.status,
    input.loggedBy
  )
}

export type LapseEmailLogEntry = {
  id: number
  person_id: number
  first_name: string
  last_name: string
  membership_end_date: string
  status: 'sent' | 'dry_run'
  logged_by: string | null
  sent_at: string
}

export function getRecentLapseEmails(limit = 20): Promise<LapseEmailLogEntry[]> {
  return db.all<LapseEmailLogEntry>(
      `SELECT le.id, le.person_id, p.first_name, p.last_name,
              le.membership_end_date, le.status, le.logged_by, le.sent_at
       FROM lapse_emails le
       JOIN people p ON p.id = le.person_id
       ORDER BY le.sent_at DESC, le.id DESC
       LIMIT ?`,
    limit
  )
}
