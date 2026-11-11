import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { addDaysISO, todayISO } from '@/lib/dates'
import { getTopFlagLevel } from '@/lib/flags'
import type { Person } from '@/lib/people'
import {
  SHIFT_HOURS,
  SHIFT_ROLES,
  cancelSignup,
  formatShiftDate,
  getShiftRole,
  getSignupsForDate,
  isOpenShiftDate,
  signUpForShift,
  upcomingShiftDates,
  type ShiftSignup,
} from '@/lib/shifts'

// Slack shift signup (docs/volunteer-shifts-plan.md, Phase 3). Every week the
// bot posts one message per shift night in the signups channel; each role has
// a Sign up button. Tapping signs the tapper up (matched to a person by their
// Slack email), tapping again cancels, and the message is redrawn from the
// database so everyone sees the current names. Plain fetch, no Slack SDK, like
// lib/email.ts. All signup rules live in signUpForShift(), shared with the
// Schedule page.

export type SlackConfig = { botToken: string; signingSecret: string; channelId: string }

// null until all three are set on Render; the Slack routes then answer 503 and
// the Schedule page skips updating Slack.
export function slackConfig(env: Record<string, string | undefined> = process.env): SlackConfig | null {
  const botToken = env.SLACK_BOT_TOKEN
  const signingSecret = env.SLACK_SIGNING_SECRET
  const channelId = env.SLACK_CHANNEL_ID
  if (!botToken || !signingSecret || !channelId) return null
  return { botToken, signingSecret, channelId }
}

// Overridable only so local tests can point at a fake Slack.
function slackApiBase(): string {
  return process.env.SLACK_API_BASE || 'https://slack.com/api'
}

// --- Request verification -------------------------------------------------

// Slack signs every request it sends: v0=HMAC-SHA256(secret, "v0:<ts>:<body>").
// Requests older than five minutes are refused so a captured one can't be
// replayed later. https://api.slack.com/authentication/verifying-requests-from-slack
export function verifySlackSignature(input: {
  signingSecret: string
  timestamp: string | null
  signature: string | null
  rawBody: string
  nowSeconds?: number
}): boolean {
  const { signingSecret, timestamp, signature, rawBody } = input
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(timestamp)) > 60 * 5) return false
  const expected =
    'v0=' + crypto.createHmac('sha256', signingSecret).update(`v0:${timestamp}:${rawBody}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// --- Message layout ---------------------------------------------------------

export const TOGGLE_ACTION_ID = 'toggle_signup'

function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// "Vera V." in a shared channel: enough to recognize each other.
function shortName(signup: Pick<ShiftSignup, 'first_name' | 'last_name'>): string {
  const initial = signup.last_name.trim().charAt(0)
  return initial ? `${signup.first_name} ${initial}.` : signup.first_name
}

export function renderNightMessage(dateISO: string, signups: ShiftSignup[]) {
  const title = `${formatShiftDate(dateISO)}, ${SHIFT_HOURS}`
  const blocks: unknown[] = [{ type: 'header', text: { type: 'plain_text', text: title } }]
  for (const role of SHIFT_ROLES) {
    const names = signups.filter((signup) => signup.role_id === role.id).map(shortName)
    const who = names.length > 0 ? escapeMrkdwn(names.join(', ')) : '_open_'
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${role.label}*\n${who}` },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Sign up' },
        action_id: TOGGLE_ACTION_ID,
        value: JSON.stringify({ date: dateISO, role: role.id }),
      },
    })
  }
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: 'Tap *Sign up* to take a role, tap it again to cancel. Shift lead is for people marked Shift lead in the shop app.',
      },
    ],
  })
  return { text: `Volunteer shifts: ${title}`, blocks }
}

// --- Slack Web API ----------------------------------------------------------

type SlackResponse = { ok: boolean; error?: string; [key: string]: unknown }

async function slackPost(method: string, body: Record<string, unknown>, config: SlackConfig): Promise<SlackResponse> {
  const response = await fetch(`${slackApiBase()}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })
  const data = (await response.json()) as SlackResponse
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error ?? response.status}`)
  return data
}

// users.info is a read method: query string, not a JSON body.
async function slackUserEmail(userId: string, config: SlackConfig): Promise<string | null> {
  const response = await fetch(`${slackApiBase()}/users.info?user=${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${config.botToken}` },
  })
  const data = (await response.json()) as SlackResponse & { user?: { profile?: { email?: string } } }
  if (!data.ok) throw new Error(`Slack users.info failed: ${data.error ?? response.status}`)
  return data.user?.profile?.email ?? null
}

// A private reply only the tapper sees, through the response_url Slack sent
// with the tap.
export async function replyPrivately(responseUrl: string, text: string): Promise<void> {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ response_type: 'ephemeral', replace_original: false, text }),
  })
}

// --- Posting and refreshing night messages ----------------------------------

type SlackPost = { shift_date: string; channel: string; ts: string | null }

