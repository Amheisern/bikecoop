import Link from 'next/link'
import { searchPeople, SEARCH_LIMIT } from '@/lib/people'
import { PeopleSearch } from './people-search'

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const people = searchPeople(q)

  return (
    <main>
      <h1 className="visually-hidden">People</h1>
      <div className="page-header">
        <Link href="/people/new" className="btn-primary">
          + Add Person
        </Link>
      </div>

      <PeopleSearch query={q} path="/people" />

      <ul className="person-list">
        {people.map((person) => (
          <li key={person.id} className="person-row">
            <span className="name">
              <Link href={`/people/${person.id}`}>
                {person.first_name} {person.last_name}
              </Link>
            </span>
            <div className="person-actions">
              <Link href={`/people/${person.id}/edit`} className="btn-secondary">
                Manage
              </Link>
            </div>
          </li>
        ))}
        {people.length === 0 && q.trim() && <p className="muted">No matches.</p>}
        {people.length === 0 && !q.trim() && (
          <p className="muted">Search for a person by name or email to manage their profile and settings.</p>
        )}
      </ul>
      {people.length === SEARCH_LIMIT && (
        <p className="muted search-hint">
          Showing the first {SEARCH_LIMIT} matches. Keep typing to narrow it down.
        </p>
      )}
    </main>
  )
}
