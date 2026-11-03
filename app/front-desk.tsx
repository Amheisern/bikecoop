import Link from 'next/link'
import { getPeopleCheckedInToday, searchPeople, SEARCH_LIMIT, type CheckedInPerson } from '@/lib/people'
import { getTopFlagLevel } from '@/lib/flags'
import { FlagPill } from './flag-pill'
import { CheckInForm } from './people/checkin-form'
import { PeopleSearch } from './people/people-search'
import { TodayRoster } from './today-roster'

export type FrontDeskTab = 'volunteers' | 'guests'

// The two front-desk tabs share one layout: search on the left, today's
// check-ins for that tab on the right.
// - Volunteers: searches only people marked Volunteer; Check In logs a
//   2.5-hour volunteer session.
// - Guests: searches everyone (volunteers too, on nights they're just working
//   on their own bike); Check In logs a plain visit.
export function FrontDesk({ tab, query }: { tab: FrontDeskTab; query: string }) {
  const isVolunteers = tab === 'volunteers'
  const path = `/${tab}`
  const people = searchPeople(query, { volunteersOnly: isVolunteers })
  const checkedInToday = getPeopleCheckedInToday()
  const todayById = new Map(checkedInToday.map((person) => [person.id, person]))
  const roster = checkedInToday.filter((person) => (person.is_volunteer_visit === 1) === isVolunteers)

  return (
    <main>
      <h1 className="visually-hidden">{isVolunteers ? 'Volunteers' : 'Guests'}</h1>
      <div className="shift-layout">
        <section className="shift-lookup">
          <h2>{isVolunteers ? 'Check in a volunteer' : 'Check in a guest'}</h2>
          <PeopleSearch query={query} path={path} />

          <ul className="person-list">
            {people.map((person) => {
              const flagLevel = getTopFlagLevel(person.id)
              const status = hereTodayLabel(todayById.get(person.id), isVolunteers)
              return (
                <li key={person.id} className="person-row">
                  <span className="name">
                    <Link href={`/people/${person.id}`}>
                      {person.first_name} {person.last_name}
                    </Link>
                    {flagLevel && <FlagPill level={flagLevel} />}
                    {status && <span className="here-today">{status}</span>}
                  </span>
                  {flagLevel === 'banned' ? (
                    // Banned people go through their profile, where the
                    // blocking modal must be dismissed before check-in.
                    <Link href={`/people/${person.id}`} className="btn-secondary">
                      See why
                    </Link>
                  ) : (
                    <CheckInForm personId={person.id} volunteer={isVolunteers ? 'yes' : 'no'} />
                  )}
                </li>
              )
            })}
            {people.length === 0 && query.trim() && (
              <p className="muted">
                {isVolunteers ? (
                  <>
                    No volunteers match. Only people marked Volunteer on their profile show here.{' '}
                    <Link href={`/guests?q=${encodeURIComponent(query.trim())}`}>Search Guests instead</Link>.
                  </>
                ) : (
                  'No matches.'
                )}
              </p>
            )}
            {people.length === 0 && !query.trim() && (
              <p className="muted">
                {isVolunteers
                  ? 'Search for a volunteer by name or email to check them in for a volunteer session (2.5 hours).'
                  : 'Search for a person by name or email to check them in.'}
              </p>
            )}
          </ul>
          {people.length === SEARCH_LIMIT && (
            <p className="muted search-hint">
              Showing the first {SEARCH_LIMIT} matches. Keep typing to narrow it down.
            </p>
          )}
        </section>

        <TodayRoster tab={tab} people={roster} />
      </div>
    </main>
  )
}

// A short note in search results for people already checked in today, so a
// volunteer who's on the other tab tonight isn't a mystery.
function hereTodayLabel(visit: CheckedInPerson | undefined, isVolunteersTab: boolean): string | null {
  if (!visit) return null
  const volunteering = visit.is_volunteer_visit === 1
  if (volunteering === isVolunteersTab) return 'Checked in'
  return volunteering ? 'Checked in as a volunteer' : 'Checked in as a guest'
}
