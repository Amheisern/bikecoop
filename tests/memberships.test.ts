import test from 'node:test'
import assert from 'node:assert/strict'
import { todayISO, addDaysISO } from '../lib/dates'
import { createPerson, type PersonInput } from '../lib/people'
import { createMembership, getMembershipStatus, getLapsedPeople } from '../lib/memberships'

async function makePerson(firstName: string): Promise<number> {
  const input: PersonInput = {
    firstName,
    lastName: 'MembershipTest',
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
  }
  return await createPerson(input)
}

test('membership status: none, active, lapsed', async () => {
  const noneId = await makePerson('None')
  assert.equal((await getMembershipStatus(noneId)).status, 'none')

  const activeId = await makePerson('Active')
  await createMembership({ personId: activeId, startDate: addDaysISO(todayISO(), -30), endDate: addDaysISO(todayISO(), 335), loggedBy: null })
  assert.equal((await getMembershipStatus(activeId)).status, 'active')

  const lapsedId = await makePerson('Lapsed')
  await createMembership({ personId: lapsedId, startDate: addDaysISO(todayISO(), -400), endDate: addDaysISO(todayISO(), -35), loggedBy: null })
  assert.equal((await getMembershipStatus(lapsedId)).status, 'lapsed')
})

test('a membership ending today is still active', async () => {
  const id = await makePerson('EdgeToday')
  await createMembership({ personId: id, startDate: addDaysISO(todayISO(), -365), endDate: todayISO(), loggedBy: null })
  assert.equal((await getMembershipStatus(id)).status, 'active')
})

test('renewal supersedes an expired membership', async () => {
  const id = await makePerson('Renewed')
  await createMembership({ personId: id, startDate: addDaysISO(todayISO(), -800), endDate: addDaysISO(todayISO(), -435), loggedBy: null })
  await createMembership({ personId: id, startDate: addDaysISO(todayISO(), -10), endDate: addDaysISO(todayISO(), 355), loggedBy: null })
  assert.equal((await getMembershipStatus(id)).status, 'active')
  assert.ok(!(await getLapsedPeople()).some((p) => p.id === id))
})

test('getLapsedPeople lists a lapsed person exactly once, even with duplicate end dates', async () => {
  const id = await makePerson('DupDates')
  const end = addDaysISO(todayISO(), -60)
  // Two membership rows sharing the same latest end_date (e.g. a double-click
  // on Record / Renew) must not produce two lapsed-list entries.
  await createMembership({ personId: id, startDate: addDaysISO(todayISO(), -425), endDate: end, loggedBy: null })
  await createMembership({ personId: id, startDate: addDaysISO(todayISO(), -425), endDate: end, loggedBy: null })
  const rows = (await getLapsedPeople()).filter((p) => p.id === id)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].latest_end_date, end)
})

test('active people never appear in the lapsed list', async () => {
  const id = await makePerson('StillActive')
  await createMembership({ personId: id, startDate: addDaysISO(todayISO(), -30), endDate: addDaysISO(todayISO(), 335), loggedBy: null })
  assert.ok(!(await getLapsedPeople()).some((p) => p.id === id))
})
