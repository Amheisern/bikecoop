import test from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../lib/db'
import { todayISO, addDaysISO } from '../lib/dates'
import { createPerson, type PersonInput } from '../lib/people'
import {
  getVolunteerHours,
  getFootTraffic,
  getCurrentMilestone,
  getAchievedMilestones,
  getCrossedMilestone,
  getVolunteerRoster,
  HOURS_PER_VOLUNTEER_VISIT,
} from '../lib/hours'
import { getRewardStatuses, redeemReward, REWARD_TIERS } from '../lib/rewards'

async function makePerson(firstName: string): Promise<number> {
  const input: PersonInput = {
    firstName,
    lastName: 'HoursTest',
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

async function backdatedVisit(personId: number, dayOffset: number, isVolunteer: boolean) {
  await db.run(
    'INSERT INTO visits (person_id, visit_date, is_volunteer) VALUES (?, ?, ?)',
    personId,
    addDaysISO(todayISO(), dayOffset),
    isVolunteer ? 1 : 0
  )
}

test('volunteer hours = volunteer visits × 2.5; foot traffic counts all visits', async () => {
  const id = await makePerson('Counter')
  await backdatedVisit(id, -1, true)
  await backdatedVisit(id, -2, true)
  await backdatedVisit(id, -3, false)
  assert.equal(await getVolunteerHours(id), 2 * HOURS_PER_VOLUNTEER_VISIT)
  assert.equal(await getFootTraffic(id), 3)
})

test('milestone helpers', async () => {
  assert.equal(getCurrentMilestone(0), null)
  assert.equal(getCurrentMilestone(5), 5)
  assert.equal(getCurrentMilestone(12.5), 10)
  assert.equal(getCurrentMilestone(600), 500)
  assert.equal(getCurrentMilestone(32.5), 30)
  assert.deepEqual(getAchievedMilestones(30), [5, 10, 20, 30])
  assert.equal(getCrossedMilestone(10, 12.5), null)
  assert.equal(getCrossedMilestone(2.5, 5), 5)
  assert.equal(getCrossedMilestone(0, 25), 20)
  assert.equal(getCrossedMilestone(27.5, 30), 30)
})

test('volunteer roster is sorted by hours descending and omits non-volunteers', async () => {
  const highId = await makePerson('RosterHigh')
  const lowId = await makePerson('RosterLow')
  const noneId = await makePerson('RosterNone')
  for (const offset of [-1, -2, -3]) await backdatedVisit(highId, offset, true)
  await backdatedVisit(lowId, -1, true)
  await backdatedVisit(noneId, -1, false)

  const roster = await getVolunteerRoster()
  const ids = roster.map((r) => r.id)
  assert.ok(ids.indexOf(highId) < ids.indexOf(lowId))
  assert.ok(!ids.includes(noneId))
  assert.equal(roster.find((r) => r.id === highId)?.hours, 3 * HOURS_PER_VOLUNTEER_VISIT)
})

test('reward tiers unlock by hours and record redemption exactly once', async () => {
  const id = await makePerson('Redeemer')
  const freeMembership = REWARD_TIERS[0]

  assert.ok((await getRewardStatuses(id, 0)).every((r) => r.status === 'locked'))

  const atTier = await getRewardStatuses(id, freeMembership.hours)
  assert.equal(atTier.find((r) => r.tier.id === freeMembership.id)?.status, 'available')

  await redeemReward({ personId: id, tierId: freeMembership.id, loggedBy: 'Lead' })
  const after = await getRewardStatuses(id, freeMembership.hours)
  assert.equal(after.find((r) => r.tier.id === freeMembership.id)?.status, 'redeemed')

  // UNIQUE(person_id, tier_id) backstops double-redemption at the DB layer.
  await assert.rejects(() => redeemReward({ personId: id, tierId: freeMembership.id, loggedBy: 'Lead' }))
})
