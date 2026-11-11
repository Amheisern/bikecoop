# CLAUDE.md — St. Pete Bike Coop Member Management System

Read this fully before making changes. It is the source of truth for scope and conventions.

## What this project is

A member-management web app for a cooperative bike shop, replacing a legacy Ruby on Rails
app ("Freehub"). Built and maintained by one person (Nick). The #1 priority is **stability
and low maintenance**: boring, well-established patterns; pinned dependencies; no clever
abstractions. Prefer the simplest thing that works. It may later be offered to other co-ops.

## Stack (do not change without asking)

- Next.js (App Router) + TypeScript — UI and API in one deployable app
- SQLite via libSQL (`@libsql/client`), the SQLite fork Turso runs on. Plain
  SQLite SQL and schema. **Changed Nov 2026 (Nick approved):** production data
  lives in a free Turso database instead of a file on Render's disk, because
  Render's free tier wipes local files on every deploy and restart.
- No ORM, no Tailwind, no component libraries unless asked. Plain CSS or CSS modules.
- Hosted on Render's free tier. Deploys automatically on push to `main` via
  GitHub. A free cron-job.org job visits `/api/health` every 10 minutes so the
  app never goes to sleep (free services sleep after 15 idle minutes and take
  about a minute to wake; Slack needs answers within 3 seconds).
- Where the database is (`resolveDatabaseUrl()` in `lib/db.ts`): Turso when
  `TURSO_DATABASE_URL` (+ `TURSO_AUTH_TOKEN`) is set (production); otherwise a
  local file at `DATABASE_PATH`, default `./bikecoop.db` (dev); `:memory:` for
  tests and always during `next build`. Never hardcode paths. Never commit the
  database file (gitignored).
- **Every query is async** (`await db.all/get/run(sql, ...args)`), because a
  Turso query is a network round trip. Avoid per-person query loops (the export
  and import do everything in a couple of queries / one `db.batch()`).
  `db.batch()` = several writes, all or nothing, one round trip.
  `db.transaction()` = a short read-then-write (e.g. a slot cap check); Turso
  cancels interactive transactions after 5 seconds, so keep them tiny.

## Domain model (see db/schema.sql)

Person fields and the staff/site-lead split are modeled after the legacy Freehub app
(github.com/asalant/freehub) — cloned and read directly (schema.rb, Person model, views)
rather than guessed. Freehub's `people` table also carried full address, year of birth,
and free-form tags, plus a general Notes journal separate from any structured flag system
(it has no banned/watch/heads_up levels at all — just Staff/Patron + notes). Ours now
mirrors those fields and adds the more structured Flags system on top.

- **people** — everyone who enters the shop, members and non-members. `is_staff`
  (column name kept as-is internally to avoid colliding with `visits.is_volunteer`,
  which means something different — a specific day's volunteer session) is a general
  designation shown on the profile as **Volunteer** vs Member vs Patron. `is_site_lead`
  is a narrower subset — only they populate the "Shift Lead" dropdown used for
  attribution. Most volunteers are **not** site leads. (The UI says "Shift lead";
  code and database keep the `site_lead` name.) Also carries full mailing
  address (`street1`, `street2`, `city`, `state`, `postal_code`, `country`),
  `year_of_birth`, and free-form comma-separated `tags`. `email_opt_out` must be
  respected in any export.
- **memberships** — dated annual records attached to a person. Current membership =
  `end_date >= today`. Lapsed = most recent membership has `end_date < today`.
  One membership type only (annual) — Freehub also tracks "Earn a Bike/Digging Rights"
  as a second service type; deliberately not built yet (see "Volunteer-hour rewards"
  below).
- **visits** — one row per person per day (`UNIQUE(person_id, visit_date)` enforces this;
  shop is only open 6:00–8:30pm so multiple daily visits are impossible).
  `is_volunteer = 1` means the visit was a volunteer session worth exactly **2.5 hours**.
  Total volunteer hours = count(volunteer visits) × 2.5. Foot traffic = count(all visits).
  `checked_out = 1` only hides the person from today's front-desk lists; the visit (and
  any volunteer credit) still counts. Re-checking in the same day resets it to 0.
- **flags** — warnings shown when a person is looked up. Levels: `banned`, `watch`.
  `banned` → blocking modal that must be dismissed before proceeding. `watch` →
  prominent colored banner on the person's record. Flags persist until manually
  cleared (`resolved_at` set). Any volunteer can add or clear flags. (Originally had
  a third level, `heads_up`, functionally identical to `watch` — merged into one.)
