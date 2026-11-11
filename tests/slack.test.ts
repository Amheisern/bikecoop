import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { db } from '../lib/db'
import { createPerson, type PersonInput } from '../lib/people'
import { createFlag } from '../lib/flags'
import { addDaysISO, todayISO } from '../lib/dates'
import { getSignupsForDate } from '../lib/shifts'
import {
  NOT_FOUND_REPLY,
  handleSignupTap,
  nightsToPost,
  postUpcomingNights,
  refreshNightPost,
  renderNightMessage,
  slackConfig,
  verifySlackSignature,
  type SlackConfig,
} from '../lib/slack'

// --- A fake Slack Web API -----------------------------------------------------

type Call = { method: string; body: Record<string, unknown> | null }
const calls: Call[] = []
const slackEmails: Record<string, string> = {}
let nextTs = 1
let slackDown = false

function json(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input))
  const method = url.pathname.split('/').pop() ?? ''
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null
  calls.push({ method, body })
  if (slackDown) return json({ ok: false, error: 'service_unavailable' })
  if (method === 'users.info') {
    const email = slackEmails[url.searchParams.get('user') ?? '']
    return json({ ok: true, user: { profile: email ? { email } : {} } })
  }
  if (method === 'chat.postMessage') return json({ ok: true, ts: `1700000000.${String(nextTs++).padStart(6, '0')}` })
  if (method === 'chat.update') return json({ ok: true })
  return json({ ok: false, error: 'unknown_method' })
}) as typeof fetch

const config: SlackConfig = { botToken: 'xoxb-test', signingSecret: 'test-secret', channelId: 'C123' }

