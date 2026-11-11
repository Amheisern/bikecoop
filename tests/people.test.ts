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

test('createPerson / getPerson round-trip', async () => {
  const id = await createPerson(personInput({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', isStaff: true }))
  const person = await getPerson(id)
  assert.ok(person)
  assert.equal(person.first_name, 'Ada')
  assert.equal(person.last_name, 'Lovelace')
  assert.equal(person.email, 'ada@example.com')
  assert.equal(person.is_staff, 1)
  assert.equal(person.is_site_lead, 0)
})

test('searchPeople returns nothing for an empty query', async () => {
  await createPerson(personInput({ firstName: 'Should', lastName: 'NotAppear' }))
  assert.deepEqual(await searchPeople(''), [])
  assert.deepEqual(await searchPeople('   '), [])
})

test('searchPeople matches partial full name and email', async () => {
  const id = await createPerson(personInput({ firstName: 'Grace', lastName: 'Hopper', email: 'grace@navy.mil' }))
  assert.ok((await searchPeople('Grace Hop')).some((p) => p.id === id))
  assert.ok((await searchPeople('navy.mil')).some((p) => p.id === id))
  assert.ok(!(await searchPeople('zzz-no-match')).some((p) => p.id === id))
})

test('searchPeople returns at most 10 matches', async () => {
  for (let index = 0; index < 12; index++) {
    await createPerson(personInput({
      firstName: 'SearchCap',
      lastName: String(index).padStart(2, '0'),
    }))
  }

  const results = await searchPeople('SearchCap')
  assert.equal(results.length, 10)
  assert.deepEqual(results.map((person) => person.last_name), [
    '00', '01', '02', '03', '04', '05', '06', '07', '08', '09',
  ])
})

test('searchPeople volunteersOnly returns only people marked Volunteer', async () => {
  const volunteerId = await createPerson(personInput({ firstName: 'TabSearch', lastName: 'Volunteer', isStaff: true }))
  const guestId = await createPerson(personInput({ firstName: 'TabSearch', lastName: 'Guest' }))

  const everyone = (await searchPeople('TabSearch')).map((person) => person.id)
  assert.ok(everyone.includes(volunteerId))
  assert.ok(everyone.includes(guestId))

  const volunteersOnly = (await searchPeople('TabSearch', { volunteersOnly: true })).map((person) => person.id)
  assert.deepEqual(volunteersOnly, [volunteerId])
})

test('searchPeople shiftLeadsOnly returns only volunteers marked Shift lead', async () => {
  const leadId = await createPerson(personInput({ firstName: 'LeadSearch', lastName: 'Lead', isStaff: true, isSiteLead: true }))
  await createPerson(personInput({ firstName: 'LeadSearch', lastName: 'Volunteer', isStaff: true }))
  await createPerson(personInput({ firstName: 'LeadSearch', lastName: 'Guest' }))
  assert.deepEqual(
    (await searchPeople('LeadSearch', { volunteersOnly: true, shiftLeadsOnly: true })).map((person) => person.id),
    [leadId]
  )
})

test('searchPeople volunteersOnly applies the limit after filtering', async () => {
  // Non-volunteers sort first (last name "A…") and would fill the page if the
  // filter ran after the limit.
  for (let index = 0; index < 12; index++) {
    await createPerson(personInput({ firstName: 'LimitFilter', lastName: `A${String(index).padStart(2, '0')}` }))
  }
  const volunteerId = await createPerson(personInput({ firstName: 'LimitFilter', lastName: 'Zed', isStaff: true }))

  assert.deepEqual(
    (await searchPeople('LimitFilter', { volunteersOnly: true })).map((person) => person.id),
    [volunteerId]
  )
})

test('checkIn is one visit per person per day', async () => {
  const id = await createPerson(personInput())
  await checkIn({ personId: id, isVolunteer: false, loggedBy: null })
  await checkIn({ personId: id, isVolunteer: false, loggedBy: 'Lead' })
  const visits = await getVisitsForPerson(id)
  assert.equal(visits.length, 1)
  assert.equal(visits[0].logged_by, 'Lead')
})

test('getPeopleCheckedInToday returns only people checked in today', async () => {
  const currentVisitorId = await createPerson(personInput({ firstName: 'Current', lastName: 'Visitor' }))
  const volunteerId = await createPerson(personInput({ firstName: 'Current', lastName: 'Volunteer' }))
  const previousVisitorId = await createPerson(personInput({ firstName: 'Previous', lastName: 'Visitor' }))
  await checkIn({ personId: currentVisitorId, isVolunteer: false, loggedBy: null })
  await checkIn({ personId: volunteerId, isVolunteer: true, loggedBy: null })
  await db.run(
    'INSERT INTO visits (person_id, visit_date, is_volunteer) VALUES (?, ?, 0)',
    previousVisitorId,
    addDaysISO(todayISO(), -1)
  )

  const checkedIn = await getPeopleCheckedInToday()
  const currentTestVisitors = checkedIn.filter(
    (person) => person.id === currentVisitorId || person.id === volunteerId || person.id === previousVisitorId
  )
  assert.deepEqual(currentTestVisitors.map((person) => person.id), [currentVisitorId, volunteerId])
  assert.equal(currentTestVisitors.find((person) => person.id === currentVisitorId)?.is_volunteer_visit, 0)
  assert.equal(currentTestVisitors.find((person) => person.id === volunteerId)?.is_volunteer_visit, 1)
})

test('promoting a checked-in visitor records volunteer status only once', async () => {
  const personId = await createPerson(personInput())
  await checkIn({ personId, isVolunteer: false, loggedBy: null })

  assert.equal(await promoteVisitToVolunteer(personId), true)
  assert.equal(await promoteVisitToVolunteer(personId), false)
  assert.equal((await getPeopleCheckedInToday()).find((person) => person.id === personId)?.is_volunteer_visit, 1)
})

test('promote and demote stamp the shift lead, keeping the original when none is selected', async () => {
  const personId = await createPerson(personInput())
  await checkIn({ personId, isVolunteer: false, loggedBy: 'Front Desk' })

  assert.equal(await promoteVisitToVolunteer(personId), true)
  assert.equal((await getVisitsForPerson(personId))[0].logged_by, 'Front Desk')

  assert.equal(await changeVisitToVisitor(personId, 'Lead Two'), true)
  assert.equal((await getVisitsForPerson(personId))[0].logged_by, 'Lead Two')

  assert.equal(await promoteVisitToVolunteer(personId, 'Lead Three'), true)
  assert.equal((await getVisitsForPerson(personId))[0].logged_by, 'Lead Three')
})

test('the shift roster and search markers show the most serious active flag', async () => {
  const bannedId = await createPerson(personInput({ firstName: 'Flagged', lastName: 'Banned' }))
  const watchId = await createPerson(personInput({ firstName: 'Flagged', lastName: 'Watch' }))
  const clearedId = await createPerson(personInput({ firstName: 'Flagged', lastName: 'Cleared' }))
  // Watch is created first so the test fails if banned doesn't outrank it.
  await createFlag({ personId: bannedId, level: 'watch', note: 'Watch note', loggedBy: null })
  await createFlag({ personId: bannedId, level: 'banned', note: 'Banned note', loggedBy: null })
  await createFlag({ personId: watchId, level: 'watch', note: 'Watch note', loggedBy: null })
  await createFlag({ personId: clearedId, level: 'banned', note: 'Old ban', loggedBy: null })
  const clearedFlag = (await db.get<{ id: number }>('SELECT id FROM flags WHERE person_id = ?', clearedId))!
  await resolveFlag(clearedFlag.id)
  for (const personId of [bannedId, watchId, clearedId]) {
    await checkIn({ personId, isVolunteer: false, loggedBy: null })
  }

  const roster = await getPeopleCheckedInToday()
  const rosterLevel = (id: number) => roster.find((person) => person.id === id)?.flag_level
  assert.equal(rosterLevel(bannedId), 'banned')
  assert.equal(rosterLevel(watchId), 'watch')
  assert.equal(rosterLevel(clearedId), null)

  assert.equal(await getTopFlagLevel(bannedId), 'banned')
  assert.equal(await getTopFlagLevel(watchId), 'watch')
  assert.equal(await getTopFlagLevel(clearedId), null)
})

test('changing a checked-in volunteer to a visitor removes volunteer credit', async () => {
  const personId = await createPerson(personInput())
  await checkIn({ personId, isVolunteer: true, loggedBy: null })

  assert.equal(await changeVisitToVisitor(personId), true)
  assert.equal(await changeVisitToVisitor(personId), false)
  assert.equal((await getPeopleCheckedInToday()).find((person) => person.id === personId)?.is_volunteer_visit, 0)
  assert.equal((await getVisitsForPerson(personId))[0].is_volunteer, 0)
})

test('checking someone out hides them from the roster but preserves their visit', async () => {
  const personId = await createPerson(personInput())
  await checkIn({ personId, isVolunteer: true, loggedBy: null })

  assert.equal(await checkOutPersonToday(personId), true)
  assert.equal(await checkOutPersonToday(personId), false)
  assert.ok(!(await getPeopleCheckedInToday()).some((person) => person.id === personId))
  assert.equal((await getVisitsForPerson(personId))[0].is_volunteer, 1)
  assert.equal((await getVisitsForPerson(personId))[0].checked_out, 1)
})

test('deleting a checked-in visit removes the visit record', async () => {
  const personId = await createPerson(personInput())
  await checkIn({ personId, isVolunteer: false, loggedBy: null })

  assert.equal(await deleteVisitToday(personId), true)
  assert.equal(await deleteVisitToday(personId), false)
  assert.deepEqual(await getVisitsForPerson(personId), [])
})

test('checking in someone who was checked out restores them to the roster', async () => {
  const personId = await createPerson(personInput())
  await checkIn({ personId, isVolunteer: false, loggedBy: null })
  await checkOutPersonToday(personId)
  await checkIn({ personId, isVolunteer: false, loggedBy: null })

  assert.equal((await getPeopleCheckedInToday()).find((person) => person.id === personId)?.is_volunteer_visit, 0)
  assert.equal((await getVisitsForPerson(personId))[0].checked_out, 0)
})

test('a plain re-check-in never downgrades a volunteer session', async () => {
  const id = await createPerson(personInput())
  await checkIn({ personId: id, isVolunteer: true, loggedBy: null })
  await checkIn({ personId: id, isVolunteer: false, loggedBy: null })
  const visits = await getVisitsForPerson(id)
  assert.equal(visits.length, 1)
  assert.equal(visits[0].is_volunteer, 1)
})

test('a volunteer re-check-in upgrades a plain visit', async () => {
  const id = await createPerson(personInput())
  await checkIn({ personId: id, isVolunteer: false, loggedBy: null })
  await checkIn({ personId: id, isVolunteer: true, loggedBy: null })
  const visits = await getVisitsForPerson(id)
  assert.equal(visits.length, 1)
  assert.equal(visits[0].is_volunteer, 1)
})

test('visits are stamped with the shop-timezone date, not the SQLite UTC default', async () => {
  const id = await createPerson(personInput())
  await checkIn({ personId: id, isVolunteer: false, loggedBy: null })
  const visit = (await getVisitsForPerson(id))[0]
  const easternToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
  assert.equal(visit.visit_date, easternToday)
  // Sanity: the row really is in the shared test DB, not a stale connection.
  const row = (await db.get<{ c: number }>('SELECT COUNT(*) as c FROM visits WHERE person_id = ?', id))!
  assert.equal(row.c, 1)
})
