import test from 'node:test'
import assert from 'node:assert/strict'
import { todayISO, addDaysISO } from '../lib/dates'
import { createPerson, type PersonInput } from '../lib/people'
import { createMembership } from '../lib/memberships'
import { createFlag, resolveFlag, getActiveFlags } from '../lib/flags'
import {
  getLapseEmailQueue,
  recordLapseEmail,
  getRecentLapseEmails,
  renderLapseEmail,
  LAPSE_GRACE_DAYS,
} from '../lib/lapse-emails'
import { sendEmail } from '../lib/email'

async function makePerson(firstName: string, overrides: Partial<PersonInput> = {}): Promise<number> {
  const input: PersonInput = {
    firstName,
    lastName: 'LapseTest',
    email: `${firstName.toLowerCase()}@example.com`,
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
  return await createPerson(input)
}

async function lapsedMembership(personId: number, daysAgo: number) {
  await createMembership({
    personId,
    startDate: addDaysISO(todayISO(), -daysAgo - 365),
    endDate: addDaysISO(todayISO(), -daysAgo),
    loggedBy: null,
  })
}

const inQueue = async (id: number) => (await getLapseEmailQueue()).some((p) => p.id === id)

test('queues a person lapsed past the grace period, with the right details', async () => {
  const id = await makePerson('Due')
  await lapsedMembership(id, LAPSE_GRACE_DAYS + 10)
  const entry = (await getLapseEmailQueue()).find((p) => p.id === id)
  assert.ok(entry)
  assert.equal(entry.email, 'due@example.com')
  assert.equal(entry.latest_end_date, addDaysISO(todayISO(), -(LAPSE_GRACE_DAYS + 10)))
})

test('grace period: lapsed less than LAPSE_GRACE_DAYS ago is not queued yet', async () => {
  const id = await makePerson('TooSoon')
  await lapsedMembership(id, LAPSE_GRACE_DAYS - 2)
  assert.ok(!await inQueue(id))
})

test('lapsed exactly LAPSE_GRACE_DAYS ago is queued (boundary)', async () => {
  const id = await makePerson('Boundary')
  await lapsedMembership(id, LAPSE_GRACE_DAYS)
  assert.ok(await inQueue(id))
})

test('excludes: active members, no email, opted out', async () => {
  const activeId = await makePerson('Active')
  await createMembership({ personId: activeId, startDate: addDaysISO(todayISO(), -30), endDate: addDaysISO(todayISO(), 335), loggedBy: null })
  assert.ok(!await inQueue(activeId))

  const noEmailId = await makePerson('NoEmail', { email: null })
  await lapsedMembership(noEmailId, 60)
  assert.ok(!await inQueue(noEmailId))

  const optedOutId = await makePerson('OptedOut', { emailOptOut: true })
  await lapsedMembership(optedOutId, 60)
  assert.ok(!await inQueue(optedOutId))
})

test('active banned flag excludes; resolving it re-queues', async () => {
  const id = await makePerson('Banned')
  await lapsedMembership(id, 60)
  await createFlag({ personId: id, level: 'banned', note: 'test', loggedBy: null })
  assert.ok(!await inQueue(id))

  const flag = (await getActiveFlags(id)).find((f) => f.level === 'banned')!
  await resolveFlag(flag.id)
  assert.ok(await inQueue(id))
})

test('a watch flag does not block the email', async () => {
  const id = await makePerson('Watched')
  await lapsedMembership(id, 60)
  await createFlag({ personId: id, level: 'watch', note: 'test', loggedBy: null })
  assert.ok(await inQueue(id))
})

test('recording removes from queue; renew-then-lapse-again re-queues; UNIQUE backstop', async () => {
  const id = await makePerson('Cycle')
  const firstEnd = addDaysISO(todayISO(), -400)
  await createMembership({ personId: id, startDate: addDaysISO(todayISO(), -765), endDate: firstEnd, loggedBy: null })
  assert.ok(await inQueue(id))

  await recordLapseEmail({ personId: id, endDate: firstEnd, status: 'dry_run', loggedBy: 'Lead' })
  assert.ok(!await inQueue(id))
  await assert.rejects(() => recordLapseEmail({ personId: id, endDate: firstEnd, status: 'sent', loggedBy: null }))

  // Renewed after that lapse, then lapsed again — a new notice is due.
  const secondEnd = addDaysISO(todayISO(), -30)
  await createMembership({ personId: id, startDate: addDaysISO(todayISO(), -395), endDate: secondEnd, loggedBy: null })
  const entry = (await getLapseEmailQueue()).find((p) => p.id === id)
  assert.ok(entry)
  assert.equal(entry.latest_end_date, secondEnd)

  const log = await getRecentLapseEmails()
  const mine = log.find((e) => e.person_id === id)
  assert.ok(mine)
  assert.equal(mine.status, 'dry_run')
  assert.equal(mine.logged_by, 'Lead')
})

test('renderLapseEmail includes the name and expiry date', async () => {
  const { subject, text } = renderLapseEmail('Jane', '2026-01-15')
  assert.match(subject, /membership has expired/)
  assert.match(text, /Hi Jane,/)
  assert.match(text, /2026-01-15/)
})

test('clearSampleData removes sample people even after a lapse email was recorded', async () => {
  const { seedSampleData, clearSampleData } = await import('../lib/seed')
  await seedSampleData()
  const larry = (await getLapseEmailQueue()).find((p) => p.first_name === 'Sample Larry')
  assert.ok(larry, 'sample Larry should be queued')
  await recordLapseEmail({ personId: larry.id, endDate: larry.latest_end_date, status: 'dry_run', loggedBy: null })
  await assert.doesNotReject(() => clearSampleData())
  assert.ok(!(await getRecentLapseEmails()).some((e) => e.person_id === larry.id))
})

test('sendEmail dry-runs when no RESEND_API_KEY is set', async () => {
  assert.equal(process.env.RESEND_API_KEY, undefined)
  const result = await sendEmail({ to: 'x@example.com', subject: 's', text: 't' })
  assert.deepEqual(result, { ok: true, dryRun: true })
})