function getSlackPost(dateISO: string): Promise<SlackPost | undefined> {
  return db.get<SlackPost>('SELECT shift_date, channel, ts FROM slack_posts WHERE shift_date = ?', dateISO)
}

// Shift nights from today through the next six days: run on a Sunday, that's
// the coming Mon, Tue and Thu.
export function nightsToPost(fromISO: string = todayISO()): string[] {
  const lastDay = addDaysISO(fromISO, 6)
  return upcomingShiftDates(fromISO).filter((date) => date <= lastDay)
}

// Posts each night in the coming week that hasn't been posted yet. Safe to run
// any number of times (the weekly cron, a retry, or by hand): a night is
// claimed in slack_posts before posting, so it is never posted twice.
export async function postUpcomingNights(
  config: SlackConfig,
  fromISO: string = todayISO()
): Promise<{ posted: string[]; alreadyPosted: string[] }> {
  const posted: string[] = []
  const alreadyPosted: string[] = []
  for (const date of nightsToPost(fromISO)) {
    const claim = await db.run(
      'INSERT INTO slack_posts (shift_date, channel) VALUES (?, ?) ON CONFLICT (shift_date) DO NOTHING',
      date,
      config.channelId
    )
    if (claim.changes === 0) {
      alreadyPosted.push(date)
      continue
    }
    try {
      const message = renderNightMessage(date, await getSignupsForDate(date))
      const result = await slackPost('chat.postMessage', { channel: config.channelId, ...message }, config)
      await db.run('UPDATE slack_posts SET ts = ? WHERE shift_date = ?', String(result.ts), date)
      posted.push(date)
    } catch (error) {
      // Release the claim so the next run tries this night again.
      await db.run('DELETE FROM slack_posts WHERE shift_date = ? AND ts IS NULL', date)
      throw error
    }
  }
  return { posted, alreadyPosted }
}

// Redraws a night's message from the database, if it was posted. Called after
// any signup change, from Slack or the Schedule page. Never throws: Slack being
// down must not break the app.
export async function refreshNightPost(dateISO: string, config: SlackConfig | null = slackConfig()): Promise<void> {
  if (!config) return
  try {
    const post = await getSlackPost(dateISO)
    if (!post?.ts) return
    const message = renderNightMessage(dateISO, await getSignupsForDate(dateISO))
    await slackPost('chat.update', { channel: post.channel, ts: post.ts, ...message }, config)
  } catch (error) {
    console.error(`[slack] couldn't update the post for ${dateISO}`, error)
  }
}

// --- A tap on a Sign up button ----------------------------------------------

// The person a Slack account belongs to: matched by email, case-insensitive.
// If several people share the email, someone marked Volunteer wins.
async function findPersonByEmail(email: string): Promise<Person | undefined> {
  return db.get<Person>(
    'SELECT * FROM people WHERE lower(email) = lower(?) ORDER BY is_staff DESC, id LIMIT 1',
    email.trim()
  )
}

export const NOT_FOUND_REPLY =
  "I couldn't find you in the shop app. Ask a shift lead to add your Slack email to your profile and mark you as a Volunteer."

// Signs the tapper up for the role, or cancels if they already have it, then
// redraws the night's message. Returns the private reply for the tapper.
export async function handleSignupTap(
  input: { slackUserId: string; date: string; roleId: string },
  config: SlackConfig
): Promise<string> {
  const role = getShiftRole(input.roleId)
  if (!role) return 'That button is out of date. Look for the newest post.'
  if (!isOpenShiftDate(input.date)) return 'That night has passed or is not open for signups yet.'
  const when = formatShiftDate(input.date)

  const email = await slackUserEmail(input.slackUserId, config)
  const person = email ? await findPersonByEmail(email) : undefined
  if (!person) return NOT_FOUND_REPLY

  const existing = await db.get<{ id: number }>(
    'SELECT id FROM shift_signups WHERE person_id = ? AND shift_date = ? AND role_id = ?',
    person.id,
    input.date,
    role.id
  )
  if (existing) {
    await cancelSignup(existing.id)
    await refreshNightPost(input.date, config)
    return `Cancelled: you're no longer ${role.label} on ${when}.`
  }

  // Friendlier versions of signUpForShift's front-desk wording, for the
  // person themselves. Banned people get no detail in Slack.
  if (person.is_staff !== 1) {
    return "You're not marked as a Volunteer in the shop app yet. Ask a shift lead to mark you, then try again."
  }
  if ((await getTopFlagLevel(person.id)) === 'banned') {
    return 'Please talk to a shift lead before signing up.'
  }

  const result = await signUpForShift({
    personId: person.id,
    shiftDate: input.date,
    roleId: role.id,
    loggedBy: `${person.first_name} ${person.last_name} (Slack)`,
    source: 'slack',
  })
  if (!result.ok) return result.error
  await refreshNightPost(input.date, config)
  return `You're signed up as ${role.label} on ${when}, ${SHIFT_HOURS}. Tap Sign up again to cancel.`
}
