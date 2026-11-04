import test from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../lib/db'
import {
  createPerson,
  getPerson,
  getPeopleCheckedInToday,
  searchPeople,
  checkIn,
  promoteVisitToVolunteer,
  changeVisitToVisitor,
  checkOutPersonToday,
  deleteVisitToday,
  getVisitsForPerson,
  type PersonInput,
} from '../lib/people'
import { createFlag, resolveFlag, getTopFlagLevel } from '../lib/flags'
import { addDaysISO, todayISO } from '../lib/dates'

function personInput(overrides: Partial<PersonInput> = {}): PersonInput {
  return {
    firstName: 'Test',
    lastName: 'Person',
    email: null,
    phone: null,
    isStaff: false,
    isSiteLead: false,
    emailOptOut: false,
    street1: null,
    street2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    yearOfBirth: null,
    tags: null,
    ...overrides,
  }
}

test('createPerson / getPerson round-trip', () => {
  const id = createPerson(personInput({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', isStaff: true }))
  const person = getPerson(id)
  assert.ok(person)
  assert.equal(person.first_name, 'Ada')
  assert.equal(person.last_name, 'Lovelace')
  assert.equal(person.email, 'ada@example.com')
  assert.equal(person.is_staff, 1)
  assert.equal(person.is_site_lead, 0)
})

test('searchPeople returns nothing for an empty query', () => {
  createPerson(personInput({ firstName: 'Should', lastName: 'NotAppear' }))
  assert.deepEqual(searchPeople(''), [])
  assert.deepEqual(searchPeople('   '), [])
})

test('searchPeople matches partial full name and email', () => {
  const id = createPerson(personInput({ firstName: 'Grace', lastName: 'Hopper', email: 'grace@navy.mil' }))
  assert.ok(searchPeople('Grace Hop').some((p) => p.id === id))
  assert.ok(searchPeople('navy.mil').some((p) => p.id === id))
  assert.ok(!searchPeople('zzz-no-match').some((p) => p.id === id))
})

test('searchPeople returns at most 10 matches', () => {
  for (let index = 0; index < 12; index++) {
    createPerson(personInput({
      firstName: 'SearchCap',
      lastName: String(index).padStart(2, '0'),
    }))
  }

  const results = searchPeople('SearchCap')
  assert.equal(results.length, 10)
  assert.deepEqual(results.map((person) => person.last_name), [
    '00', '01', '02', '03', '04', '05', '06', '07', '08', '09',
  ])
})

test('searchPeople volunteersOnly returns only people marked Volunteer', () => {
  const volunteerId = createPerson(personInput({ firstName: 'TabSearch', lastName: 'Volunteer', isStaff: true }))
  const guestId = createPerson(personInput({ firstName: 'TabSearch', lastName: 'Guest' }))

  const everyone = searchPeople('TabSearch').map((person) => person.id)
  assert.ok(everyone.includes(volunteerId))
  assert.ok(everyone.includes(guestId))

  const volunteersOnly = searchPeople('TabSearch', { volunteersOnly: true }).map((person) => person.id)
  assert.deepEqual(volunteersOnly, [volunteerId])
})

test('searchPeople shiftLeadsOnly returns only volunteers marked Shift lead', () => {
  const leadId = createPerson(personInput({ firstName: 'LeadSearch', lastName: 'Lead', isStaff: true, isSiteLead: true }))
  createPerson(personInput({ firstName: 'LeadSearch', lastName: 'Volunteer', isStaff: true }))
  createPerson(personInput({ firstName: 'LeadSearch', lastName: 'Guest' }))
  assert.deepEqual(
    searchPeople('LeadSearch', { volunteersOnly: true, shiftLeadsOnly: true }).map((person) => person.id),
    [leadId]
  )
})

test('searchPeople volunteersOnly applies the limit after filtering', () => {
  // Non-volunteers sort first (last name "A…") and would fill the page if the
  // filter ran after the limit.
  for (let index = 0; index < 12; index++) {
    createPerson(personInput({ firstName: 'LimitFilter', lastName: `A${String(index).padStart(2, '0')}` }))
  }
  const volunteerId = createPerson(personInput({ firstName: 'LimitFilter', lastName: 'Zed', isStaff: true }))

  assert.deepEqual(
    searchPeople('LimitFilter', { volunteersOnly: true }).map((person) => person.id),
    [volunteerId]
  )
})

test('checkIn is one visit per person per day', () => {
  const id = createPerson(personInput())
  checkIn({ personId: id, isVolunteer: false, loggedBy: null })
  checkIn({ personId: id, isVolunteer: false, loggedBy: 'Lead' })
  const visits = getVisitsForPerson(id)
  assert.equal(visits.length, 1)
  assert.equal(visits[0].logged_by, 'Lead')
})

test('getPeopleCheckedInToday returns only people checked in today', () => {
  const currentVisitorId = createPerson(personInput({ firstName: 'Current', lastName: 'Visitor' }))
  const volunteerId = createPerson(personInput({ firstName: 'Current', lastName: 'Volunteer' }))
  const previousVisitorId = createPerson(personInput({ firstName: 'Previous', lastName: 'Visitor' }))
  checkIn({ personId: currentVisitorId, isVolunteer: false, loggedBy: null })
  checkIn({ personId: volunteerId, isVolunteer: true, loggedBy: null })
  db.prepare(
    'INSERT INTO visits (person_id, visit_date, is_volunteer) VALUES (?, ?, 0)'
  ).run(previousVisitorId, addDaysISO(todayISO(), -1))

  const checkedIn = getPeopleCheckedInToday()
  const currentTestVisitors = checkedIn.filter(
    (person) => person.id === currentVisitorId || person.id === volunteerId || person.id === previousVisitorId
  )
  assert.deepEqual(currentTestVisitors.map((person) => person.id), [currentVisitorId, volunteerId])
  assert.equal(currentTestVisitors.find((person) => person.id === currentVisitorId)?.is_volunteer_visit, 0)
  assert.equal(currentTestVisitors.find((person) => person.id === volunteerId)?.is_volunteer_visit, 1)
})

test('promoting a checked-in visitor records volunteer status only once', () => {
  const personId = createPerson(personInput())
  checkIn({ personId, isVolunteer: false, loggedBy: null })

  assert.equal(promoteVisitToVolunteer(personId), true)
  assert.equal(promoteVisitToVolunteer(personId), false)
  assert.equal(getPeopleCheckedInToday().find((person) => person.id === personId)?.is_volunteer_visit, 1)
})

test('promote and demote stamp the shift lead, keeping the original when none is selected', () => {
  const personId = createPerson(personInput())
  checkIn({ personId, isVolunteer: false, loggedBy: 'Front Desk' })

  assert.equal(promoteVisitToVolunteer(personId), true)
  assert.equal(getVisitsForPerson(personId)[0].logged_by, 'Front Desk')

  assert.equal(changeVisitToVisitor(personId, 'Lead Two'), true)
  assert.equal(getVisitsForPerson(personId)[0].logged_by, 'Lead Two')

  assert.equal(promoteVisitToVolunteer(personId, 'Lead Three'), true)
  assert.equal(getVisitsForPerson(personId)[0].logged_by, 'Lead Three')
})

test('the shift roster and search markers show the most serious active flag', () => {
  const bannedId = createPerson(personInput({ firstName: 'Flagged', lastName: 'Banned' }))
  const watchId = createPerson(personInput({ firstName: 'Flagged', lastName: 'Watch' }))
  const clearedId = createPerson(personInput({ firstName: 'Flagged', lastName: 'Cleared' }))
  // Watch is created first so the test fails if banned doesn't outrank it.
  createFlag({ personId: bannedId, level: 'watch', note: 'Watch note', loggedBy: null })
  createFlag({ personId: bannedId, level: 'banned', note: 'Banned note', loggedBy: null })
  createFlag({ personId: watchId, level: 'watch', note: 'Watch note', loggedBy: null })
  createFlag({ personId: clearedId, level: 'banned', note: 'Old ban', loggedBy: null })
  const clearedFlag = db.prepare('SELECT id FROM flags WHERE person_id = ?').get(clearedId) as { id: number }
  resolveFlag(clearedFlag.id)
  for (const personId of [bannedId, watchId, clearedId]) {
    checkIn({ personId, isVolunteer: false, loggedBy: null })
  }

  const roster = getPeopleCheckedInToday()
  const rosterLevel = (id: number) => roster.find((person) => person.id === id)?.flag_level
  assert.equal(rosterLevel(bannedId), 'banned')
  assert.equal(rosterLevel(watchId), 'watch')
  assert.equal(rosterLevel(clearedId), null)

  assert.equal(getTopFlagLevel(bannedId), 'banned')
  assert.equal(getTopFlagLevel(watchId), 'watch')
  assert.equal(getTopFlagLevel(clearedId), null)
})

test('changing a checked-in volunteer to a visitor removes volunteer credit', () => {
  const personId = createPerson(personInput())
  checkIn({ personId, isVolunteer: true, loggedBy: null })

  assert.equal(changeVisitToVisitor(personId), true)
  assert.equal(changeVisitToVisitor(personId), false)
  assert.equal(getPeopleCheckedInToday().find((person) => person.id === personId)?.is_volunteer_visit, 0)
  assert.equal(getVisitsForPerson(personId)[0].is_volunteer, 0)
})

test('checking someone out hides them from the roster but preserves their visit', () => {
  const personId = createPerson(personInput())
  checkIn({ personId, isVolunteer: true, loggedBy: null })

  assert.equal(checkOutPersonToday(personId), true)
  assert.equal(checkOutPersonToday(personId), false)
  assert.ok(!getPeopleCheckedInToday().some((person) => person.id === personId))
  assert.equal(getVisitsForPerson(personId)[0].is_volunteer, 1)
  assert.equal(getVisitsForPerson(personId)[0].checked_out, 1)
})

test('deleting a checked-in visit removes the visit record', () => {
  const personId = createPerson(personInput())
  checkIn({ personId, isVolunteer: false, loggedBy: null })

  assert.equal(deleteVisitToday(personId), true)
  assert.equal(deleteVisitToday(personId), false)
  assert.deepEqual(getVisitsForPerson(personId), [])
})

test('checking in someone who was checked out restores them to the roster', () => {
  const personId = createPerson(personInput())
  checkIn({ personId, isVolunteer: false, loggedBy: null })
  checkOutPersonToday(personId)
  checkIn({ personId, isVolunteer: false, loggedBy: null })

  assert.equal(getPeopleCheckedInToday().find((person) => person.id === personId)?.is_volunteer_visit, 0)
  assert.equal(getVisitsForPerson(personId)[0].checked_out, 0)
})

test('a plain re-check-in never downgrades a volunteer session', () => {
  const id = createPerson(personInput())
  checkIn({ personId: id, isVolunteer: true, loggedBy: null })
  checkIn({ personId: id, isVolunteer: false, loggedBy: null })
  const visits = getVisitsForPerson(id)
  assert.equal(visits.length, 1)
  assert.equal(visits[0].is_volunteer, 1)
})

test('a volunteer re-check-in upgrades a plain visit', () => {
  const id = createPerson(personInput())
  checkIn({ personId: id, isVolunteer: false, loggedBy: null })
  checkIn({ personId: id, isVolunteer: true, loggedBy: null })
  const visits = getVisitsForPerson(id)
  assert.equal(visits.length, 1)
  assert.equal(visits[0].is_volunteer, 1)
})

test('visits are stamped with the shop-timezone date, not the SQLite UTC default', () => {
  const id = createPerson(personInput())
  checkIn({ personId: id, isVolunteer: false, loggedBy: null })
  const visit = getVisitsForPerson(id)[0]
  const easternToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
  assert.equal(visit.visit_date, easternToday)
  // Sanity: the row really is in the shared test DB, not a stale connection.
  const row = db.prepare('SELECT COUNT(*) as c FROM visits WHERE person_id = ?').get(id) as { c: number }
  assert.equal(row.c, 1)
})
