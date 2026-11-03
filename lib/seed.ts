import { db } from '@/lib/db'
import { todayISO, addDaysISO } from '@/lib/dates'
import { createPerson } from '@/lib/people'
import { createMembership } from '@/lib/memberships'
import { createFlag } from '@/lib/flags'
import { createNote } from '@/lib/notes'
import { signUpForShift, upcomingShiftDates } from '@/lib/shifts'

// Every sample person is tagged with this so they're easy to find and
// safely removable as a group via clearSampleData().
export const SAMPLE_TAG = 'sample-data'

const SEEDED_BY = 'Sample Data'

function isoDaysFromToday(offsetDays: number): string {
  return addDaysISO(todayISO(), offsetDays)
}

function insertBackdatedVisit(personId: number, dayOffset: number, isVolunteer: boolean) {
  db.prepare(
    `INSERT INTO visits (person_id, visit_date, is_volunteer, logged_by) VALUES (?, ?, ?, ?)`
  ).run(personId, isoDaysFromToday(dayOffset), isVolunteer ? 1 : 0, SEEDED_BY)
}

const blankAddress = {
  street1: null,
  street2: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
}

export function seedSampleData(): void {
  // 1. Patron: no membership, no visits, no flags — the bare-minimum profile.
  createPerson({
    firstName: 'Sample Patty',
    lastName: 'Patron',
    email: null,
    phone: null,
    isStaff: false,
    isSiteLead: false,
    emailOptOut: false,
    ...blankAddress,
    yearOfBirth: null,
    tags: SAMPLE_TAG,
  })

  // 2. Active member with a mixed visit history and a note.
  const miaId = createPerson({
    firstName: 'Sample Mia',
    lastName: 'Member',
    email: 'mia@example.com',
    phone: '555-0102',
    isStaff: false,
    isSiteLead: false,
    emailOptOut: false,
    street1: '456 Elm St',
    street2: null,
    city: 'St. Petersburg',
    state: 'FL',
    postalCode: '33701',
    country: 'US',
    yearOfBirth: 1985,
    tags: `${SAMPLE_TAG}, longtime`,
  })
  createMembership({ personId: miaId, startDate: isoDaysFromToday(-180), endDate: isoDaysFromToday(185), loggedBy: SEEDED_BY })
  insertBackdatedVisit(miaId, -30, false)
  insertBackdatedVisit(miaId, -14, true)
  insertBackdatedVisit(miaId, -3, false)
  createNote({ personId: miaId, text: "Very reliable, great with kids' bikes.", loggedBy: SEEDED_BY })

  // 3. Lapsed member.
  const larryId = createPerson({
    firstName: 'Sample Larry',
    lastName: 'Lapsed',
    email: 'larry@example.com',
    phone: null,
    isStaff: false,
    isSiteLead: false,
    emailOptOut: false,
    ...blankAddress,
    yearOfBirth: null,
    tags: SAMPLE_TAG,
  })
  createMembership({ personId: larryId, startDate: isoDaysFromToday(-420), endDate: isoDaysFromToday(-55), loggedBy: SEEDED_BY })
  insertBackdatedVisit(larryId, -300, false)

  // 4. Volunteer rookie: 5 volunteer visits = 12.5 hrs, past the 5hr/10hr
  // milestones and the 10hr reward tier (so "Redeem" is testable), short of 20/30.
  const rookieId = createPerson({
    firstName: 'Sample Rookie',
    lastName: 'Volunteer',
    email: null,
    phone: null,
    isStaff: false,
    isSiteLead: false,
    emailOptOut: false,
    ...blankAddress,
    yearOfBirth: null,
    tags: SAMPLE_TAG,
  })
  ;[-2, -9, -16, -23, -30].forEach((offset) => insertBackdatedVisit(rookieId, offset, true))

  // 5. Dedicated staff + site lead volunteer: 13 volunteer visits = 32.5 hrs,
  // past the 30hr Earn-a-Bike reward tier too, plus an active membership.
  const veraId = createPerson({
    firstName: 'Sample Dedicated',
    lastName: 'Vera',
    email: 'vera@example.com',
    phone: '555-0105',
    isStaff: true,
    isSiteLead: true,
    emailOptOut: false,
    ...blankAddress,
    yearOfBirth: 1978,
    tags: `${SAMPLE_TAG}, mechanic`,
  })
  createMembership({ personId: veraId, startDate: isoDaysFromToday(-100), endDate: isoDaysFromToday(265), loggedBy: SEEDED_BY })
  // Shift signups: lead on the next two shift nights (the first one shows as
  // "expected" on the Volunteers tab when it's tonight), plus mechanic on the
  // second night (two roles) and the third.
  const [firstNight, secondNight, thirdNight] = upcomingShiftDates()
  signUpForShift({ personId: veraId, shiftDate: firstNight, roleId: 'shift_lead', loggedBy: SEEDED_BY })
  signUpForShift({ personId: veraId, shiftDate: secondNight, roleId: 'shift_lead', loggedBy: SEEDED_BY })
  signUpForShift({ personId: veraId, shiftDate: secondNight, roleId: 'mechanic', loggedBy: SEEDED_BY })
  signUpForShift({ personId: veraId, shiftDate: thirdNight, roleId: 'mechanic', loggedBy: SEEDED_BY })
  ;[-1, -4, -7, -10, -13, -16, -19, -22, -25, -28, -31, -34, -37].forEach((offset) =>
    insertBackdatedVisit(veraId, offset, true)
  )

  // 6. Banned — for testing the blocking modal.
  const bobId = createPerson({
    firstName: 'Sample Banned',
    lastName: 'Bob',
    email: null,
    phone: null,
    isStaff: false,
    isSiteLead: false,
    emailOptOut: false,
    ...blankAddress,
    yearOfBirth: null,
    tags: SAMPLE_TAG,
  })
  createFlag({ personId: bobId, level: 'banned', note: 'Sample data: testing the blocking modal.', loggedBy: SEEDED_BY })

  // 7. Watch flag — for testing the colored banner.
  const wendyId = createPerson({
    firstName: 'Sample Watchful',
    lastName: 'Wendy',
    email: null,
    phone: null,
    isStaff: false,
    isSiteLead: false,
    emailOptOut: false,
    ...blankAddress,
    yearOfBirth: null,
    tags: SAMPLE_TAG,
  })
  createFlag({ personId: wendyId, level: 'watch', note: 'Sample data: testing the watch banner.', loggedBy: SEEDED_BY })
}

export function clearSampleData(): number {
  const ids = (db.prepare('SELECT id FROM people WHERE tags LIKE ?').all(`%${SAMPLE_TAG}%`) as { id: number }[]).map(
    (row) => row.id
  )
  if (ids.length === 0) return 0

  const placeholders = ids.map(() => '?').join(',')
  for (const table of ['visits', 'memberships', 'flags', 'notes', 'reward_redemptions', 'lapse_emails', 'shift_signups']) {
    db.prepare(`DELETE FROM ${table} WHERE person_id IN (${placeholders})`).run(...ids)
  }
  db.prepare(`DELETE FROM people WHERE id IN (${placeholders})`).run(...ids)

  return ids.length
}
