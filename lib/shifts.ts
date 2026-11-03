import { db } from '@/lib/db'
import { addDaysISO, todayISO } from '@/lib/dates'
import { getTopFlagLevel, type FlagLevel } from '@/lib/flags'
import { getPerson } from '@/lib/people'

// Weekly volunteer shifts (docs/volunteer-shifts-plan.md, Phase 2). Nights and
// roles are code constants, like REWARD_TIERS: edit them here as shop policy
// changes, no migration needed. Shift dates are computed, never stored.

// Regular shift nights, as JavaScript weekday numbers (0 = Sunday).
export const SHIFT_NIGHTS = [1, 2, 4] // Mon, Tue, Thu
export const SHIFT_HOURS = '6:00 to 8:30pm'

// How far ahead people can be signed up, counting tonight as day one.
export const SIGNUP_WEEKS_AHEAD = 4

export type ShiftRoleId = 'shift_lead' | 'mechanic' | 'greeter'

export type ShiftRole = {
  id: ShiftRoleId
  label: string
  // null = no cap.
  maxSlots: number | null
  // Only people marked Shift lead (is_site_lead = 1) can take this role.
  shiftLeadsOnly: boolean
}

export const SHIFT_ROLES: ShiftRole[] = [
  { id: 'shift_lead', label: 'Shift lead', maxSlots: 1, shiftLeadsOnly: true },
  { id: 'mechanic', label: 'Mechanic', maxSlots: null, shiftLeadsOnly: false },
  { id: 'greeter', label: 'Greeter / front desk', maxSlots: null, shiftLeadsOnly: false },
]

export function getShiftRole(roleId: string): ShiftRole | undefined {
  return SHIFT_ROLES.find((role) => role.id === roleId)
}

function weekdayOf(dateISO: string): number {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay()
}

const longDateFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

// "Thursday, Nov 5"
export function formatShiftDate(dateISO: string): string {
  return longDateFormat.format(new Date(`${dateISO}T00:00:00Z`))
}

// Every shift night from `fromISO` (default: today in the shop's timezone)
// through the end of the signup window, oldest first.
export function upcomingShiftDates(fromISO: string = todayISO()): string[] {
  const dates: string[] = []
  for (let offset = 0; offset < SIGNUP_WEEKS_AHEAD * 7; offset++) {
    const date = addDaysISO(fromISO, offset)
    if (SHIFT_NIGHTS.includes(weekdayOf(date))) dates.push(date)
  }
  return dates
}

export function isOpenShiftDate(dateISO: string): boolean {
  return upcomingShiftDates().includes(dateISO)
}

export type ShiftSignup = {
  id: number
  person_id: number
  shift_date: string
  role_id: ShiftRoleId
  source: string
  logged_by: string | null
  created_at: string
  first_name: string
  last_name: string
  flag_level: FlagLevel | null
}

const SIGNUP_SELECT = `
  SELECT shift_signups.*, people.first_name, people.last_name,
    (SELECT flags.level FROM flags
     WHERE flags.person_id = people.id AND flags.resolved_at IS NULL
     ORDER BY flags.level = 'banned' DESC
     LIMIT 1) AS flag_level
  FROM shift_signups
  JOIN people ON people.id = shift_signups.person_id`

export function getSignupsBetween(startISO: string, endISO: string): ShiftSignup[] {
  return db
    .prepare(
      `${SIGNUP_SELECT}
       WHERE shift_signups.shift_date BETWEEN ? AND ?
       ORDER BY shift_signups.shift_date, people.last_name, people.first_name`
    )
    .all(startISO, endISO) as ShiftSignup[]
}

export function getSignupsForDate(dateISO: string): ShiftSignup[] {
  return getSignupsBetween(dateISO, dateISO)
}

export type SignUpResult = { ok: true } | { ok: false; error: string }

