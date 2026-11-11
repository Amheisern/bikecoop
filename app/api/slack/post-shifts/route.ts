import { postUpcomingNights, slackConfig } from '@/lib/slack'

// The weekly cron-job.org job calls this (Sunday 4 PM) to post the coming
// week's shift nights in the signups channel, one message per night. Public
// (proxy.ts lets /api/slack/ through) and safe to call any number of times:
// nights already posted are skipped, so the worst a stray call can do is post
// the coming week a little early.
export async function GET() {
  const config = slackConfig()
  if (!config) return Response.json({ ok: false, error: 'Slack is not set up' }, { status: 503 })
  try {
    const result = await postUpcomingNights(config)
    return Response.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[slack] weekly post failed', error)
    return Response.json({ ok: false, error: 'Posting to Slack failed' }, { status: 502 })
  }
}
