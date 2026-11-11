# St. Pete Bike Coop — Member Management

A small, boring-on-purpose member-management app for a cooperative bike shop:
people & profiles, daily check-ins, volunteer hours & milestone rewards,
behavior flags, annual memberships, and reporting/export. It replaces a legacy
Ruby on Rails app ("Freehub").

**Stack:** Next.js (App Router) + TypeScript, SQLite via libSQL
(`@libsql/client`; a local file in dev, a free Turso database in production),
plain CSS. No ORM, no component libraries. See [CLAUDE.md](CLAUDE.md) for the
full domain model, design decisions, and build roadmap, and
[PROGRESS.md](PROGRESS.md) for the dated changelog.

## Running locally

Requires Node 20+.

```bash
npm install
cp .env.local.example .env.local   # or create .env.local by hand, see below
npm run dev
```

`.env.local` needs:

| Variable | Purpose |
|---|---|
| `AUTH_USERNAME` | Shared login username for the whole app |
| `AUTH_PASSWORD` | Shared login password |
| `SESSION_SECRET` | Random string used to sign the session cookie (e.g. `openssl rand -hex 32`) |
| `DATABASE_PATH` | Optional. Local SQLite file path; defaults to `./bikecoop.db` |
| `TURSO_DATABASE_URL` | Production only. The Turso database URL (`libsql://...`). When set, it's used instead of `DATABASE_PATH` |
| `TURSO_AUTH_TOKEN` | Production only. Turso database token |
| `SLACK_BOT_TOKEN` | Optional. Slack shift signup: the app's Bot User OAuth Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Optional. Slack shift signup: the app's Signing Secret |
| `SLACK_CHANNEL_ID` | Optional. Slack shift signup: the #shift-signups channel ID (`C...`) |
| `RESEND_API_KEY` | Optional. Enables real sending of lapsed-member renewal emails; without it, sends are dry-run (logged, not sent) |
| `EMAIL_FROM` | Sender for renewal emails, e.g. `St. Pete Bike Coop <members@example.org>` (required only with `RESEND_API_KEY`) |

The database file is created and migrated automatically on first request
(`db/schema.sql` + the idempotent migrations in `lib/db.ts`). The local dev
database is disposable and gitignored — delete `bikecoop.db*` any time to
start fresh. Use **Reports → Sample Data** in the app to load/clear a test
dataset.

## Tests

```bash
npm test
```

Unit tests (`tests/`) run against an in-memory libSQL database via Node's
built-in test runner — no framework, no network, a couple of seconds.

## Deployment

Deployed on Render's free tier; every push to `main` auto-deploys. Production
needs the same env vars as above, plus `TURSO_DATABASE_URL` and
`TURSO_AUTH_TOKEN`: the data lives in a free Turso database, because Render's
free tier wipes local files on every deploy and restart.

Free Render services sleep after 15 quiet minutes and take about a minute to
wake. A free [cron-job.org](https://cron-job.org) job visits `/api/health`
every 10 minutes to keep the app awake (needed for Slack, which gives up after
3 seconds). `/api/health` needs no login and never touches the database. Keep
this the only free service in the Render workspace: one always-awake service
uses about 744 of the workspace's 750 free hours a month.

Before go-live: set up a periodic off-box backup (for example a scheduled
`turso db shell <database> .dump`, or the JSON export from Reports).

## Conventions

- Dates are stored as ISO `YYYY-MM-DD` strings, always computed in the shop's
  timezone (`lib/dates.ts`) — never from the server's UTC clock.
- Dependencies are pinned exactly; don't add packages without a strong reason.
- Keep the UI obvious enough for a non-technical volunteer at a front desk.