function personInput(overrides: Partial<PersonInput> = {}): PersonInput {
  return {
    firstName: 'Slack',
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

const nights = nightsToPost(todayISO())

// --- Tests ----------------------------------------------------------------------

test('slackConfig needs all three settings', () => {
  assert.equal(slackConfig({ SLACK_BOT_TOKEN: 'x', SLACK_SIGNING_SECRET: 'y' }), null)
  assert.deepEqual(slackConfig({ SLACK_BOT_TOKEN: 'x', SLACK_SIGNING_SECRET: 'y', SLACK_CHANNEL_ID: 'C1' }), {
    botToken: 'x',
    signingSecret: 'y',
    channelId: 'C1',
  })
})

test('Slack signatures: valid passes; wrong secret, tampered body and old requests fail', () => {
  const now = 1_800_000_000
  const rawBody = 'payload=%7B%7D'
  const sign = (secret: string, ts: number, body: string) =>
    'v0=' + crypto.createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')
  const good = sign('test-secret', now, rawBody)
  const check = (signature: string, timestamp: string, body = rawBody) =>
    verifySlackSignature({ signingSecret: 'test-secret', timestamp, signature, rawBody: body, nowSeconds: now })

  assert.equal(check(good, String(now)), true)
  assert.equal(check(sign('other-secret', now, rawBody), String(now)), false)
  assert.equal(check(good, String(now), 'payload=%7B%22x%22%7D'), false)
  assert.equal(check(sign('test-secret', now - 600, rawBody), String(now - 600)), false)
  assert.equal(verifySlackSignature({ signingSecret: 'test-secret', timestamp: null, signature: good, rawBody }), false)
})

test('the weekly post covers the coming Mon, Tue and Thu', () => {
  // Sunday Nov 15, 2026.
  assert.deepEqual(nightsToPost('2026-11-15'), ['2026-11-16', '2026-11-17', '2026-11-19'])
  // Run on a Monday, tonight is included.
  assert.deepEqual(nightsToPost('2026-11-16'), ['2026-11-16', '2026-11-17', '2026-11-19'])
})

test('a night message lists each role with names (first name, last initial) or open', () => {
  const message = renderNightMessage('2026-11-16', [
    { role_id: 'shift_lead', first_name: 'Vera', last_name: 'Vance' },
    { role_id: 'greeter', first_name: 'Mia', last_name: 'Moss' },
    { role_id: 'greeter', first_name: 'Sam <b>', last_name: 'Stone' },
  ] as never)
  const blocks = message.blocks as { type: string; text?: { text: string }; accessory?: { value: string } }[]
  assert.equal(blocks[0].type, 'header')
  assert.match(blocks[0].text!.text, /Monday, Nov 16/)
  const sections = blocks.filter((block) => block.type === 'section')
  assert.equal(sections.length, 3)
  assert.equal(sections[0].text!.text, '*Shift lead*\nVera V.')
  assert.equal(sections[1].text!.text, '*Mechanic*\n_open_')
  assert.equal(sections[2].text!.text, '*Greeter / front desk*\nMia M., Sam &lt;b&gt; S.')
  assert.deepEqual(JSON.parse(sections[1].accessory!.value), { date: '2026-11-16', role: 'mechanic' })
})

test('posting is once per night: a second run posts nothing new', async () => {
  calls.length = 0
  const first = await postUpcomingNights(config)
  assert.deepEqual(first.posted, nights)
  assert.equal(calls.filter((call) => call.method === 'chat.postMessage').length, nights.length)
  const rows = await db.all<{ ts: string | null }>('SELECT ts FROM slack_posts')
  assert.ok(rows.every((row) => row.ts))

  calls.length = 0
  const second = await postUpcomingNights(config)
  assert.deepEqual(second.posted, [])
  assert.deepEqual(second.alreadyPosted, nights)
  assert.equal(calls.length, 0)
})

test('a failed post releases the night so the next run tries again', async () => {
  const sunday = '2026-12-06'
  slackDown = true
  await assert.rejects(() => postUpcomingNights(config, sunday))
  slackDown = false
  const retry = await postUpcomingNights(config, sunday)
  assert.deepEqual(retry.posted, ['2026-12-07', '2026-12-08', '2026-12-10'])
})

test('tap signs up, tap again cancels, and the night message is redrawn each time', async () => {
  const date = nights[0]
  const id = await createPerson(personInput({ firstName: 'Tapper', lastName: 'Toggle', email: 'Tapper@Example.com' }))
  slackEmails.U_TAPPER = 'tapper@example.com'

  calls.length = 0
  const signedUp = await handleSignupTap({ slackUserId: 'U_TAPPER', date, roleId: 'mechanic' }, config)
  assert.match(signedUp, /signed up as Mechanic/)
  const signup = (await getSignupsForDate(date)).find((row) => row.person_id === id)
  assert.equal(signup?.role_id, 'mechanic')
  assert.equal(signup?.source, 'slack')
  assert.equal(signup?.logged_by, 'Tapper Toggle (Slack)')
  const update = calls.find((call) => call.method === 'chat.update')
  assert.ok(update, 'the message is redrawn')
  assert.match(JSON.stringify(update.body), /Tapper T\./)

  calls.length = 0
  const cancelled = await handleSignupTap({ slackUserId: 'U_TAPPER', date, roleId: 'mechanic' }, config)
  assert.match(cancelled, /Cancelled/)
  assert.equal((await getSignupsForDate(date)).some((row) => row.person_id === id), false)
  assert.ok(calls.some((call) => call.method === 'chat.update'))
})

test('no matching email gets a private "see a shift lead" reply and no signup', async () => {
  slackEmails.U_STRANGER = 'stranger@example.com'
  const reply = await handleSignupTap({ slackUserId: 'U_STRANGER', date: nights[0], roleId: 'greeter' }, config)
  assert.equal(reply, NOT_FOUND_REPLY)
  // A Slack account with no email visible is treated the same way.
  const noEmail = await handleSignupTap({ slackUserId: 'U_NO_EMAIL', date: nights[0], roleId: 'greeter' }, config)
  assert.equal(noEmail, NOT_FOUND_REPLY)
})

test('the same rules as the Schedule page: Volunteer, Shift lead, banned, open nights', async () => {
  const date = nights[0]
  await createPerson(personInput({ firstName: 'Not', lastName: 'Volunteer', email: 'notvol@example.com', isStaff: false }))
  slackEmails.U_NOTVOL = 'notvol@example.com'
  assert.match(
    await handleSignupTap({ slackUserId: 'U_NOTVOL', date, roleId: 'greeter' }, config),
    /not marked as a Volunteer/
  )

  await createPerson(personInput({ firstName: 'Plain', lastName: 'Helper', email: 'plain@example.com' }))
  slackEmails.U_PLAIN = 'plain@example.com'
  assert.match(
    await handleSignupTap({ slackUserId: 'U_PLAIN', date, roleId: 'shift_lead' }, config),
    /Only people marked Shift lead/
  )

  const bannedId = await createPerson(personInput({ firstName: 'Banned', lastName: 'Helper', email: 'banned@example.com' }))
  await createFlag({ personId: bannedId, level: 'banned', note: 'test', loggedBy: null })
  slackEmails.U_BANNED = 'banned@example.com'
  const bannedReply = await handleSignupTap({ slackUserId: 'U_BANNED', date, roleId: 'greeter' }, config)
  assert.equal(bannedReply, 'Please talk to a shift lead before signing up.')
  assert.doesNotMatch(bannedReply, /banned/i)

  assert.match(
    await handleSignupTap({ slackUserId: 'U_PLAIN', date: addDaysISO(todayISO(), -7), roleId: 'greeter' }, config),
    /passed/
  )
})

test('a Slack outage while redrawing never breaks the app', async () => {
  slackDown = true
  await assert.doesNotReject(() => refreshNightPost(nights[0], config))
  slackDown = false
  // Nothing to redraw without settings.
  await assert.doesNotReject(() => refreshNightPost(nights[0], null))
})
