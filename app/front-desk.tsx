import Link from 'next/link'
import { getPeopleCheckedInToday, searchPeople, SEARCH_LIMIT, type CheckedInPerson, type SearchResult } from '@/lib/people'
import { FlagPill } from './flag-pill'
import { FrontDeskCheckIn } from './front-desk-checkin'
import { PeopleSearch } from './people/people-search'
import { TodayRoster } from './today-roster'
import { ExpectedTonight, type ExpectedRow } from './expected-tonight'
import { getExpectedVolunteers, getShiftRole, getSignupsForDate, upcomingShiftDates } from '@/lib/shifts'
import { todayISO } from '@/lib/dates'

export const FRONT_DESK_PATH = '/checkin'

// The front desk: one page for everyone (Michael's feedback, Nov 2026: one
// tab, not separate Volunteers and Guests tabs), laid out for an iPad. Search
// finds everyone; every row has the same two button slots, Guest and Volunteer
// (Volunteer only for people marked Volunteer), so rows line up. Today's
// check-ins show as two lists, Volunteers and Guests, with tonight's shift
// signups above them.
export async function FrontDesk({ query }: { query: string }) {
  const [people, checkedInToday] = await Promise.all([searchPeople(query), getPeopleCheckedInToday()])
  const todayById = new Map(checkedInToday.map((person) => [person.id, person]))
  const volunteersHere = checkedInToday.filter((person) => person.is_volunteer_visit === 1)
  const guestsHere = checkedInToday.filter((person) => person.is_volunteer_visit !== 1)
  const searched = query.trim() !== ''

  return (
    <main>
      <h1 className="visually-hidden">Check In</h1>
      <div className="shift-layout">
        <section className="shift-lookup">
          <h2>Check in</h2>
          <PeopleSearch query={query} path={FRONT_DESK_PATH} />

          <ul className="person-list">
            {people.map((person) => (
              <SearchRow key={person.id} person={person} here={todayById.get(person.id)} />
            ))}
            {people.length === 0 && searched && (
              <div className="no-match">
                <p className="muted">No one matches &ldquo;{query.trim()}&rdquo;.</p>
                <Link href="/people/new" className="btn-primary">
                  + Add new person
                </Link>
              </div>
            )}
            {people.length === 0 && !searched && (
              <p className="muted">
                Search for a person by name or email, then tap <strong>Guest</strong> (a visit, like working
                on their own bike) or, for people marked Volunteer, <strong>Volunteer</strong> (a 2.5-hour
                volunteer session).
              </p>
            )}
          </ul>
          {people.length === SEARCH_LIMIT && (
            <p className="muted search-hint">
              Showing the first {SEARCH_LIMIT} matches. Keep typing to narrow it down.
            </p>
          )}
          {/* Common names always match someone, so adding is never hidden;
              the big button above covers the no-match case. */}
          {!(people.length === 0 && searched) && (
            <p className="add-person-link">
              Not listed? <Link href="/people/new">Add a new person</Link>
            </p>
          )}
        </section>

        <div className="shift-side">
          <TonightSignups />
          <TodayRoster group="volunteers" people={volunteersHere} />
          <TodayRoster group="guests" people={guestsHere} />
        </div>
      </div>
    </main>
  )
}

function SearchRow({ person, here }: { person: SearchResult; here: CheckedInPerson | undefined }) {
  const name = `${person.first_name} ${person.last_name}`
  const isVolunteer = person.is_staff === 1
  const hereAs = here ? (here.is_volunteer_visit === 1 ? 'volunteer' : 'guest') : null

  return (
    <li className="person-row">
      <span className="name">
        <Link href={`/people/${person.id}`}>{name}</Link>
        {person.flag_level && <FlagPill level={person.flag_level} />}
      </span>
      {person.flag_level === 'banned' ? (
        // Banned people go through their profile, where the blocking modal
        // must be dismissed before check-in.
        <div className="slot-actions">
          <div className="slots">
            <Link href={`/people/${person.id}`} className="btn-secondary slot slot-wide">
              See why
            </Link>
          </div>
        </div>
      ) : (
        // Not here yet: Guest, plus Volunteer for people marked Volunteer.
        // Here as a guest: a Volunteer-marked person can still switch to a
        // volunteer session. Here as a volunteer: nothing to do here (changes
        // happen in today's lists).
        <FrontDeskCheckIn
          personId={person.id}
          personName={name}
          guest={!hereAs}
          volunteer={isVolunteer && hereAs !== 'volunteer'}
          note={hereAs ? `Here as ${hereAs}` : undefined}
        />
      )}
    </li>
  )
}

// "Signed up for tonight". Hidden on nights that aren't shift nights, unless
// someone is signed up anyway.
async function TonightSignups() {
  const today = todayISO()
  const [signups, expected] = await Promise.all([getSignupsForDate(today), getExpectedVolunteers(today)])
  const signedUpCount = new Set(signups.map((signup) => signup.person_id)).size
  const isShiftNight = upcomingShiftDates(today)[0] === today
  if (!isShiftNight && signedUpCount === 0) return null

  const rows: ExpectedRow[] = expected.map((entry) => ({
    personId: entry.person_id,
    name: `${entry.first_name} ${entry.last_name}`,
    roleLabels: entry.role_ids.map((roleId) => getShiftRole(roleId)?.label ?? roleId),
    flagLevel: entry.flag_level,
    checkedInAsGuest: entry.checked_in_as_guest,
  }))
  return <ExpectedTonight rows={rows} signedUpCount={signedUpCount} />
}
