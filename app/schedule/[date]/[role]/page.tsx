import Link from 'next/link'
import { notFound } from 'next/navigation'
import { searchPeople, SEARCH_LIMIT } from '@/lib/people'
import { formatShiftDate, getShiftRole, getSignupsForDate, isOpenShiftDate } from '@/lib/shifts'
import { FlagPill } from '../../../flag-pill'
import { PeopleSearch } from '../../../people/people-search'
import { ShiftSignupForm } from '../../signup-form'

// Sign someone up for one role on one shift night: search, then Sign up.
export default async function ShiftSignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string; role: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { date, role: roleId } = await params
  const { q = '' } = await searchParams
  const role = getShiftRole(roleId)
  if (!role || !isOpenShiftDate(date)) notFound()

  const current = (await getSignupsForDate(date)).filter((signup) => signup.role_id === role.id)
  const signedUpIds = new Set(current.map((signup) => signup.person_id))
  const isFull = role.maxSlots !== null && current.length >= role.maxSlots
  const people = isFull ? [] : await searchPeople(q, { volunteersOnly: true, shiftLeadsOnly: role.shiftLeadsOnly })
  const backHref = `/schedule#night-${date}`

  return (
    <main className="shift-signup-page">
      <p>
        <Link href={backHref}>← Back to schedule</Link>
      </p>
      <h1>
        {role.label}: {formatShiftDate(date)}
      </h1>
      {current.length > 0 && (
        <p>
          Signed up: {current.map((signup) => `${signup.first_name} ${signup.last_name}`).join(', ')}
        </p>
      )}

      {isFull ? (
        <p className="muted">
          This night already has a {role.label.toLowerCase()}. To swap, remove them on the{' '}
          <Link href={backHref}>schedule</Link> first.
        </p>
      ) : (
        <section className="shift-lookup">
          <PeopleSearch query={q} path={`/schedule/${date}/${role.id}`} />
          <ul className="person-list">
            {people.map((person) => {
              const flagLevel = person.flag_level
              return (
                <li key={person.id} className="person-row">
                  <span className="name">
                    <Link href={`/people/${person.id}`}>
                      {person.first_name} {person.last_name}
                    </Link>
                    {flagLevel && <FlagPill level={flagLevel} />}
                  </span>
                  <div className="row-actions">
                    {signedUpIds.has(person.id) ? (
                      <span className="here-today">Already signed up</span>
                    ) : flagLevel === 'banned' ? (
                      <Link href={`/people/${person.id}`} className="btn-secondary">
                        See why
                      </Link>
                    ) : (
                      <ShiftSignupForm personId={person.id} shiftDate={date} roleId={role.id} />
                    )}
                  </div>
                </li>
              )
            })}
            {people.length === 0 && (
              <p className="muted">
                {q.trim() ? 'No matches. ' : 'Search by name or email. '}
                {role.shiftLeadsOnly
                  ? 'Only people marked both Volunteer and Shift lead on their profile show here.'
                  : 'Only people marked Volunteer on their profile show here.'}
              </p>
            )}
          </ul>
          {people.length === SEARCH_LIMIT && (
            <p className="muted search-hint">
              Showing the first {SEARCH_LIMIT} matches. Keep typing to narrow it down.
            </p>
          )}
        </section>
      )}
    </main>
  )
}
