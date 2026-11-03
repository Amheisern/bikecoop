# Volunteer shifts plan

Status (Nov 3, 2026): **Phase 1 built** (branch `volunteers-guests-tabs`). Phases 2
and 3 are direction, not approved builds. Confirm the open questions with Nick
before starting any phase.

## Decisions so far (from Nick)

- The UI calls the site-lead role "Shift lead".
- Front-desk check-in splits into two tabs: **Volunteers** (volunteer check-in,
  later scheduling) and **Guests** (everyone else).
- Only people marked Volunteer (`is_staff = 1`) can be checked in as volunteers.
- Regular shift nights: **Mon, Tue, Thu, 6:00 to 8:30pm**, the same every week.
- Named roles per night: **Shift lead, Mechanic, Greeter / front desk**.
- Replace SignUpGenius. Signing up must be very easy. Nick's preference is Slack:
  volunteers tap a button under a night in a bot-posted message (tap again to
  cancel).
- Nick is a Slack workspace admin and can install the app.

## Phase 1: Volunteers and Guests tabs (built)

Goal: replace the single Shift page with two front-desk tabs. No schema change.

- Tabs: Volunteers, Guests, Reports (People merged into Guests; see below).
- **Volunteers tab:** search only people marked Volunteer. Check In logs a
  volunteer session (2.5 hours) and shows the milestone toast. Below it, the
  volunteers checked in today, with check out / delete visit.
- **Guests tab:** search everyone. Check In logs a plain visit. Banned people get
  "See why" (their profile, with the blocking modal) instead of Check In, as on
  Shift today. Below it, the guests checked in today, with check out / delete visit.
- Switching someone between volunteer and guest for today (the current drag
  between columns) becomes a button on the tile, with the existing confirmation.
  Only Volunteer-marked people can move to Volunteers.
- Reuse what exists: `searchPeople`, `checkIn`, `getPeopleCheckedInToday`, the
  promote / demote / check-out / delete actions, `FlagPill`, `PeopleSearch`.

Answered by Nick (Nov 3, 2026):

- Home page (`/` redirect): **Guests**.
- Someone not marked Volunteer: **Guests only**. Volunteer-marked people show on
  both tabs and choose per night (e.g. Nick on a night he's working on his own
  bike checks in as a guest). Everyone else appears only on Guests.
- `/shift`: kept as a redirect to Guests for old bookmarks.
- A Volunteer-marked person with an active banned flag gets "See why" on the
  Volunteers tab too, same as Guests.
- Added later the same day: the **People tab merges into Guests**. Guests always
  shows a "Not listed? Add a new person" link, with a big button when a search
  finds nobody. The form isn't prefilled from the search. Saving adds the person
  and checks them in as a guest, then returns to Guests. `/people` redirects to
  `/guests`. Tabs are now Volunteers, Guests, Reports.

## Phase 2: weekly schedule with named roles (in-app, not yet approved)

Proposed shape, following existing conventions (code constants over tables, like
`REWARD_TIERS`):

- `lib/shifts.ts`: `SHIFT_NIGHTS` (Mon, Tue, Thu) and `SHIFT_ROLES` (shift lead,
  mechanic, greeter, each with a slot count). Shift dates are computed, not stored.
- New table `shift_signups (id, person_id, shift_date, role_id, source,
  created_at, UNIQUE(person_id, shift_date))`, with the per-role slot cap checked
  in code.
- The Volunteers tab shows tonight's signups as "expected"; one tap checks an
  expected person in. Signing up never logs hours; only check-in does.
- A schedule view (next 2 to 4 weeks) for signing people up from inside the app.

Open questions: slots per role per night; whether one person can hold two roles
on a night; how far ahead signups open; how cancellations work.

## Phase 3: Slack signup (not yet approved)

- A Slack app posts upcoming nights in a channel with one button per open role.
  Tapping signs up, tapping again cancels, and the message updates in place.
- Slack users are matched to people by email (`users:read.email`). Unmatched users
  get a reply asking them to see a shift lead.
- Needs Render Starter plus a persistent disk at `/var/data` with `DATABASE_PATH`
  set. The free tier sleeps, which breaks Slack's 3-second response limit, and its
  database resets on every deploy.
- Needs `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN`. No SDK: plain `fetch`, like
  `lib/email.ts`.
- Open question: how the weekly message gets posted. The app has no scheduler by
  design. Options: a "Post next week's shifts" button for a shift lead, or a
  Render cron job.

## Deployment notes (current)

- Repo: github.com/Amheisern/bikecoop. (Moved from amheiser/bikecoop, which is
  frozen because that account is locked.)
- Render: service `bikecoop` in the coop workspace, Free plan, Virginia,
  https://bikecoop-s8tg.onrender.com. Build `npm ci && npm run build`, start
  `npm run start`, `NODE_VERSION=22`.
- `lib/db.ts` uses an in-memory database during `next build` (`NEXT_PHASE`) so
  parallel build workers don't hit SQLITE_BUSY.
