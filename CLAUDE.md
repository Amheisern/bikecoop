# CLAUDE.md — St. Pete Bike Coop Member Management System

Read this fully before making changes. It is the source of truth for scope and conventions.

## What this project is

A member-management web app for a cooperative bike shop, replacing a legacy Ruby on Rails
app ("Freehub"). Built and maintained by one person (Nick). The #1 priority is **stability
and low maintenance**: boring, well-established patterns; pinned dependencies; no clever
abstractions. Prefer the simplest thing that works. It may later be offered to other co-ops.

## Stack (do not change without asking)

- Next.js (App Router) + TypeScript — UI and API in one deployable app
- SQLite via `better-sqlite3` (synchronous API is fine; this app has one concurrent user)
- No ORM, no Tailwind, no component libraries unless asked. Plain CSS or CSS modules.
- Hosted on Render. Deploys automatically on push to `main` via GitHub.
- Database file location comes from `process.env.DATABASE_PATH`, defaulting to
  `./bikecoop.db` locally. On Render production it will be `/var/data/bikecoop.db`.
  Never hardcode paths. Never commit the database file (gitignored).

## Domain model (five tables — see db/schema.sql)

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

New columns on `people` (`is_site_lead`, address, `year_of_birth`, `tags`) are added to
already-deployed databases via a small idempotent migration in `lib/db.ts`
(`ALTER TABLE ... ADD COLUMN`, guarded by checking `PRAGMA table_info` first) — schema.sql's
`CREATE TABLE IF NOT EXISTS` only covers brand-new databases.

For one-off **data** fixes (not schema changes) — e.g. backfilling a new flag's value
from an old one — use `lib/db.ts`'s `runOnce(db, name, fn)`, backed by the
`schema_migrations` table. This ran once already to fix a real bug: splitting
`is_staff`/`is_site_lead` initially left every already-existing "staff" person
silently dropped from the site-lead dropdown, since `is_site_lead` defaulted to 0 for
everyone regardless of their prior `is_staff` value. Any future flag split or similar
change needs the same treatment — a plain `ensureColumn` is not enough on its own.

## Front desk: Volunteers and Guests tabs

Tabs: Volunteers, Guests, Reports. `/` redirects to **`/guests`** (the home tab).
`/shift` (the old single front-desk page) and `/people` (the old People tab, merged
into Guests) both redirect to `/guests` so old bookmarks still work. Profiles stay at
`/people/[id]` and highlight the Guests tab. Both tabs share one layout (`app/front-desk.tsx`): search on
the left, today's check-ins for that tab on the right (`app/today-roster.tsx`).

- **Volunteers tab** (`/volunteers`): search finds only people marked Volunteer
  (`is_staff = 1`, via `searchPeople(q, { volunteersOnly: true })`). Check In logs a
  2.5-hour volunteer session and shows the milestone toast. People not marked
  Volunteer never appear here; they check in on Guests.
- **Guests tab** (`/guests`): search finds everyone, including volunteers on nights
  they're just working on their own bike. Check In logs a plain visit. It is also
  where new people are added: a "Not listed? Add a new person" link always shows
  (common names always match someone), and a big "+ Add new person" button
  replaces it when a search finds nobody. The form (`/people/new`) is not
  prefilled from the search. **Saving it creates the person, checks them in as a
  guest, and returns to Guests** (`createPersonAction`).
- Search is capped at `SEARCH_LIMIT` (10) with a "keep typing" hint when full.
  Flagged people show a ⛔/⚠️ marker. **Banned** people (on either tab) have no
  Check In button, only "See why", a link to their profile, where the blocking
  modal must be dismissed first. Search rows note when someone is already checked
  in today, and on which tab.
- **Today's list**: everyone checked in today and not checked out, for that tab.
  Each tile has a move button with a confirmation: "Move to Guests" (demote) or
  "Move to Volunteers" (promote; shown only for Volunteer-marked people). Promote/
  demote re-stamp `logged_by` with the current shift lead. Removing a tile offers
  "Check out, keep visit" (sets `checked_out`) or "Delete visit record" (deletes
  today's visit row, no trace).
- `checkInAction` refuses a volunteer session for anyone not marked Volunteer
  (server-side backstop; the forms already hide the option).
- Profiles are reached from either tab's search results (name links to the
  profile, which has Edit). Check-in happens on the front-desk tabs, on a profile
  (which keeps its "Volunteer session" checkbox), or by adding a new person.

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
  Nick now wants these, in phases planned in `docs/volunteer-shifts-plan.md`.
  Build only a phase that doc marks approved, and ask its open questions first.
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
- [ ] Shift schedule, then Slack signup (see `docs/volunteer-shifts-plan.md`).
- [ ] Go-live: validate the import with the real Freehub CSV, upgrade Render to
      Starter, attach persistent disk at /var/data, set DATABASE_PATH, set up
      off-box database backups.

Keep this checklist updated as phases complete.

## Conventions

- Small commits with clear messages; push to `main` deploys automatically.
- Dates stored as ISO strings (`YYYY-MM-DD`), always computed in the shop's
  timezone via `lib/dates.ts` (`todayISO()` etc.) — never from the server's UTC
  clock and never via SQLite's `date('now')` (also UTC). The server runs in UTC
  and UTC midnight lands mid-shift (7–8pm Eastern), so a UTC "today" stamps the
  wrong date on evening check-ins. Pass dates explicitly to INSERTs.
- `npm test` runs the unit tests in `tests/` (Node's built-in runner + `tsx`,
  in-memory SQLite). Run them (plus `tsc --noEmit` and `npm run build`) before
  any push; add a regression test when fixing a bug.
- Keep dependencies minimal and pinned. Do not add packages without a strong reason.
- UI should be obvious enough for a non-technical volunteer at a front desk:
  big search box, big buttons, high contrast. Function over polish.
- The dev database (`bikecoop.db`) is disposable; never commit it.

@AGENTS.md
