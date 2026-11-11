import { after } from 'next/server'
import { TOGGLE_ACTION_ID, handleSignupTap, replyPrivately, slackConfig, verifySlackSignature } from '@/lib/slack'

// Slack calls this when someone taps a Sign up button. Slack needs an answer
// within 3 seconds, so this checks the signature, answers 200 right away, and
// does the signup (a Slack lookup, the database, a message redraw) after the
// response is sent, then replies privately to the tapper.
// Public route (proxy.ts lets /api/slack/ through); the signature is the check.
export async function POST(request: Request) {
  const config = slackConfig()
  if (!config) return new Response('Slack is not set up', { status: 503 })

  const rawBody = await request.text()
  const verified = verifySlackSignature({
    signingSecret: config.signingSecret,
    timestamp: request.headers.get('x-slack-request-timestamp'),
    signature: request.headers.get('x-slack-signature'),
    rawBody,
  })
  if (!verified) return new Response('Bad signature', { status: 401 })

  let payload: {
    type?: string
    user?: { id?: string }
    response_url?: string
    actions?: { action_id?: string; value?: string }[]
  }
  try {
    payload = JSON.parse(new URLSearchParams(rawBody).get('payload') ?? '{}')
  } catch {
    return new Response('Bad payload', { status: 400 })
  }

  const action = payload.actions?.[0]
  const userId = payload.user?.id
  const responseUrl = payload.response_url
  if (payload.type !== 'block_actions' || action?.action_id !== TOGGLE_ACTION_ID || !userId || !responseUrl) {
    return new Response(null, { status: 200 })
  }

  let target: { date?: unknown; role?: unknown }
  try {
    target = JSON.parse(action.value ?? '{}')
  } catch {
    target = {}
  }

  after(async () => {
    let reply: string
    try {
      reply = await handleSignupTap(
        { slackUserId: userId, date: String(target.date ?? ''), roleId: String(target.role ?? '') },
        config
      )
    } catch (error) {
      console.error('[slack] signup tap failed', error)
      reply = 'Something went wrong. Please try again, or ask a shift lead.'
    }
    try {
      await replyPrivately(responseUrl, reply)
    } catch (error) {
      console.error('[slack] private reply failed', error)
    }
  })

  return new Response(null, { status: 200 })
}
