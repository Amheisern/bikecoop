# Progress Log

## Phase 1 — Schema, People pages, check-in, auth (complete)

**Date:** 2026-07-18

### What was built

- **`db/schema.sql`** — `people`, `memberships`, `visits`, `flags` tables per the
  domain model in CLAUDE.md. Applied idempotently (`CREATE TABLE IF NOT EXISTS`).
- **`lib/db.ts`** — `better-sqlite3` singleton connection (survives dev hot-reload
  via a `globalThis` cache). Reads `DATABASE_PATH`, defaults to `./bikecoop.db`.
  WAL journal mode, foreign keys on.
- **`lib/people.ts`** — data access: search/list, get, create, update people;
  get visits for a person; check in (upsert on `UNIQUE(person_id, visit_date)`).
- **Auth (`lib/auth.ts`, `app/login/`, `proxy.ts`)** — single shared
  username/password from `AUTH_USERNAME` / `AUTH_PASSWORD` env vars. Session is a
  stateless HMAC-signed cookie (`SESSION_SECRET`), no session table. `proxy.ts`
  (Next.js 16's renamed `middleware.ts`) gates every route and redirects
  unauthenticated requests to `/login`.
- **Site-lead dropdown (`lib/site-lead.ts`, `app/site-lead-picker.tsx`,
  `app/actions.ts`)** — top-bar `<select>` of `is_staff` people, auto-submits on
  change, persisted in a cookie, stamped as `logged_by` on every visit.
- **People pages (`app/people/`)**
  - `/people` — search box + results list with an inline check-in
    (volunteer checkbox) per row, "+ Add Person" link.
  - `/people/new` — add-person form.
  - `/people/[id]` — profile: contact info, check-in form, visit history.
  - `/people/[id]/edit` — edit-person form.
- Rewrote `app/globals.css` for a high-contrast, big-button, front-desk-friendly
  UI (plain CSS, no Tailwind, per CLAUDE.md). Dropped the Google-fonts
  (Geist) dependency in favor of a system font stack to avoid a network
  fetch at build time.

### Next.js version note

This repo runs Next.js 16.2.10, which has real breaking changes vs. older
training data (confirmed against the docs bundled in
`node_modules/next/dist/docs/`, per AGENTS.md): `cookies()`/`headers()`/`params`
are async-only, mutations use Server Functions (`'use server'`) instead of API
routes, and `middleware.ts` is renamed to `proxy.ts`. All new code follows
these conventions.

### Verified

Typecheck and `npm run build` both pass. Full golden path driven end-to-end in
a real headless browser (Playwright, since no browser tool was preloaded in
this environment) with screenshots and a `console --errors` check:

1. Unauthenticated visit to `/` redirects to `/login`.
2. Login with `AUTH_USERNAME` / `AUTH_PASSWORD` redirects to `/people`.
3. "+ Add Person" creates a person and redirects to their profile.
4. Searching `/people` finds the new person; inline check-in with the
   volunteer checkbox records a visit, visible on their profile.
5. Editing a person via `/people/[id]/edit` saves and redirects back.
6. The site-lead dropdown selection persists across a page reload (cookie).

Zero console/page errors observed.

Deployed to Render on 2026-07-18 with real `AUTH_USERNAME` / `AUTH_PASSWORD` /
`SESSION_SECRET` set in the Render dashboard. Login confirmed working on the
live site.

`DATABASE_PATH` should be updated to `/var/data/bikecoop.db` once the
persistent disk is attached (still Phase 6 per CLAUDE.md's checklist).

## Phase 2 — Hours & badges (complete)

**Date:** 2026-07-18

### What was built

- **`lib/hours.ts`** — `MILESTONES` (5, 10, 20, 50, 100, 200, 300, 400, 500
  hours), `getVolunteerHours` (volunteer visit count × 2.5), `getFootTraffic`
  (total visit count), `getCurrentMilestone`, `getAchievedMilestones`, and
  `getCrossedMilestone(before, after)` for detecting a threshold crossed by a
  single check-in. Kept as its own module since Phase 5's export also needs
  `total_volunteer_hours` and `current_milestone`.
- **`checkInAction`** now computes volunteer hours before and after the
  check-in and returns a celebration string (e.g. "🎉 Jane just passed 5
  hours!") when a threshold is crossed, or `null` otherwise.
- **`app/people/checkin-form.tsx`** — new client component wrapping the
  check-in form in `useActionState` so the returned celebration message can
  be rendered inline; replaces the old plain-HTML check-in forms on both the
  people list and profile page.
- **Profile page** now shows volunteer hours and foot traffic as stat tiles,
  plus a row of badge pills (one per milestone threshold) with achieved ones
  highlighted in the accent color.

### Verified

Typecheck and `npm run build` pass. Browser-driven (Playwright) end-to-end:
created a person, backdated one volunteer visit directly in SQLite to bank
2.5 hours (same-day check-ins upsert onto one `UNIQUE(person_id, visit_date)`
row, so multiple same-day clicks can't be used to simulate crossing a
threshold), then checked in as a volunteer today to push the total to 5.0
hours. Confirmed: celebration message rendered ("🎉 Milestone just passed 5
hours!"), stats tiles read 5 / 2, and exactly one badge ("5 hrs") was
highlighted as achieved. Zero console errors.

## Phase 3 — Flags (complete)

**Date:** 2026-07-18

### What was built

- **`lib/flags.ts`** — `getActiveFlags` (unresolved flags for a person),
  `createFlag`, `resolveFlag` (sets `resolved_at`).
- **`addFlagAction` / `resolveFlagAction`** (`app/people/actions.ts`) — add a
  flag (level + required note, stamped with the current site lead) or clear
  one. Any logged-in volunteer can do either, per CLAUDE.md.
- **`app/people/flag-add-form.tsx`** — client component (level select + note
  + `useActionState` for the "note required" validation error).
- **`app/people/banned-modal.tsx`** — client component: a blocking overlay
  shown whenever a profile has an active `banned` flag, listing the ban
  note(s), dismissible only via an "I Acknowledge" button. It re-appears
  every time the profile is loaded (local `useState`, not persisted) — the
  "shown when a person is looked up" behavior from CLAUDE.md.
- **Profile page** now renders `watch`/`heads_up` flags as colored banners
  (yellow / blue) with an inline "Clear" button, above the stats/badges.

### Also fixed while in the area

Added a show/hide toggle button on the login page's password field
(`app/login/login-form.tsx`), per user request — a plain `useState` flip
between `type="password"` and `type="text"`.

### Verified

Typecheck and `npm run build` pass. Browser-driven (Playwright) end-to-end:
toggled the login password visibility; added a `watch` flag and confirmed
the yellow banner rendered; added a `banned` flag and confirmed the banner
appeared *and* reloading the profile re-triggered the blocking modal (i.e.
it isn't a one-time dismissal); clicked "I Acknowledge" and confirmed the
modal closed; cleared both flags and confirmed the banner disappeared and
the modal no longer appears on reload. Zero console errors.

## Phase 4 — Memberships (complete)

**Date:** 2026-07-18

### What was built

- **`lib/memberships.ts`** — `getMembershipsForPerson` (full history),
  `getLatestMembership`, `getMembershipStatus` (`active` / `lapsed` / `none`,
  computed live by comparing the latest `end_date` to today — never stored),
  `createMembership` (used for both first-time recording and renewal — a
  renewal is just another row), `getLapsedPeople` (people whose latest
  membership's `end_date` is before today, for the lapsed list).
- **`addMembershipAction`** (`app/people/actions.ts`) — validates the date
  range, records the membership stamped with the current site lead.
- **`app/people/membership-form.tsx`** — client component (start/end date
  inputs, defaulting to today → one year out; `useActionState` for the "end
  before start" validation error).
- **Profile page** now shows a membership status banner (green "Current
  member — through `<date>`", yellow "Lapsed — expired `<date>`", or neutral
  "No membership on file"), the record/renew form, and membership history.
- **`/memberships/lapsed`** — new page listing everyone whose latest
  membership has expired, sorted most-recently-lapsed first, linked from the
  top nav as "Lapsed Members".

### Verified

Typecheck and `npm run build` pass (new `/memberships/lapsed` route shows up
in the build output). Browser-driven (Playwright) end-to-end: a person with
no membership showed "No membership on file"; recording one with the
pre-filled default dates flipped it to "Current member — through
`<one year out>`" and added a history row; a second person got a
directly-backdated expired membership (SQLite) and showed "Lapsed — expired
`<date>`"; the `/memberships/lapsed` page listed only that lapsed person, not
the active one. Zero console errors.

## Phase 5 — Reports & AI-friendly export (complete)

**Date:** 2026-07-18

### What was built

- **`lib/reports.ts`** — `getPeriodRange` (monthly / quarterly / annual → ISO
  start/end + a display label), `getReportMetrics` (total visits, unique
  visitors, volunteer sessions, volunteer hours, new members — first
  membership `start_date` in period — and lapsed members — latest
  membership `end_date` in period).
- **`/reports`** — a GET-form period picker (type/year/month/quarter, always
  visible, only the relevant fields used server-side — no client JS needed)
  defaulting to the current month, rendering the six metrics as stat tiles.
- **`lib/export.ts`** — `getExportRows` (one row per person with
  `membership_status`, `days_until_or_since_expiry` — positive if still
  active, negative if lapsed, `total_volunteer_hours`, `current_milestone`,
  `active_flags` as a comma-joined list of levels, `email_opt_out`) and a
  small hand-rolled `rowsToCSV` (no new dependency — keeps with CLAUDE.md's
  "minimal pinned dependencies" rule).
- **`/export/csv`** and **`/export/json`** — Route Handlers (Next 16's
  `route.ts` convention) returning the export with `Content-Disposition:
  attachment` so they download directly; linked as buttons from `/reports`.
  Protected by the same `proxy.ts` auth gate as every other route — no
  separate auth check needed inside the handlers.
- Added "Reports" to the top nav.

### Verified

Typecheck and `npm run build` pass (`/reports`, `/export/csv`,
`/export/json` all show up in the build output). Browser-driven (Playwright)
end-to-end: created a person, checked them in as a volunteer, and recorded a
membership, all "this month" — the default `/reports` view showed 1 total
visit, 1 unique visitor, 1 volunteer session, 2.5 volunteer hours, 1 new
member, 0 lapsed members; switching to an unrelated past period (`2023`
annual) showed all zeros, confirming the date-range filtering actually
filters. Downloaded both `/export/csv` and `/export/json` through the
authenticated browser context and confirmed correct headers
(`Content-Type: text/csv`, `Content-Disposition: attachment; filename=...`)
and correct computed field values (`membership_status: active`,
`days_until_or_since_expiry: 365`, etc.). Zero console errors.

### Not built yet (explicitly out of scope so far)

Freehub CSV import (Phase 6) — see CLAUDE.md's checklist. This one needs the
actual legacy CSV header row from Freehub before the field mapping can be
finalized (per CLAUDE.md's own note under "Data import").

## Person model enhancement: comprehensive fields + staff/site-lead split (complete)

**Date:** 2026-07-18

Prompted by feedback on the Add Person form ("this needs to be more
comprehensive") plus a real bug: `is_staff` was doing double duty as both a
general staff designation *and* the flag that populated the site-lead
dropdown, which is wrong — most staff are not site leads. Researched by
cloning the actual legacy Freehub repo (github.com/asalant/freehub, not just
its wiki) and reading `db/schema.rb`, `app/models/person.rb`, and the person
views directly, rather than guessing at its field set.

### What was built

- **Split `is_staff` from a new `is_site_lead`** — `is_staff` is now a
  general profile designation (drives a Freehub-style Staff/Member/Patron
  label); `is_site_lead` is the narrower flag that actually populates the
  "Working today" dropdown. `getStaff()` stays; added `getSiteLeads()`.
- **Added Person fields matching Freehub's model**: full mailing address
  (`street1`/`street2`/`city`/`state`/`postal_code`/`country`),
  `year_of_birth`, and free-form comma-separated `tags` (rendered as pill
  badges on the profile).
- **Added a `notes` table** and general free-text Notes journal on the
  profile — timestamped, attributed, never edited/deleted. Distinct from the
  structured Flags system (Freehub has no ban/watch levels at all, just this
  kind of general note).
- **Idempotent migration in `lib/db.ts`** — new `ensureColumn()`/`migrate()`
  helpers run `ALTER TABLE ... ADD COLUMN` guarded by `PRAGMA table_info`,
  so the already-deployed Render database picks up the new `people` columns
  without a manual migration step or downtime. `schema.sql`'s
  `CREATE TABLE IF NOT EXISTS` alone only covers brand-new databases.
- Updated `person-form.tsx`, the profile page, and the top-nav site-lead
  picker accordingly.

### Also surfaced by the research

Freehub tracks a second "service" type, Earn a Bike/Digging Rights, alongside
membership. Nick wanted this reimagined as an hours-based rewards system
rather than a straight port — see the "Volunteer-hour rewards" entry below,
built the same day after a proposal was confirmed.

### Verified

Typecheck and `npm run build` pass. Verified the migration path specifically
(not just the happy path): hand-built a SQLite DB shaped like the
*pre-migration* production schema (no `is_site_lead`/address/etc. columns),
ran `lib/db.ts`'s migration logic against it, and confirmed all new columns
were added, the `notes` table was created, and the existing row survived
with safe defaults (`is_site_lead = 0`, address fields `NULL`) rather than
erroring or dropping data. Browser-driven (Playwright) end-to-end on a fresh
DB: created a staff-but-not-site-lead person and confirmed they're absent
from the site-lead dropdown; created a second person with the full field set
(address, year of birth, tags, staff, site lead) and confirmed they *do*
appear in the dropdown, and that the profile correctly renders their address,
tags as badges, and Staff/Site lead labels; added a note and confirmed it
appears in the notes feed with a timestamp. Zero console errors.

## Volunteer-hour rewards (complete)

**Date:** 2026-07-18

Proposed in conversation (manual redemption vs auto-grant; shop-credit
ledger now vs later — both resolved in favor of the simpler option) and
built the same day using Nick's example numbers as the starting config.

### What was built

- **`lib/rewards.ts`** — `REWARD_TIERS` (10 hrs → Free Annual Membership,
  30 hrs → Earn-a-Bike Eligibility; a plain code array, easy to retune),
  `getRewardStatuses(personId, hours)` → `locked` / `available` / `redeemed`
  per tier, `redeemReward`.
- **`reward_redemptions` table** — one row per redeemed
  `(person_id, tier_id)`, enforced unique so a tier can't be redeemed twice.
- **`redeemRewardAction`** (`app/people/actions.ts`) — re-validates
  eligibility and non-duplication server-side (not just trusting the UI
  state), then records the redemption; for `free_membership` specifically,
  also calls the existing `createMembership()` to record a free year,
  stamped `"<site lead> (redeemed reward)"` in `logged_by` for traceability.
- **Rewards section on the profile** — one row per tier showing Locked /
  a "Redeem" button (when available) / "Redeemed `<date>` by `<site lead>`".
- Moved `oneYearFrom` from a page-local helper into `lib/memberships.ts` so
  both the profile page and the reward-redemption action could share it.

### Explicitly deferred

An "hours → ongoing shop credit" ledger — a fundamentally different shape of
feature (a running balance, not a one-time unlock) — per Nick's choice to
ship the two threshold rewards first and revisit credit later.

### Verified

Typecheck and `npm run build` pass. Browser-driven (Playwright) end-to-end:
backdated volunteer visits (via SQLite, since check-ins are one-per-day) to
give a test person exactly 10.0 hours — confirmed "Free Annual Membership"
showed as available while "Earn-a-Bike" stayed locked; redeemed it and
confirmed the reward flipped to "Redeemed `<timestamp>`", a real membership
record appeared in Membership history, and the status banner flipped to
"Current member"; reloaded and confirmed the Redeem button was gone (can't
double-redeem); backdated further to 30.0 hours, confirmed Earn-a-Bike
became available, redeemed it, and confirmed exactly one membership row
existed throughout (no duplicate-creation bug from re-redeeming or
re-rendering). Zero console errors.

## Post-deploy fixes: site-lead migration bug, Volunteer wording, new-person membership (complete)

**Date:** 2026-07-18

Reported by Nick right after the person-model deploy went live: the "Working
today" dropdown appeared broken.

### Root cause

The `is_staff`/`is_site_lead` split shipped in the previous commit had a real
regression: under the old (pre-split) code, `is_staff = 1` was what populated
the site-lead dropdown. Splitting the flag added `is_site_lead` defaulting to
`0` for *every* already-existing person — including everyone who used to show
up in the dropdown — silently revoking their dropdown access on deploy. Not
caught earlier because verification only tested fresh people created after
the split, never an already-existing "staff" person carried across the
migration.

### What was built

- **One-time backfill migration** (`lib/db.ts`) — a new `runOnce()` helper
  backed by a `schema_migrations` tracking table (`name`, `applied_at`).
  `backfill_site_lead_from_staff` sets `is_site_lead = 1` for anyone who
  already had `is_staff = 1`, exactly once, on whichever database it hits
  next (dev or the already-migrated production DB — it re-checks the
  column's *existence*, not this data fix, so it still applies even though
  `is_site_lead` itself was added in the prior deploy). Verified it does
  **not** re-run on subsequent boots and does **not** fight a future manual
  edit (e.g. someone later unchecking Site Lead for a volunteer stays
  unchecked).
- **"Staff" renamed to "Volunteer"** in the UI (checkbox label on
  `person-form.tsx`, the Volunteer/Member/Patron type shown on the profile).
  The underlying `is_staff` column/variable names are unchanged — renaming
  them to `is_volunteer` would collide in meaning with `visits.is_volunteer`
  (a specific day's volunteer session vs. this general designation), so only
  the display text changed.
- **New-person form gained three checkboxes** (shown only when creating, not
  editing, mirroring Freehub's own new-person form): "Start annual
  membership today", "Check in today", "…as a volunteer session". Previously
  creating a person required a second trip to their profile to record a
  membership or check them in — a real gap vs. Freehub that Nick called out.

### Verified

Typecheck and `npm run build` pass. Reproduced the exact bug first: built a
database shaped like the *live pre-fix* state (`is_site_lead` column already
present, defaulted to 0, on a person with `is_staff = 1`), ran the new
migration logic against it, and confirmed the backfill fixes it — then ran
migration a second time (no change) and a third time after manually
unsetting the flag (stays unset, confirming the fix doesn't fight future
edits). Browser-driven (Playwright): confirmed the new-person form shows
"Volunteer" (not "Staff") and the three new checkboxes; created a person with
all three checked in one submission and confirmed the profile showed
"Current member", a volunteer visit in Visit History, and 2.5 volunteer
hours; confirmed the Edit form correctly omits the new-person-only
checkboxes. Zero console errors.

## Simplified new-person form + sample data for testing (complete)

**Date:** 2026-07-18

Nick wanted sign-up and sign-in kept as separate steps (dropped the "Check
in today" / "...as a volunteer session" checkboxes added in the previous
fix, keeping only "Start annual membership today"), and asked for sample
data so he could test the app without hand-creating everything.

### What was built

- **Removed the check-in checkboxes** from the new-person form
  (`person-form.tsx`) and the corresponding logic from `createPersonAction`.
  "Start annual membership today" stays — that part of the original ask was
  correct, just not the check-in bundling.
- **`lib/seed.ts`** — `seedSampleData()` creates 7 people covering every
  major state the app models: a bare patron (no membership/visits), an
  active member with a mixed visit history and a note, a lapsed member, a
  volunteer just past the 10hr milestone/reward tier, a staff+site-lead
  volunteer past the 30hr Earn-a-Bike tier (also exercises the site-lead
  dropdown), a banned person, and a watch-flagged person. All tagged
  `sample-data` so they're identifiable and safely removable as a group.
  `clearSampleData()` deletes them and all their dependent rows (visits,
  memberships, flags, notes, reward redemptions).
- **"Sample Data" section on `/reports`** — "Load Sample Data" / "Clear
  Sample Data" buttons calling new server actions in `app/reports/actions.ts`.
  This runs against whichever database the app is currently pointed at
  (dev or the live Render deploy) since there's no way for me to seed the
  production database directly — Nick triggers it himself from the UI.

### Verified

Typecheck and `npm run build` pass. Browser-driven (Playwright) end-to-end:
confirmed the new-person form no longer shows the check-in checkboxes but
still has "Start annual membership today"; loaded sample data and confirmed
all 7 people appear in the list; confirmed the site-lead dropdown includes
the staff+site-lead sample volunteer; opened her profile and confirmed 32.5
volunteer hours, both reward tiers showing "Redeem" (available), and
"Current member" status; opened the banned sample person's profile and
confirmed the blocking modal fires; confirmed the lapsed sample person shows
"Lapsed" status; cleared sample data and confirmed all 7 people were gone.
Zero console errors.

## People-list default state, volunteer-UI visibility, flag merge, Reports hub (complete)

**Date:** 2026-07-18

Nick's feedback after clicking through the sample data, worked from an approved plan
(`/Users/amheiser/.claude/plans/so-if-the-person-harmonic-newt.md`) with three design
decisions locked in via `AskUserQuestion` first: gate volunteer UI on actual hours
(not the Volunteer role flag), merge `watch`/`heads_up` into one level, and fold
Lapsed Members into a Reports hub alongside a new Volunteers report.

### What was built

- **`/people` no longer defaults to listing everyone.** `searchPeople('')` now
  returns `[]`; the page shows "Search for a person by name or email to check them
  in." until a query is typed, and "No matches." only once a search has actually
  come up empty.
- **Volunteer Hours stat, milestone badges, and the Rewards section are hidden
  until a person has logged at least one volunteer hour** (`volunteerHours > 0`),
  not gated on the "Volunteer" role checkbox — an occasional, unflagged volunteer
  still gets full credit and visibility once they've logged a session. Foot traffic
  stays visible for everyone; it's the only stat shown at 0 volunteer hours. The
  Check-In "Volunteer session" checkbox is unaffected — it stays available for
  everyone, since that's how hours start.
- **Merged the `watch` and `heads_up` flag levels into one** (kept as `watch` in
  the DB/CSS/label — they were functionally identical, just a different color and
  icon). New `runOnce()` migration `merge_heads_up_into_watch` converts any
  existing `heads_up` rows; `schema.sql`'s CHECK constraint narrowed for new
  databases. The flag-add form now offers only Watch / Banned.
- **Reports is now the single hub for all reporting.** Added `getVolunteerRoster()`
  to `lib/hours.ts` (everyone with any logged volunteer hours, sorted by hours
  descending). `/reports` gained "Lapsed Members" and "Volunteers" sections (reusing
  the existing `getLapsedPeople()`); the standalone `/memberships/lapsed` page and
  its top-nav link were deleted; `revalidatePath('/memberships/lapsed')` calls
  scattered across `app/people/actions.ts` and `app/reports/actions.ts` were
  updated to `revalidatePath('/reports')`.

### Verified

Typecheck and `npm run build` pass (`/memberships/lapsed` confirmed gone from the
build's route list). Migration correctness verified the same way as the earlier
site-lead fix: hand-built a SQLite DB with a `heads_up` flag row (simulating
already-deployed production data), ran the new migration logic against it, confirmed
the row flipped to `watch`, and confirmed a second `migrate()` run left it unchanged
(idempotent). Browser-driven (Playwright) end-to-end: empty `/people` search shows
the new prompt, not a list; loaded sample data and confirmed the 0-hour sample
people (Larry Lapsed, Patty Patron, Banned Bob, Watchful Wendy) show **only** Foot
traffic with no Volunteer hours/badges/Rewards, while the >0-hour sample people
(Vera, Rookie, Mia) still show all three; the flag-level dropdown only offers Watch
and Banned; Wendy's pre-existing "watch" banner still renders correctly; `/reports`
shows both new sections with correct data (Larry in Lapsed Members, the three
volunteers sorted by hours with milestone labels in Volunteers, 0-hour people
correctly excluded); `/memberships/lapsed` returns 404; the top nav no longer shows
"Lapsed Members". Zero console errors (aside from the test's own intentional 404
check).

## Restrict the "Volunteer session" check-in checkbox to Volunteer-flagged people (complete)

**Date:** 2026-07-18

Follow-up feedback: the check-in checkbox should only appear for people flagged
"Volunteer" on their profile (`is_staff = 1`), not for everyone. This reverses part
of the "gate on actual hours, not the role flag" decision from earlier the same day —
flagged to Nick before implementing: it means a person now needs to be marked
"Volunteer" via Edit *before* their first-ever volunteer session can be logged; there's
no more spontaneous one-off volunteering for someone who isn't flagged. Confirmed and
implemented as asked.

### What was built

- **`app/people/checkin-form.tsx`** — new required `showVolunteerOption: boolean`
  prop; the "Volunteer session" checkbox only renders when true. When false, the
  form is just a plain "Check In" button (an ordinary, non-volunteer visit).
- **`app/people/page.tsx`** and **`app/people/[id]/page.tsx`** — both `<CheckInForm>`
  call sites now pass `showVolunteerOption={person.is_staff === 1}`.

Note the resulting edge case (verified, not a bug): a person with real, already-earned
volunteer hours (e.g. someone who volunteered before ever being flagged "Volunteer")
still sees their hours/badges/Rewards on their profile — those stay gated on actual
hours per the earlier decision — but can't log *additional* volunteer sessions until
someone flags them "Volunteer" via Edit. The two gates (display vs. logging) are now
intentionally different.

### Verified

Typecheck and `npm run build` pass. Browser-driven (Playwright): every sample person
without the Volunteer flag (Bob, Larry, Mia, Patty, Wendy) shows no checkbox in
either the `/people` list rows or their profile's Check In section — just a plain
Check In button; Vera (flagged Volunteer) still shows the checkbox in both places;
Rookie (not flagged, but already has 12.5 real hours from seed data) still shows
Volunteer hours/badges/Rewards on their profile but has no checkbox to log more;
confirmed a plain check-in for a non-volunteer (Patty) still works and correctly
does not add to volunteer hours. Zero console errors.

## Code-review fixes: timezone, check-in downgrade, export hardening, tests (complete)

**Date:** 2026-07-18

Nick asked for a full evaluation of the build before showing it to another
developer. The review found three real bugs (each reproduced against the real
schema before fixing) plus hardening/hygiene gaps. All fixed, with regression
tests.

### Bugs fixed

- **Timezone (the big one)** — every date in the app was UTC, but the shop runs
  Eastern evenings: UTC midnight is 8:00pm EDT / 7:00pm EST, mid-shift. Check-ins
  after that got stamped with *tomorrow's* date, breaking the one-visit-per-day
  rule (double-counting foot traffic and volunteer hours), bleeding reports
  across month boundaries, and flipping membership expiry hours early. New
  **`lib/dates.ts`** (`SHOP_TIMEZONE = 'America/New_York'`, `todayISO()`,
  `addDaysISO()`, `oneYearFrom()`) is now the single source of date truth;
  `todayISO`/`oneYearFrom` moved here out of `lib/memberships.ts`. `checkIn()`
  passes `visit_date` explicitly instead of relying on SQLite's UTC
  `date('now')` default; export's expiry math, seed backdating, and the reports
  page's default period all use it too.
- **Volunteer-session downgrade** — `checkIn()`'s upsert overwrote
  `is_volunteer` with the latest submission, so a plain re-check-in the same
  evening silently erased an already-logged 2.5-hour session. Now
  `is_volunteer = MAX(is_volunteer, excluded.is_volunteer)`: upgrades allowed,
  downgrades never.
- **Duplicate lapsed-list rows** — two membership rows sharing the same latest
  `end_date` (e.g. a double-click on Record / Renew) made `getLapsedPeople()`
  return the person twice. Fixed with `GROUP BY p.id`.

### Hardening & hygiene

- **Export routes check auth themselves** — `/export/csv` and `/export/json`
  (the app's biggest PII dump) relied solely on `proxy.ts`; middleware-bypass
  bugs are a known Next.js CVE genre. Both handlers now 401 without a valid
  session via a new `isAuthenticated()` helper in `lib/auth.ts` (also reused by
  `app/layout.tsx` and `requireAuth`).
- **`email_opt_out` actually respected in exports** — opted-out people keep
  their row (hours, membership status) but the email column is blanked, so the
  address never leaves the app. Decision by Nick via AskUserQuestion.
- **Login hardening** — credentials compared with `crypto.timingSafeEqual`, and
  a flat 1-second delay on failed attempts to blunt brute-forcing.
- **Startup race fixed** — `next build`'s parallel workers all opening a
  brand-new DB file raced on schema creation (`SQLITE_BUSY`). `lib/db.ts` now
  sets a 10s busy timeout and retries the idempotent schema+migrate step on
  contention (sync sleep via `Atomics.wait`).
- **Dependencies pinned exactly** (per CLAUDE.md's own convention — several had
  drifted to `^` ranges). Known `npm audit` findings are 2 moderates, both
  transitive via `next` itself (postcss), with no non-breaking fix — accepted.
- **README rewritten** — was still create-next-app boilerplate; now documents
  env vars (with a committed `.env.local.example`), local setup, tests, and
  deployment.

### Tests (new)

`npm test` — 22 unit tests in `tests/` via Node's built-in `node:test` runner +
`tsx` (the one new dev dependency), against an in-memory SQLite DB
(`DATABASE_PATH=:memory:`), sub-second. Covers: date/timezone helpers, person
CRUD + search, one-visit-per-day upsert, **regression tests for all three
bugs**, membership status boundaries (including expiring-today), lapsed-list
dedup, hours/milestone math, volunteer roster ordering, reward tier unlock →
redeem → UNIQUE backstop, export opt-out blanking, active-vs-resolved flags in
export, and CSV escaping.

### Verified

`npm test` (22/22), `npx tsc --noEmit`, and `npm run build` all clean — build
re-run against a brand-new DB to confirm the worker-race fix. Browser-driven
(Playwright): unauthenticated export requests blocked; wrong password rejected
with the ~1s delay; authenticated CSV/JSON exports return correct headers and
all 7 sample rows; reports sections correct; Vera's volunteer check-in
(32.5 → 35 hrs) survives a plain same-day re-check-in (still 35 — the downgrade
regression); visit history stamped with the Eastern date; sample data
load/clear round-trip. One dev-only `performance.measure` pageerror from
Next.js internals (not app code) — does not occur in production builds.

### Not changed (evaluation findings deferred by choice)

Search by "Last First" order or phone number; `year_of_birth` validation; the
reports "lapsed members" metric counting not-yet-expired same-period
memberships; modal focus trap; a `lib/config.ts` consolidating per-shop
constants (org name, timezone, hours-per-session, tiers) as the first step
toward offering the app to other co-ops; off-box database backups before
go-live.

## Add a 30-hour milestone badge (complete)

**Date:** 2026-07-18

Added `30` to `MILESTONES` in `lib/hours.ts` so the badge row (and celebration
toast / reports milestone labels) has a step matching the 30-hour Earn-a-Bike
reward tier. Pure constant change — milestones are computed live, never stored,
so no migration. Tests extended for the new threshold; 22/22 pass, typecheck
clean.

## Phase 6 — Freehub CSV import (complete, pending real-file validation)

**Date:** 2026-07-19

Nick asked to do Phase 6 without having the legacy CSV export in hand yet, so
the import was built against the exact format Freehub's own code produces —
cloned the repo again and read `Person::CSV_FIELDS` / `to_csv` in
`app/models/person.rb`. Notable findings from the source: the people export's
`postal_code` column genuinely appears twice; booleans serialize as
true/false; `created_at` is `YYYY-MM-DD HH:MM`; and the people export carries
only the *latest* `membership_expires_on` date, not full membership history
(that lives in the separate Services report, which we deliberately skip —
latest expiry is enough for current/lapsed status). Import flow decisions from
Nick: one-shot with a results summary (no preview step), people CSV only.

### What was built

- **`lib/import.ts`** — `parseCSV()` (minimal RFC-4180 parser: quoted fields,
  escaped quotes, embedded commas/newlines, CRLF — no new dependency) and
  `importFreehubPeople()`. Strict positional header validation up front — a
  non-matching file errors out with the expected-vs-got column lists before
  any row is touched. Whole import runs in one `db.transaction`. Per row:
  skip (with reason) on wrong column count or missing name; `staff` →
  `is_staff` (`is_site_lead` stays 0 — site leads get flagged by hand);
  `email_opt_out`, address, `yob` → `year_of_birth`, `tag_list` → `tags`,
  legacy `created_at` preserved; `membership_expires_on` → one membership with
  start = one year before end (`oneYearBefore()` added to `lib/dates.ts`),
  logged_by "Freehub import".
- **Re-runnability** — new `people.freehub_id INTEGER` column (schema.sql +
  `ensureColumn` migration). Match order: freehub_id first; else exact
  case-insensitive first+last+email match *adopts* a person hand-entered
  before the import (sets their freehub_id, no duplicate); else create.
  Matched people are left completely unchanged — re-importing never overwrites
  edits made in the app. Memberships dedupe on (person, end_date).
- **UI** — "Legacy Import (Freehub)" section on `/reports`
  (`app/reports/import-form.tsx`, `importFreehubAction`): file upload, 10 MB
  sanity cap, results summary (created / already present / memberships added)
  plus a per-row list of skipped rows with reasons.
- **Tests** — `tests/import.test.ts` (6 tests, suite now 28): parser edge
  cases, header rejection, field mapping + membership reconstruction,
  re-run-changes-nothing, adopt-don't-duplicate, bad-row skipping.

### Verified

28/28 tests, typecheck, production build all clean. Browser-driven
(Playwright) with a fake 3-person Freehub CSV: first import → 3 created /
2 memberships; Fern shows Volunteer + active membership through 2026-11-30
with legacy tags and no volunteer-hours stat (starts at zero); Otto (quoted
"Otto, Sr." name) shows lapsed 2024-03-15 + opted out; re-running the same
file → 0 created / 3 already present / 0 memberships and exactly one Fern in
search; a wrong-format CSV is rejected with the clear header error. Zero
console errors.

### Outstanding

The import has not yet been run against a *real* Freehub export — validate
with the actual file before go-live (the strict header check means a format
surprise fails loudly, not silently).

## Lapsed-member renewal emails — queue + one-click send, dry-run mode (complete)

**Date:** 2026-07-19

First deliberate amendment to CLAUDE.md's "no email" rule, planned in Plan Mode
with decisions locked via AskUserQuestion: **queue + one-click send** (Nick
chose the review step over fully-automatic — which also eliminated all
cron/scheduler infrastructure; the queue is computed live and sending is a
server action), **lapsed notice only** (no pre-expiry reminder yet), sent
**once per lapse, 7 days after expiry** (grace week so in-person renewals never
get emailed), and **provider undecided → ship in dry-run mode** (Nick wasn't
sure whether the co-op has a domain for Resend vs. using co-op Gmail).

### What was built

- **`lapse_emails` table** (schema.sql only — `CREATE TABLE IF NOT EXISTS`
  auto-applies to the deployed DB, no `ensureColumn` needed for a new table).
  `UNIQUE(person_id, membership_end_date)` is the once-per-lapse guarantee:
  re-clicking Send can never double-email; renew-then-lapse-again gets a new
  end_date, so a new notice is correctly allowed.
- **`lib/email.ts`** — `sendEmail()`, the app's single email exit point.
  Resend API via plain fetch (zero new dependencies). With no
  `RESEND_API_KEY`, it dry-runs: logs the full email to the server console and
  reports `dryRun: true`, which is recorded as status `dry_run` in the log.
- **`lib/lapse-emails.ts`** — `LAPSE_GRACE_DAYS = 7` (tunable);
  `getLapseEmailQueue()` (latest-membership subquery reused from
  `getLapsedPeople`, filtered on email present / not opted out / no active
  banned flag / not already sent for this lapse); `renderLapseEmail()`
  (editable plain-text template); `recordLapseEmail()`;
  `getRecentLapseEmails()`.
- **UI** — "Lapsed-Member Emails" section on `/reports`: rule explanation,
  live queue (name/email/expiry), "Send N renewal emails" button
  (`lapse-email-form.tsx` + `sendLapseEmailsAction`, which recomputes the
  queue server-side rather than trusting the page), result summary with a
  dry-run banner, failures listed and left queued for retry, and a
  "Recently sent" log with status/timestamp/site-lead attribution.
- Docs: CLAUDE.md out-of-scope bullet amended + new "Lapsed-member emails"
  section; README + `.env.local.example` document `RESEND_API_KEY`/`EMAIL_FROM`.

### Also fixed (caught by browser verification)

`clearSampleData()` crashed with a FOREIGN KEY error after a lapse email was
recorded for a sample person — the new `lapse_emails` table wasn't in its
delete list. Added it, plus a regression test.

### Verified

38/38 tests (10 new: grace boundary, every exclusion rule, banned-resolve
re-queue, watch-doesn't-block, once-per-lapse + UNIQUE backstop,
renew-re-queue, template content, dry-run send, seed cleanup regression);
typecheck + build clean. Playwright (dry-run): only Larry queued from sample
data; Send → dry-run summary, queue empties, log shows Larry with "dry run",
button disappears; state survives reload; server console shows the full email
text; re-visiting cannot re-send. Zero console errors after the seed fix.

### To actually send email (later)

Decide provider: co-op domain + Resend (set `RESEND_API_KEY` + `EMAIL_FROM` on
Render, ~3 DNS records) or swap ~20 lines in `lib/email.ts` for Gmail SMTP.
Everything else is done.

## Visual redesign — "clean modern utility" refresh of app/globals.css (complete)

**Date:** 2026-07-21

Nick asked about shadcn/ui for styling. Declined: it requires Tailwind + Radix,
reversing CLAUDE.md's explicit "no Tailwind, no component libraries — plain
CSS" decision and adding a build pipeline the app doesn't need. Agreed instead
to refresh the existing plain CSS, since the actual complaint was that it
looked "hamfisted" — genuinely true on inspection: `h1`/`h2`/`h3` had **zero**
styling (raw browser defaults), no shadows/elevation anywhere, no hover/active/
focus-visible states, no transitions, one flat accent hex doing every job.
Direction locked via AskUserQuestion: clean modern utility (shadows, real type
scale, interactive feedback), keep the green accent but formalize it as a
token system, and — a late addition — make Reports denser than the rest of the
app (it's site-lead desk use, not a front-desk check-in flow, so it doesn't
need the same maximized touch targets).

### What was built

**CSS-only. Zero JSX/component changes except one class.** Every existing
class name (`.btn-primary`, `.person-row`, `.badge`, `.flag-banner`, etc.)
stays exactly as-is across every `.tsx` file — this is entirely a rewrite of
`app/globals.css`, plus adding `className="dense"` to the `<main>` wrapper in
`app/reports/page.tsx`.

- **Token system** — expanded `:root` (+ dark-mode block): `--surface`
  (card/row background, distinct from page `--background`), `--border-strong`,
  a split accent (`--accent`/`--accent-hover`/`--accent-active`/
  `--accent-soft`, replacing one flat hex reused everywhere), `--focus-ring`,
  a `--shadow-sm`/`--shadow-md` pair (different opacities for light vs. dark —
  dark backgrounds need stronger shadows to read as elevated), and a radius
  scale (`--radius-sm/md/lg`). Renamed `--watch-bg`/`--watch-fg` →
  `--watch-soft`/`--watch` and added `--danger-soft` to match the naming
  convention (confirmed via grep that no `.tsx` file references CSS variables
  directly — plain CSS only — so the rename was safe).
- **Typography** — real `h1`/`h2`/`h3` sizing/weight/line-height/letter-
  spacing for the first time. Kept the system-ui font stack (no web font, no
  network fetch at build — matches the earlier decision to drop Geist).
- **Interactive states** — every button/input/row/badge gets a ~150ms
  transition plus real hover/active/focus-visible treatment (buttons shade +
  lift on hover, `.person-row` border brightens on hover, inputs get a
  color-ring focus state replacing the plain default outline).
- **Elevation** — `.card`, `.person-row`, `.modal-card`, `.badge.achieved`
  pick up shadows and the new radius scale instead of flat borders alone; the
  banned modal's overlay gets `backdrop-filter: blur(2px)`.
- **`.dense` scope** — new Reports-only rules (smaller `h2`, tighter
  `.person-row`/`.stat`/input/button sizing) that only apply inside
  `main.dense`. Every other page — People, check-in, profile, all forms,
  login — is completely unaffected; still full touch-target sizing per
  CLAUDE.md's front-desk requirement.

### Verified

`npm test` (38/38, unaffected — no logic touched), `tsc --noEmit`, `npm run
build` all clean. Full Playwright screenshot pass in both light and dark
(`page.emulateMedia`) across login (incl. a forced focus state), People empty
state, People search results (incl. hover state), a fully-populated profile
(badges, rewards, active membership, stats — Vera), the banned blocking modal
(Bob), the watch banner (Wendy), the new-person form, and Reports — plus a
390px mobile-width pass on the profile and Reports pages. Confirmed: readable
heading hierarchy for the first time, visible hover/focus feedback, watch/
danger/badge contrast holds in both themes, the Reports density difference is
clearly visible next to the full-size People/profile pages, no layout breakage
at mobile width, banned modal correctly blocks interaction with a blurred
backdrop. One console warning (hydration mismatch from a `caret-color`
attribute injected by Chromium/Playwright automation on the login inputs) is
unrelated to this change — confirmed via grep that `caret-color` doesn't
appear anywhere in the new CSS.

## Wayfinding restyle — chose a direction from the 4-concept comparison (complete)

**Date:** 2026-07-21

Following the shadcn conversation ("far less hamfisted") and the dark-mode
removal, Nick asked for real visual direction suggestions. Had 4 agents each
independently build a full working mockup (same real class names/content, so
they'd translate directly) in a genuinely different aesthetic — Workshop
(earthy/mechanic's-ledger), Community (soft/pastel/rounded), Wayfinding
(bold bike-lane signage), Editorial (restrained/serif) — assembled into one
comparison page (Shadow DOM per concept so overlapping class names like
`.btn-primary` never collided across tabs) and published as an artifact.
Nick picked **Wayfinding**.

### What was built

Applied the wayfinding language to the real `app/globals.css` — same approach
as the prior redesign: CSS-only, zero component changes (the `.dense` class
on Reports' `<main>` was already there from before). Key moves:
- **Token system**: bike-lane green (`--accent`) + signal yellow (`--yellow`)
  + navy (`--navy`) on sign-paper background, near-black ink, reserved
  stop-sign red for banned/danger only. Radius scale flattened to 3px
  everywhere (blocky, not rounded) and `--shadow-sm/md` now point at flat
  offset "hard shadows" (`3px 3px 0 var(--foreground)`) that lift on hover
  and press on click, instead of the previous soft blurred shadows.
- **Typography**: headings/buttons/labels/nav go uppercase + letter-spaced,
  simulating a display face via the system stack (no web font, no network
  fetch — same constraint as before).
- **Distinctive details carried over from the mockup**: a subtle repeating
  grid-line texture on the page background (trail-map graph paper); a
  colored left-edge stripe on `.person-row` (trailhead blaze); stats as solid
  navy blocks with yellow labels; a diagonal yellow hazard-stripe treatment
  on `.flag-banner.watch`; forms (`.stack`) now render as a bordered,
  hard-shadowed card — with a `.card .stack` override so the login form
  (already inside `.card`) doesn't get double-boxed; a small CSS-only
  `::before` bike-emoji brand mark injected into the top nav (no JSX change).

### Bug found and fixed during verification

The concept mockup used circular medallions for milestone badges (`5 hrs`,
`10 hrs`, ...), but `.badge`/`.badge-row` in the **real** app is also reused
for free-text person tags (`sample-data`, `mechanic`, arbitrary length) —
fixed-width circles broke and overflowed for longer tag text. Since the real
DOM has no way to distinguish tag-badges from milestone-badges without a JSX
change (both use the exact same classes), fixed `.badge` to an auto-width
chip instead of a forced circle — kept the bold border/shadow/yellow-achieved
treatment, dropped the fixed circle shape. Verified clean on both short
milestone text and long tag text after the fix.

### Verified

`npm test` (38/38, unaffected), `tsc --noEmit`, `npm run build` all clean.
Full Playwright pass across the real app (not just the mockup) — login,
People empty/search states, a fully-populated profile (Vera: badges, rewards,
active membership, stats, tags), the banned blocking modal (Bob), the watch
hazard-stripe banner (Wendy), the new-person form, and Reports' `.dense`
scope — plus a 390px mobile pass on the profile and Reports. Zero console
errors. Confirmed the badge fix specifically: tags render as readable chips,
milestones keep their bold yellow-achieved treatment.

## One Check In page + Turso database + keep-awake health check (complete)

**Date:** 2026-11-11

### Why

- Michael's feedback: don't have two front-desk tabs (Volunteers and Guests).
- Nick wants to build and test Slack signup on Render's free tier before
  paying. Free Render wipes local files on every deploy and restart, and
  sleeps after 15 idle minutes (about a minute to wake; Slack gives up after
  3 seconds). Nick chose free Render + a keep-awake ping + Turso (free, SQLite
  compatible) over MongoDB (would mean rewriting every query) and Render
  Starter + disk (about $7/month).

### What changed

- **Check In page** (`/checkin`, `app/front-desk.tsx`): one search over
  everyone. Volunteer-marked people get Guest and Volunteer buttons, everyone
  else one Check In button, banned people "See why". Right column: Signed up
  for tonight, Volunteers here today, Guests here today. `/`, `/guests`,
  `/volunteers`, `/shift`, `/people` redirect here. Tabs: Check In, Schedule,
  Reports.
- **Database** (`lib/db.ts`): `better-sqlite3` replaced by `@libsql/client`
  0.18.0. Turso when `TURSO_DATABASE_URL` is set, else a local file
  (`DATABASE_PATH`), `:memory:` for tests and during `next build`. Same schema
  and SQL; every query is now async (`db.all/get/run`, plus `db.batch` and a
  short `db.transaction`). Migrations run once per process on the first query.
- The export (`getExportRows`) now uses two queries total instead of three per
  person, and the legacy import is one all-or-nothing batch with ids assigned up
  front (Turso cancels interactive transactions after 5 seconds, and each
  statement is a network round trip). Search results carry the flag level, so
  no per-row flag lookups.
- **`/api/health`**: public, no database, `{ ok: true }`, for cron-job.org.

### Verified

`npm test` 65/65 (adds tests for the database choice and two for the batched
import), `tsc --noEmit`, `npm run lint` (only the 2 existing warnings),
`npm run build`. A one-off type-aware lint found no un-awaited database calls.
Browser click-through against a local libSQL file: every check-in path, the
milestone toast, move/check out, Signed up for tonight, add person, all
redirects, profile, schedule, reports, CSV/JSON export, and no sideways scroll
at 390px and 320px. Not yet run against a real Turso database (needs Nick's
account); first check after setup: `/api/health`, then log in and load a page.