- **notes** — general free-text, timestamped notes on a person (e.g. "great with wheel
  truing, ask him for help"). Distinct from Flags: no levels, no resolution, just a
  running history log. Any volunteer can add one; notes are never edited or deleted.
- **shift_signups** — who is signed up for which role on which shift night (see
  "Shift schedule" below). `UNIQUE(person_id, shift_date, role_id)`.

New columns on `people` (`is_site_lead`, address, `year_of_birth`, `tags`) are added to
already-deployed databases via a small idempotent migration in `lib/db.ts`
(`ensureColumns`: `ALTER TABLE ... ADD COLUMN`, guarded by checking `PRAGMA table_info` first) — schema.sql's
`CREATE TABLE IF NOT EXISTS` only covers brand-new databases. Schema and
migrations run once per server process, on the first query.

For one-off **data** fixes (not schema changes) — e.g. backfilling a new flag's value
from an old one — use `lib/db.ts`'s `runOnce(client, name, sql)`, backed by the
`schema_migrations` table. This ran once already to fix a real bug: splitting
`is_staff`/`is_site_lead` initially left every already-existing "staff" person
silently dropped from the site-lead dropdown, since `is_site_lead` defaulted to 0 for
everyone regardless of their prior `is_staff` value. Any future flag split or similar
change needs the same treatment — a plain `ensureColumn` is not enough on its own.

## Front desk: one Check In page

Tabs: Check In, Schedule, Reports. **Changed Nov 11, 2026 (Michael's
feedback): one front-desk page, not separate Volunteers and Guests tabs.**
`/checkin` is the home page; `/`, `/guests`, `/volunteers`, `/shift` and
`/people` all redirect there (a search in the old URL is kept). Profiles stay
at `/people/[id]` and highlight the Check In tab. Layout (`app/front-desk.tsx`):
search on the left; on the right, Signed up for tonight, then Volunteers here
today, then Guests here today (`app/today-roster.tsx`, once per group).

- **Laid out for the front-desk iPad** (Nov 11, after Nick's feedback):
  every search row is the same height. Name on the left, with tags under it
  (BANNED / WATCH flag, "Here as guest" / "Here as volunteer"). Buttons are
  all the same size (52px tall) and pinned to the right edge, no empty gaps
  (`app/front-desk-checkin.tsx`). Two button styles only: white (Guest, See
  why) and yellow (Volunteer).
- **Search** finds everyone. Each row's buttons:
  - Not here yet: **Guest** (a plain visit, e.g. working on their own bike),
    plus **Volunteer** (a 2.5-hour session, milestone toast) for people marked
    Volunteer (`is_staff = 1`).
  - **Banned**: **See why**, a link to their profile, where the blocking modal
    must be dismissed first.
  - Here as a guest: Volunteer only, for Volunteer-marked people (others: no
    buttons). Here as a volunteer: no buttons; changes happen in today's lists.
  - `FrontDeskCheckIn` stays mounted in every non-banned row so a milestone
    celebration survives the buttons changing after a check-in.
- Search is capped at `SEARCH_LIMIT` (10) with a "keep typing" hint when full.
  Flagged people show a ⛔/⚠️ marker (the flag level comes back with the search,
  no extra queries).
- **Adding people** happens here: a "Not listed? Add a new person" link always
  shows (common names always match someone), and a big "+ Add new person"
  button replaces it when a search finds nobody. The form (`/people/new`) is not
  prefilled from the search. **Saving it creates the person, checks them in as
  a guest, and returns to Check In** (`createPersonAction`).
- **Signed up for tonight** (`app/expected-tonight.tsx`) shows tonight's signups
  who haven't checked in as a volunteer yet, with their roles and a one-tap
  Check In (banned: "See why"). Hidden on non-shift nights with no signups.
- **Today's lists**: everyone checked in today and not checked out, split into
  Volunteers and Guests, one tile per line (name left, buttons right). Each tile has a move button with a confirmation: "Move
  to Guests" (demote) or "Move to Volunteers" (promote; shown only for
  Volunteer-marked people). Promote/demote re-stamp `logged_by` with the current
  shift lead. Removing a tile offers "Check out, keep visit" (sets
  `checked_out`) or "Delete visit record" (deletes today's visit row, no trace).
- `checkInAction` refuses a volunteer session for anyone not marked Volunteer
  (server-side backstop; the forms already hide the option).
- Check-in also happens on a profile (which keeps its "Volunteer session"
  checkbox) or by adding a new person.

## Shift schedule (shift-plan Phase 2)

`/schedule` lists every shift night for the next `SIGNUP_WEEKS_AHEAD` (4) weeks,
grouped by week, with each role's signups. Nights and roles are code constants in
`lib/shifts.ts` (like `REWARD_TIERS`); shift dates are computed, never stored.

- `SHIFT_NIGHTS`: Mon, Tue, Thu, 6:00 to 8:30pm. No closures/holidays yet (Nick:
  skip for now); every shift night always shows.
- `SHIFT_ROLES`: **Shift lead** (max 1 per night, only people marked Shift lead),
  **Mechanic** and **Greeter / front desk** (no cap). Every role needs Volunteer.
- One person can hold several roles on a night, each role once.
- "+ Add" on a role opens `/schedule/[date]/[role]`: search (filtered to who can
  take that role), then Sign up. `signUpForShift()` enforces every rule (open date,
  Volunteer, Shift lead, not banned, not a duplicate, slot cap) in one transaction;
  it's the one entry point Phase 3 (Slack, `source = 'slack'`) should reuse.
- ✕ on a signup cancels it: the row is deleted, no record kept.
- Signing up never logs hours; only checking in does. `logged_by` is the shift
  lead who made the signup.
- A shift lead signs volunteers up; volunteers can't sign themselves up until
  Phase 3 (no member login, by design).
- Tonight's signups show as "Signed up for tonight" on the Check In page.

## Slack signup (shift-plan Phase 3)

Volunteers sign themselves up in Slack (`lib/slack.ts`). Decisions (Nick, Nov
11): automatic weekly posts, **one message per night**, a new **#shift-signups**
channel, and a private reply when someone can't be matched.

- **Weekly post:** cron-job.org calls `GET /api/slack/post-shifts` every Sunday
  at 4 PM. It posts each shift night from today through the next six days (the
  coming Mon, Tue, Thu) that isn't posted yet. Each night is claimed in
  `slack_posts` before posting, so repeat calls never double-post; a failed post
  releases the claim for the next run.
- **A post:** header with the night, one section per role with who's signed up
  (first name, last initial, or _open_) and a **Sign up** button
  (`action_id: toggle_signup`, value `{date, role}`).
- **A tap** (`POST /api/slack/interactions`): the Slack signature is checked
  (requests older than 5 minutes are refused), the route answers 200 at once
  (Slack's 3-second limit), and the work runs in `after()`: look up the
  tapper's Slack email (`users.info`), match a person by email
  (case-insensitive), then sign up through `signUpForShift()` (`source =
  'slack'`, `logged_by = "<name> (Slack)"`) or, if they already have that role
  that night, cancel. The night's message is redrawn from the database and the
  tapper gets a private reply. Same rules as the Schedule page; banned people
  get "Please talk to a shift lead" with no detail.
- **Two-way sync:** a signup or cancel on the Schedule page redraws that night's
  Slack message (`refreshNightPost`, after the page responds). Slack failures
  are logged, never shown to the front desk.
- Settings (Render): `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`,
  `SLACK_CHANNEL_ID`. Until all three are set the Slack routes answer 503 and
  nothing talks to Slack. The Slack app is defined in
  `docs/slack-app-manifest.yml`. `/api/slack/` is open without a login
  (proxy.ts); the signature (taps) and idempotency (weekly post) are the guards.
- Matching needs each volunteer's email in the app to be their Slack email.

## Volunteer milestones / badges

Computed live from cumulative hours, never stored. Thresholds (hours):
5, 10, 20, 30, 50, 100, 200, 300, 400, 500+.
When logging a session pushes someone past a threshold, show an in-app celebration
(e.g. toast: "🎉 Jane just passed 50 hours!"). Badges display on the person's profile —
but only once a person has logged at least one volunteer hour. The Volunteer Hours
stat, milestone badges, and Rewards section are all hidden for anyone at 0 hours (most
members/patrons never volunteer) — gated on actual logged hours, not the "Volunteer"
role checkbox on the person form, so an occasional volunteer who isn't formally
flagged still gets full credit and visibility once they've logged a session.

## Volunteer-hour rewards

Real redeemable rewards, not just celebratory badges — inspired by Freehub's "Earn a
Bike/Digging Rights" service type, but reimagined as hours-based unlocks. Tiers are a
tunable code constant (`lib/rewards.ts`'s `REWARD_TIERS`), not a table:

- 10+ volunteer hours → Free Annual Membership
- 30+ volunteer hours → Earn-a-Bike Eligibility

These starting numbers came from Nick as examples ("something like 10 hours = an annual
membership, maybe 30 = build a bike") — adjust `REWARD_TIERS` freely as shop policy
changes; no migration needed.

Crossing a threshold makes the reward **available**, not automatically granted — a site
lead must click "Redeem" on the person's profile. This is deliberate: hitting the hour
count doesn't mean the person wants the reward applied right now (e.g. they may want to
bank a free membership until their current one actually lapses). Redeeming
`free_membership` calls the existing `createMembership()` to record a free year;
`earn_a_bike` has no further mechanics — the `reward_redemptions` row is the record.
Each tier can only be redeemed once per person (`UNIQUE(person_id, tier_id)`).

**Explicitly deferred:** an "hours → ongoing shop credit" ledger (a ledger/balance is a
different shape of feature than a one-time tier unlock — it needs its own
`credit_transactions` table and a $/hour rate). Build this later, as its own feature,
not bundled into the reward tiers.

## Auth & attribution model

- One shared username/password for the whole app (simple session cookie is fine).
  This is the only real security boundary.
- Inside the app, a "Shift Lead" dropdown of site leads (people where `is_site_lead = 1` — a subset of
  staff, not all of them) selects who is operating the tool. Their name is stamped as
  `logged_by` on every visit, membership, flag, and note. Remember the selection per
  device (cookie). This is attribution, not security — do not build role-based
  permissions.
- No member-facing login of any kind in v1.

## Explicitly out of scope for v1 (do not build)

- Shift signup, SignUpGenius replacement, Slack integration. **Update (Nov 2026):**
  Nick now wants these, in phases planned in `docs/volunteer-shifts-plan.md`;
  all three phases are built (see "Slack signup" above).
- The app sending email — with exactly one deliberate post-v1 exception: the
  reviewed, one-click lapsed-member renewal notice (see "Lapsed-member emails"
  below). No other email of any kind; bulk/marketing email stays external via
  the AI-friendly export.
- Member self-service portal
- Multi-organization support (keep code clean enough to add later, but do not build it)

## Lapsed-member emails

One email type only: a plain-text renewal notice to members whose latest
membership expired at least `LAPSE_GRACE_DAYS` (7, tunable in
`lib/lapse-emails.ts`) days ago. **Not automatic** — the queue is computed live
on `/reports` ("Lapsed-Member Emails" section) and nothing sends until a site
lead clicks Send; there is no cron/scheduler anywhere. Skips people with no
email, `email_opt_out = 1`, or an active `banned` flag. Once per lapse, ever:
sends are recorded in `lapse_emails` with `UNIQUE(person_id,
membership_end_date)`, so re-clicking can't double-email and a renew-then-lapse
-again correctly earns a new notice. Failed sends are NOT recorded — they stay
queued for retry. Template lives in `renderLapseEmail()` — edit freely.

Sending goes through `lib/email.ts`'s `sendEmail()` (Resend API via plain
fetch, no SDK). **Currently in dry-run mode**: until `RESEND_API_KEY` +
`EMAIL_FROM` are set, sends are logged to the server console and recorded as
`dry_run` — the whole flow works, no email leaves. To go live: decide the
provider question (co-op domain + Resend, or swap ~20 lines in `lib/email.ts`
for Gmail SMTP), then set the env vars on Render.

## Reporting & export (Phase 5)

`/reports` is the single hub for all reporting — there is no separate lapsed-members
page/nav item, it's a section here.

- Periods: monthly, quarterly (Q1–Q4), annual. Metrics: total visits, unique visitors,
  volunteer sessions, volunteer hours, new members, lapsed members.
- **Lapsed Members** — list of everyone whose latest membership has expired (name +
  expiry date), reusing `getLapsedPeople()`.
- **Volunteers** — everyone with any logged volunteer hours, sorted by hours descending
  (name, hours, current milestone), via `getVolunteerRoster()` in `lib/hours.ts`.
- "AI-friendly export": one row per person — CSV and JSON — with stable snake_case
  column names and computed fields: membership_status (active/lapsed/none),
  days_until_or_since_expiry, total_volunteer_hours, current_milestone, active_flags,
  email_opt_out. This is fed to external AI tools to draft emails; the app never sends.
- **Sample Data** — Load/Clear buttons for the test dataset (`lib/seed.ts`).

## Data import (Phase 6)

A one-time CSV import of the legacy Freehub "People" report export, built on
`/reports` ("Legacy Import"). The expected format was taken directly from
Freehub's source (`Person::CSV_FIELDS` in app/models/person.rb):
`id, first_name, last_name, staff, email, email_opt_out, phone, postal_code,
street1, street2, city, state, postal_code (twice — a real Freehub quirk),
country, yob, tag_list, created_at, membership_expires_on`. The header is
validated strictly — a file that doesn't match errors out with a clear message
before any row is touched. **Not yet validated against a real export file**
(Nick didn't have one yet); do that before go-live.

Semantics (`lib/import.ts`): `staff` → `is_staff` (`is_site_lead` always 0 —
flag site leads by hand after import); `membership_expires_on` (Freehub's
people export only carries the *latest* expiry) → one membership with
start = one year before end; legacy data has no volunteer hours, so totals
start at zero. Re-runnable: the legacy id is stored in `people.freehub_id` and
matched on re-import (people already present are left unchanged, never
duplicated or overwritten); people hand-entered before the import are adopted
by exact name+email match instead of duplicated. Bad rows are skipped
individually with per-row reasons in the results summary; the whole import
runs in one transaction. Freehub's "Services" report CSV (full membership
history, matched by name/email) was deliberately not imported — latest-expiry
is enough for current/lapsed status.

## Build phases & current state

- [x] Phase 0 — Scaffold: Next.js app deployed to Render (free tier for now),
      auto-deploy from GitHub `main` working.
- [x] Phase 1 — Schema (`db/schema.sql`), connection (`lib/db.ts`), People pages
      (list/search, add/edit, profile), visit check-in with volunteer checkbox,
      site-lead dropdown + shared login.
- [x] Phase 2 — Hours & badges: totals on profile, milestone badges, celebration toast.
- [x] Phase 3 — Flags: add/clear UI, blocking modal for banned, banners for others.
- [x] Phase 4 — Memberships: record/renew, current-vs-lapsed logic, lapsed list.
- [x] Phase 5 — Reports & AI-friendly export.
- [x] Phase 6 — Freehub CSV import (built from the source-derived format; still
      needs a test run against a real export file).
- [x] Shift page: front-desk check-in plus today's volunteer/visitor roster
      (first pass contributed by Michael on `michael-updates`).
- [x] Volunteers / Guests tabs (shift-plan Phase 1; replaced the single Shift page
      and merged the People tab into Guests).
- [x] Shift schedule (shift-plan Phase 2): Schedule tab, signups, "Signed up for
      tonight" on Volunteers.
- [x] One Check In page (Michael's feedback, Nov 11): Volunteers and Guests tabs
      merged back into one page with Guest / Volunteer buttons.
- [x] Turso database (libSQL) + `/api/health` for the keep-awake ping, so the
      free Render tier keeps data and stays awake.
- [x] Slack signup (shift-plan Phase 3): weekly per-night posts, tap to sign
      up or cancel, two-way sync with the Schedule page. Needs the Slack app,
      #shift-signups, the three SLACK_ settings and the weekly cron job.
- [ ] Go-live: validate the import with the real Freehub CSV, confirm Turso is
      connected on Render (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN) and the
      cron-job.org ping is running, set up off-box backups (e.g. a scheduled
      `turso db shell <db> .dump`, or the JSON export).

Keep this checklist updated as phases complete.

## Conventions

- Small commits with clear messages; push to `main` deploys automatically.
- Dates stored as ISO strings (`YYYY-MM-DD`), always computed in the shop's
  timezone via `lib/dates.ts` (`todayISO()` etc.) — never from the server's UTC
  clock and never via SQLite's `date('now')` (also UTC). The server runs in UTC
  and UTC midnight lands mid-shift (7–8pm Eastern), so a UTC "today" stamps the
  wrong date on evening check-ins. Pass dates explicitly to INSERTs.
- `npm test` runs the unit tests in `tests/` (Node's built-in runner + `tsx`,
  in-memory libSQL). Run them (plus `tsc --noEmit` and `npm run build`) before
  any push; add a regression test when fixing a bug.
- Keep dependencies minimal and pinned. Do not add packages without a strong reason.
- UI should be obvious enough for a non-technical volunteer at a front desk:
  big search box, big buttons, high contrast. Function over polish.
- The dev database (`bikecoop.db`) is disposable; never commit it.

@AGENTS.md
