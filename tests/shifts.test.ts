import test from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../lib/db'
import { createPerson, checkIn, type PersonInput } from '../lib/people'
import { createFlag } from '../lib/flags'
import { addDaysISO, todayISO } from '../lib/dates'
import {
  SHIFT_NIGHTS,
  SIGNUP_WEEKS_AHEAD,
  cancelSignup,
  getExpectedVolunteers,
  getSignupsForDate,
  signUpForShift,
  upcomingShiftDates,
} from '../lib/shifts'

function personInput(overrides: Partial<PersonInput> = {}): PersonInput {
  return {
    firstName: 'Shift',
    lastName: 'Tester',
    email: null,
    phone: null,
    isStaff: true,
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

function weekday(dateISO: string): number {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay()
}

// Each test gets its own shift night so their signups never collide.
const openDates = upcomingShiftDates()
let nextDateIndex = 0
function freshShiftDate(): string {
  // Twelve open nights; reuse from the end if there are more tests than that.
  return openDates[nextDateIndex++ % openDates.length]
}

async function signUp(personId: number, shiftDate: string, roleId: string) {
  return await signUpForShift({ personId, shiftDate, roleId, loggedBy: 'Test Lead' })
}

test('upcomingShiftDates lists only Mon, Tue and Thu for four weeks, from today', async () => {
  // Monday Nov 2, 2026.
  assert.deepEqual(upcomingShiftDates('2026-11-02'), [
    '2026-11-02', '2026-11-03', '2026-11-05',
    '2026-11-09', '2026-11-10', '2026-11-12',
    '2026-11-16', '2026-11-17', '2026-11-19',
    '2026-11-23', '2026-11-24', '2026-11-26',
  ])
  // Starting on a Wednesday skips to Thursday, and the window still ends
  // 4 weeks out (Tue Dec 1 is day 28 from Wed Nov 4, so it's included).
  const fromWednesday = upcomingShiftDates('2026-11-04')
  assert.equal(fromWednesday[0], '2026-11-05')
  assert.equal(fromWednesday.at(-1), '2026-12-01')
  assert.ok(fromWednesday.every((date) => SHIFT_NIGHTS.includes(weekday(date))))
})

test('signing up for a role adds it to that night', async () => {
  const date = freshShiftDate()
  const id = await createPerson(personInput({ firstName: 'Mech', lastName: 'One' }))
  assert.deepEqual(await signUp(id, date, 'mechanic'), { ok: true })
  const signups = (await getSignupsForDate(date)).filter((signup) => signup.person_id === id)
  assert.equal(signups.length, 1)
  assert.equal(signups[0].role_id, 'mechanic')
  assert.equal(signups[0].source, 'app')
  assert.equal(signups[0].logged_by, 'Test Lead')
})

test('only people marked Volunteer can sign up', async () => {
  const date = freshShiftDate()
  const id = await createPerson(personInput({ firstName: 'Not', lastName: 'Volunteer', isStaff: false }))
  const result = await signUp(id, date, 'mechanic')
  assert.equal(result.ok, false)
})

test('the shift lead slot takes only people marked Shift lead, and only one per night', async () => {
  const date = freshShiftDate()
  const plainVolunteer = await createPerson(personInput({ firstName: 'Plain', lastName: 'Volunteer' }))
  const leadA = await createPerson(personInput({ firstName: 'Lead', lastName: 'A', isSiteLead: true }))
  const leadB = await createPerson(personInput({ firstName: 'Lead', lastName: 'B', isSiteLead: true }))

  assert.equal((await signUp(plainVolunteer, date, 'shift_lead')).ok, false)
  assert.deepEqual(await signUp(leadA, date, 'shift_lead'), { ok: true })
  const second = await signUp(leadB, date, 'shift_lead')
  assert.equal(second.ok, false)
  assert.equal((await getSignupsForDate(date)).filter((signup) => signup.role_id === 'shift_lead').length, 1)
})

test('mechanic and greeter have no cap', async () => {
  const date = freshShiftDate()
  for (let index = 0; index < 5; index++) {
    const id = await createPerson(personInput({ firstName: 'Many', lastName: `Mech${index}` }))
    assert.deepEqual(await signUp(id, date, 'mechanic'), { ok: true })
    assert.deepEqual(await signUp(id, date, 'greeter'), { ok: true })
  }
  const signups = await getSignupsForDate(date)
  assert.equal(signups.filter((signup) => signup.role_id === 'mechanic').length, 5)
  assert.equal(signups.filter((signup) => signup.role_id === 'greeter').length, 5)
})

test('one person can hold two roles on a night, but not the same role twice', async () => {
  const date = freshShiftDate()
  const id = await createPerson(personInput({ firstName: 'Two', lastName: 'Roles', isSiteLead: true }))
  assert.deepEqual(await signUp(id, date, 'shift_lead'), { ok: true })
  assert.deepEqual(await signUp(id, date, 'mechanic'), { ok: true })
  assert.equal((await signUp(id, date, 'mechanic')).ok, false)
  assert.equal((await getSignupsForDate(date)).filter((signup) => signup.person_id === id).length, 2)
})

test('signups are refused for past nights, non-shift nights, nights past the window, and unknown roles', async () => {
  const id = await createPerson(personInput({ firstName: 'Date', lastName: 'Rules' }))
  const today = todayISO()

  let pastShiftNight = addDaysISO(today, -1)
  while (!SHIFT_NIGHTS.includes(weekday(pastShiftNight))) pastShiftNight = addDaysISO(pastShiftNight, -1)
  assert.equal((await signUp(id, pastShiftNight, 'mechanic')).ok, false)

  let offNight = today
  while (SHIFT_NIGHTS.includes(weekday(offNight))) offNight = addDaysISO(offNight, 1)
  assert.equal((await signUp(id, offNight, 'mechanic')).ok, false)

  let beyondWindow = addDaysISO(today, SIGNUP_WEEKS_AHEAD * 7)
  while (!SHIFT_NIGHTS.includes(weekday(beyondWindow))) beyondWindow = addDaysISO(beyondWindow, 1)
  assert.equal((await signUp(id, beyondWindow, 'mechanic')).ok, false)

  assert.equal((await signUp(id, freshShiftDate(), 'bouncer')).ok, false)
})

test('banned volunteers cannot be signed up', async () => {
  const date = freshShiftDate()
  const id = await createPerson(personInput({ firstName: 'Banned', lastName: 'Volunteer' }))
  await createFlag({ personId: id, level: 'banned', note: 'test', loggedBy: null })
  assert.equal((await signUp(id, date, 'mechanic')).ok, false)
})

test('cancelling deletes the signup', async () => {
  const date = freshShiftDate()
  const id = await createPerson(personInput({ firstName: 'Cancel', lastName: 'Me' }))
  await signUp(id, date, 'greeter')
  const signup = (await getSignupsForDate(date)).find((row) => row.person_id === id)
  assert.ok(signup)
  assert.equal(await cancelSignup(signup.id), true)
  assert.equal((await getSignupsForDate(date)).some((row) => row.person_id === id), false)
  assert.equal(await cancelSignup(signup.id), false)
})

test('expected volunteers: signed up tonight and not yet checked in as a volunteer', async () => {
  // Tonight may not be a shift night when tests run, so insert directly
  // rather than through signUpForShift's date rules.
  const today = todayISO()
  const insert = (personId: number, date: string, roleId: string) =>
    db.run('INSERT INTO shift_signups (person_id, shift_date, role_id) VALUES (?, ?, ?)', personId, date, roleId)

  const notHereYet = await createPerson(personInput({ firstName: 'Expected', lastName: 'NotHere', isSiteLead: true }))
  await insert(notHereYet, today, 'mechanic')
  await insert(notHereYet, today, 'shift_lead')

  const hereAsGuest = await createPerson(personInput({ firstName: 'Expected', lastName: 'Guest' }))
  await insert(hereAsGuest, today, 'greeter')
  await checkIn({ personId: hereAsGuest, isVolunteer: false, loggedBy: null })

  const hereAsVolunteer = await createPerson(personInput({ firstName: 'Expected', lastName: 'Arrived' }))
  await insert(hereAsVolunteer, today, 'greeter')
  await checkIn({ personId: hereAsVolunteer, isVolunteer: true, loggedBy: null })

  const otherNight = await createPerson(personInput({ firstName: 'Expected', lastName: 'Tomorrow' }))
  await insert(otherNight, addDaysISO(today, 1), 'greeter')

  const expected = (await getExpectedVolunteers()).filter((entry) =>
    [notHereYet, hereAsGuest, hereAsVolunteer, otherNight].includes(entry.person_id)
  )
  assert.deepEqual(
    expected.map((entry) => entry.person_id).sort(),
    [notHereYet, hereAsGuest].sort()
  )
  const notHere = expected.find((entry) => entry.person_id === notHereYet)
  assert.deepEqual(notHere?.role_ids, ['shift_lead', 'mechanic'])
  assert.equal(notHere?.checked_in_as_guest, false)
  assert.equal(expected.find((entry) => entry.person_id === hereAsGuest)?.checked_in_as_guest, true)
})
