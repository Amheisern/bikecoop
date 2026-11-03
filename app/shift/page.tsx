import Link from 'next/link'
import { getPeopleCheckedInToday, searchPeople, SEARCH_LIMIT } from '@/lib/people'
import { getTopFlagLevel } from '@/lib/flags'
import { FlagPill } from '../flag-pill'
import { CheckInForm } from '../people/checkin-form'
import { PeopleSearch } from '../people/people-search'
import { ShiftRoster } from './shift-roster'

export default async function ShiftPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const people = searchPeople(q)
  const checkedInPeople = getPeopleCheckedInToday()

  return (
    <main>
      <h1 className="visually-hidden">Shift</h1>
      <div className="shift-layout">
        <section className="shift-lookup">
          <h2>Check someone in</h2>
          <PeopleSearch query={q} path="/shift" />

          <ul className="person-list">
            {people.map((person) => {
              const flagLevel = getTopFlagLevel(person.id)
              return (
                <li key={person.id} className="person-row">
                  <span className="name">
                    <Link href={`/people/${person.id}`}>
                      {person.first_name} {person.last_name}
                    </Link>
                    {flagLevel && <FlagPill level={flagLevel} />}
                  </span>
                  {flagLevel === 'banned' ? (
                    // Banned people go through their profile, where the
                    // blocking modal must be dismissed before check-in.
                    <Link href={`/people/${person.id}`} className="btn-secondary">
                      See why
                    </Link>
                  ) : (
                    <CheckInForm personId={person.id} showVolunteerOption={person.is_staff === 1} />
                  )}
                </li>
              )
            })}
            {people.length === 0 && q.trim() && <p className="muted">No matches.</p>}
            {people.length === 0 && !q.trim() && (
              <p className="muted">Search for a person by name or email to check them in for this shift.</p>
            )}
          </ul>
          {people.length === SEARCH_LIMIT && (
            <p className="muted search-hint">
              Showing the first {SEARCH_LIMIT} matches. Keep typing to narrow it down.
            </p>
          )}
        </section>

        <ShiftRoster people={checkedInPeople} />
      </div>
    </main>
  )
}