export function signUpForShift(input: {
  personId: number
  shiftDate: string
  roleId: string
  loggedBy: string | null
  source?: 'app' | 'slack'
}): SignUpResult {
  const role = getShiftRole(input.roleId)
  if (!role) return { ok: false, error: 'Unknown role.' }
  if (!isOpenShiftDate(input.shiftDate)) {
    return { ok: false, error: `Signups are open for shift nights in the next ${SIGNUP_WEEKS_AHEAD} weeks only.` }
  }
  const person = getPerson(input.personId)
  if (!person) return { ok: false, error: 'Invalid person.' }
  // Same rule as volunteer check-in: only people marked Volunteer.
  if (person.is_staff !== 1) {
    return { ok: false, error: `Mark ${person.first_name} as a Volunteer on their profile first.` }
  }
  if (role.shiftLeadsOnly && person.is_site_lead !== 1) {
    return { ok: false, error: `Only people marked Shift lead can take the ${role.label} slot.` }
  }
  if (getTopFlagLevel(person.id) === 'banned') {
    return { ok: false, error: `${person.first_name} has an active banned flag.` }
  }

  // Check-then-insert in one transaction so the slot cap can't be exceeded.
  return db.transaction((): SignUpResult => {
    const existing = db
      .prepare('SELECT person_id FROM shift_signups WHERE shift_date = ? AND role_id = ?')
      .all(input.shiftDate, role.id) as { person_id: number }[]
    if (existing.some((row) => row.person_id === person.id)) {
      return { ok: false, error: `${person.first_name} is already signed up for ${role.label} that night.` }
    }
    if (role.maxSlots !== null && existing.length >= role.maxSlots) {
      return { ok: false, error: `That night already has a ${role.label.toLowerCase()}.` }
    }
    db.prepare(
      `INSERT INTO shift_signups (person_id, shift_date, role_id, source, logged_by)
       VALUES (?, ?, ?, ?, ?)`
    ).run(person.id, input.shiftDate, role.id, input.source ?? 'app', input.loggedBy)
    return { ok: true }
  })()
}

export function cancelSignup(signupId: number): boolean {
  return db.prepare('DELETE FROM shift_signups WHERE id = ?').run(signupId).changes === 1
}

export type ExpectedVolunteer = {
  person_id: number
  first_name: string
  last_name: string
  flag_level: FlagLevel | null
  role_ids: ShiftRoleId[]
  // Already here tonight as a guest (not yet logging a volunteer session).
  checked_in_as_guest: boolean
}

// People signed up for a night who haven't checked in as a volunteer yet,
// one entry per person (with all their roles). Defaults to tonight.
export function getExpectedVolunteers(dateISO: string = todayISO()): ExpectedVolunteer[] {
  const rows = db
    .prepare(
      `${SIGNUP_SELECT}
       LEFT JOIN visits ON visits.person_id = shift_signups.person_id AND visits.visit_date = ?
       WHERE shift_signups.shift_date = ?
         AND (visits.id IS NULL OR visits.is_volunteer = 0)
       ORDER BY people.last_name, people.first_name`
    )
    .all(dateISO, dateISO) as ShiftSignup[]
  const guestIds = new Set(
    (
      db
        .prepare('SELECT person_id FROM visits WHERE visit_date = ? AND is_volunteer = 0 AND checked_out = 0')
        .all(dateISO) as { person_id: number }[]
    ).map((row) => row.person_id)
  )

  const byPerson = new Map<number, ExpectedVolunteer>()
  for (const row of rows) {
    const entry = byPerson.get(row.person_id) ?? {
      person_id: row.person_id,
      first_name: row.first_name,
      last_name: row.last_name,
      flag_level: row.flag_level,
      role_ids: [],
      checked_in_as_guest: guestIds.has(row.person_id),
    }
    entry.role_ids.push(row.role_id)
    byPerson.set(row.person_id, entry)
  }
  // Keep roles in the SHIFT_ROLES order (shift lead first).
  const roleOrder = SHIFT_ROLES.map((role) => role.id)
  for (const entry of byPerson.values()) {
    entry.role_ids.sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b))
  }
  return [...byPerson.values()]
}
