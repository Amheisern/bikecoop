// A tiny public page for the keep-awake scheduler (cron-job.org) to visit
// every 10 minutes. Render's free tier puts the app to sleep after 15 quiet
// minutes, and waking takes about a minute; Slack button taps time out after
// 3 seconds. Deliberately doesn't touch the database or need a login
// (proxy.ts lets this one path through), and returns nothing private.
export function GET() {
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
