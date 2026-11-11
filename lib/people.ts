import { db } from '@/lib/db'
import { todayISO } from '@/lib/dates'
import type { FlagLevel } from '@/lib/flags'

export type Person = {
  id: number
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  is_staff: number
  is_site_lead: number
  email_opt_out: number
  street1: string | null
  street2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  year_of_birth: number | null
  tags: string | null
  freehub_id: number | null
  created_at: string
}

export type Visit = {
  id: number
  person_id: number
  visit_date: string
  is_volunteer: number
  checked_out: number
  logged_by: string | null
  created_at: string
}

export type CheckedInPerson = Person & {
  is_volunteer_visit: number
  flag_level: FlagLevel | null
}

// A search result carries the person's most serious active flag (banned
// outranks watch) for the front-desk marker, fetched in the same query.
export type SearchResult = Person & { flag_level: FlagLevel | null }

const TOP_FLAG_LEVEL = `(SELECT flags.level FROM flags
   WHERE flags.person_id = people.id AND flags.resolved_at IS NULL
   ORDER BY flags.level = 'banned' DESC
   LIMIT 1)`

export type PersonInput = {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  isStaff: boolean
  isSiteLead: boolean
  emailOptOut: boolean
  street1: string | null
  street2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  yearOfBirth: number | null
  tags: string | null
}

// Front-desk search keeps the list short. Pages show a "keep typing" hint
// when a search comes back full, so extra matches are never dropped silently.
export const SEARCH_LIMIT = 10

// `volunteersOnly` limits results to people marked Volunteer (`is_staff = 1`),
// for shift signups; `shiftLeadsOnly` further limits to people marked
// Shift lead (`is_site_lead = 1`), for signing up a shift's lead. The limit
// applies after the filters, so a full page of non-matching people can't push
// matching ones out of the results.
export async function searchPeople(
  query: string,
  options: { volunteersOnly?: boolean; shiftLeadsOnly?: boolean } = {}
): Promise<SearchResult[]> {
  if (!query.trim()) return []
  const term = `%${query.trim()}%`
  const filters = [
    options.volunteersOnly ? 'AND is_staff = 1' : '',
    options.shiftLeadsOnly ? 'AND is_site_lead = 1' : '',
  ].join(' ')
  return db.all<SearchResult>(
    `SELECT people.*, ${TOP_FLAG_LEVEL} AS flag_level FROM people
     WHERE ((first_name || ' ' || last_name) LIKE ? OR email LIKE ?) ${filters}
     ORDER BY last_name, first_name LIMIT ?`,
    term,
    term,
    SEARCH_LIMIT
  )
}

export function getPeopleCheckedInToday(): Promise<CheckedInPerson[]> {
  return db.all<CheckedInPerson>(
    `SELECT people.*, visits.is_volunteer AS is_volunteer_visit, ${TOP_FLAG_LEVEL} AS flag_level
     FROM visits
     JOIN people ON people.id = visits.person_id
     WHERE visits.visit_date = ? AND visits.checked_out = 0
     ORDER BY people.last_name, people.first_name`,
    todayISO()
  )
}

// Promote/demote re-stamp logged_by with whoever made the change, matching how
// a re-check-in already works. With no shift lead selected, the original
// logged_by is kept rather than erased.
export async function promoteVisitToVolunteer(personId: number, loggedBy: string | null = null): Promise<boolean> {
  const result = await db.run(
    `UPDATE visits SET is_volunteer = 1, logged_by = COALESCE(?, logged_by)
     WHERE person_id = ? AND visit_date = ? AND checked_out = 0 AND is_volunteer = 0`,
    loggedBy,
    personId,
    todayISO()
  )
  return result.changes === 1
}

export async function changeVisitToVisitor(personId: number, loggedBy: string | null = null): Promise<boolean> {
  const result = await db.run(
    `UPDATE visits SET is_volunteer = 0, logged_by = COALESCE(?, logged_by)
     WHERE person_id = ? AND visit_date = ? AND checked_out = 0 AND is_volunteer = 1`,
    loggedBy,
    personId,
    todayISO()
  )
  return result.changes === 1
}

export async function checkOutPersonToday(personId: number): Promise<boolean> {
  const result = await db.run(
    'UPDATE visits SET checked_out = 1 WHERE person_id = ? AND visit_date = ? AND checked_out = 0',
    personId,
    todayISO()
  )
  return result.changes === 1
}

export async function deleteVisitToday(personId: number): Promise<boolean> {
  const result = await db.run(
    'DELETE FROM visits WHERE person_id = ? AND visit_date = ? AND checked_out = 0',
    personId,
    todayISO()
  )
  return result.changes === 1
}

export function getPerson(id: number): Promise<Person | undefined> {
  return db.get<Person>('SELECT * FROM people WHERE id = ?', id)
}

export function getStaff(): Promise<Person[]> {
  return db.all<Person>('SELECT * FROM people WHERE is_staff = 1 ORDER BY first_name, last_name')
}

export function getSiteLeads(): Promise<Person[]> {
  return db.all<Person>('SELECT * FROM people WHERE is_site_lead = 1 ORDER BY first_name, last_name')
}

const PERSON_COLUMNS = `first_name, last_name, email, phone, is_staff, is_site_lead, email_opt_out,
  street1, street2, city, state, postal_code, country, year_of_birth, tags`

// The form's values in the same order as PERSON_COLUMNS.
function personValues(input: PersonInput) {
  return [
    input.firstName,
    input.lastName,
    input.email,
    input.phone,
    input.isStaff ? 1 : 0,
    input.isSiteLead ? 1 : 0,
    input.emailOptOut ? 1 : 0,
    input.street1,
    input.street2,
    input.city,
    input.state,
    input.postalCode,
    input.country,
    input.yearOfBirth,
    input.tags,
  ]
}

export async function createPerson(input: PersonInput): Promise<number> {
  const values = personValues(input)
  const result = await db.run(
    `INSERT INTO people (${PERSON_COLUMNS}) VALUES (${values.map(() => '?').join(', ')})`,
    ...values
  )
  return result.lastInsertRowid
}

export async function updatePerson(id: number, input: PersonInput): Promise<void> {
  const assignments = PERSON_COLUMNS.split(',')
    .map((column) => `${column.trim()} = ?`)
    .join(', ')
  await db.run(`UPDATE people SET ${assignments} WHERE id = ?`, ...personValues(input), id)
}

export function getVisitsForPerson(personId: number): Promise<Visit[]> {
  return db.all<Visit>('SELECT * FROM visits WHERE person_id = ? ORDER BY visit_date DESC', personId)
}

export async function checkIn(input: { personId: number; isVolunteer: boolean; loggedBy: string | null }): Promise<void> {
  // MAX() so a plain re-check-in the same evening never downgrades an
  // already-logged volunteer session (which would silently erase 2.5 hours).
  await db.run(
    `INSERT INTO visits (person_id, visit_date, is_volunteer, checked_out, logged_by)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT (person_id, visit_date) DO UPDATE SET
       is_volunteer = MAX(is_volunteer, excluded.is_volunteer),
       checked_out = 0,
       logged_by = excluded.logged_by`,
    input.personId,
    todayISO(),
    input.isVolunteer ? 1 : 0,
    input.loggedBy
  )
}
