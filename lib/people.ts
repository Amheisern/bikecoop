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

export function searchPeople(query: string): Person[] {
  if (!query.trim()) return []
  const term = `%${query.trim()}%`
  return db
    .prepare(
      `SELECT * FROM people
       WHERE (first_name || ' ' || last_name) LIKE ? OR email LIKE ?
       ORDER BY last_name, first_name LIMIT ?`
    )
    .all(term, term, SEARCH_LIMIT) as Person[]
}

export function getPeopleCheckedInToday(): CheckedInPerson[] {
  return db
    .prepare(
      `SELECT people.*, visits.is_volunteer AS is_volunteer_visit,
         (SELECT flags.level FROM flags
          WHERE flags.person_id = people.id AND flags.resolved_at IS NULL
          ORDER BY flags.level = 'banned' DESC
          LIMIT 1) AS flag_level
       FROM visits
       JOIN people ON people.id = visits.person_id
       WHERE visits.visit_date = ? AND visits.checked_out = 0
       ORDER BY people.last_name, people.first_name`
    )
    .all(todayISO()) as CheckedInPerson[]
}

// Promote/demote re-stamp logged_by with whoever made the change, matching how
// a re-check-in already works. With no shift lead selected, the original
// logged_by is kept rather than erased.
export function promoteVisitToVolunteer(personId: number, loggedBy: string | null = null): boolean {
  const result = db
    .prepare(
      `UPDATE visits SET is_volunteer = 1, logged_by = COALESCE(?, logged_by)
       WHERE person_id = ? AND visit_date = ? AND checked_out = 0 AND is_volunteer = 0`
    )
    .run(loggedBy, personId, todayISO())
  return result.changes === 1
}

export function changeVisitToVisitor(personId: number, loggedBy: string | null = null): boolean {
  const result = db
    .prepare(
      `UPDATE visits SET is_volunteer = 0, logged_by = COALESCE(?, logged_by)
       WHERE person_id = ? AND visit_date = ? AND checked_out = 0 AND is_volunteer = 1`
    )
    .run(loggedBy, personId, todayISO())
  return result.changes === 1
}

export function checkOutPersonToday(personId: number): boolean {
  const result = db
    .prepare(
      'UPDATE visits SET checked_out = 1 WHERE person_id = ? AND visit_date = ? AND checked_out = 0'
    )
    .run(personId, todayISO())
  return result.changes === 1
}

export function deleteVisitToday(personId: number): boolean {
  const result = db
    .prepare('DELETE FROM visits WHERE person_id = ? AND visit_date = ? AND checked_out = 0')
    .run(personId, todayISO())
  return result.changes === 1
}

export function getPerson(id: number): Person | undefined {
  return db.prepare('SELECT * FROM people WHERE id = ?').get(id) as Person | undefined
}

export function getStaff(): Person[] {
  return db
    .prepare('SELECT * FROM people WHERE is_staff = 1 ORDER BY first_name, last_name')
    .all() as Person[]
}

export function getSiteLeads(): Person[] {
  return db
    .prepare('SELECT * FROM people WHERE is_site_lead = 1 ORDER BY first_name, last_name')
    .all() as Person[]
}

function paramsFromInput(input: PersonInput) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    isStaff: input.isStaff ? 1 : 0,
    isSiteLead: input.isSiteLead ? 1 : 0,
    emailOptOut: input.emailOptOut ? 1 : 0,
    street1: input.street1,
    street2: input.street2,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    country: input.country,
    yearOfBirth: input.yearOfBirth,
    tags: input.tags,
  }
}

export function createPerson(input: PersonInput): number {
  const result = db
    .prepare(
      `INSERT INTO people (
         first_name, last_name, email, phone, is_staff, is_site_lead, email_opt_out,
         street1, street2, city, state, postal_code, country, year_of_birth, tags
       ) VALUES (
         @firstName, @lastName, @email, @phone, @isStaff, @isSiteLead, @emailOptOut,
         @street1, @street2, @city, @state, @postalCode, @country, @yearOfBirth, @tags
       )`
    )
    .run(paramsFromInput(input))
  return Number(result.lastInsertRowid)
}

export function updatePerson(id: number, input: PersonInput): void {
  db.prepare(
    `UPDATE people SET
       first_name = @firstName, last_name = @lastName, email = @email, phone = @phone,
       is_staff = @isStaff, is_site_lead = @isSiteLead, email_opt_out = @emailOptOut,
       street1 = @street1, street2 = @street2, city = @city, state = @state,
       postal_code = @postalCode, country = @country, year_of_birth = @yearOfBirth, tags = @tags
     WHERE id = @id`
  ).run({ ...paramsFromInput(input), id })
}

export function getVisitsForPerson(personId: number): Visit[] {
  return db
    .prepare('SELECT * FROM visits WHERE person_id = ? ORDER BY visit_date DESC')
    .all(personId) as Visit[]
}

export function checkIn(input: { personId: number; isVolunteer: boolean; loggedBy: string | null }): void {
  // MAX() so a plain re-check-in the same evening never downgrades an
  // already-logged volunteer session (which would silently erase 2.5 hours).
  db.prepare(
    `INSERT INTO visits (person_id, visit_date, is_volunteer, checked_out, logged_by)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT (person_id, visit_date) DO UPDATE SET
       is_volunteer = MAX(is_volunteer, excluded.is_volunteer),
       checked_out = 0,
       logged_by = excluded.logged_by`
  ).run(input.personId, todayISO(), input.isVolunteer ? 1 : 0, input.loggedBy)
}
