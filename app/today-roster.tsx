'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { CheckedInPerson } from '@/lib/people'
import { FlagPill } from './flag-pill'
import {
  checkOutPersonTodayAction,
  changeVisitToVisitorAction,
  deleteVisitTodayAction,
  promoteVisitToVolunteerAction,
} from './people/actions'

type DialogState =
  | { kind: 'remove'; person: CheckedInPerson }
  | { kind: 'promote'; person: CheckedInPerson }
  | { kind: 'demote'; person: CheckedInPerson }
  | null

// Today's check-ins for one group on the Check In page (volunteers or guests).
// Each tile can move the person to the other group for today (with a
// confirmation) or be removed.
export function TodayRoster({ group, people }: { group: 'volunteers' | 'guests'; people: CheckedInPerson[] }) {
  const router = useRouter()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [celebration, setCelebration] = useState<string | null>(null)
  const isVolunteers = group === 'volunteers'

  async function perform(action: () => Promise<string | null | { error?: string; celebration?: string }>) {
    setPending(true)
    setError(null)
    try {
      const result = await action()
      const actionError = typeof result === 'string' ? result : result?.error
      if (actionError) {
        setError(actionError)
        return
      }
      if (typeof result === 'object' && result?.celebration) {
        setCelebration(result.celebration)
      }
      setDialog(null)
      router.refresh()
    } catch (actionError) {
      console.error('Roster action failed', actionError)
      setError('The action failed. Please try again.')
    } finally {
      setPending(false)
    }
  }

  function openDialog(next: DialogState) {
    setError(null)
    setDialog(next)
  }

  return (
    <>
      <section className="shift-roster">
        <h2>
          {isVolunteers ? 'Volunteers' : 'Guests'} here today ({people.length})
        </h2>
        {celebration && <p className="celebration" role="status">{celebration}</p>}
        <ul className="shift-tiles">
          {people.map((person) => {
            const name = `${person.first_name} ${person.last_name}`
            // Only people marked Volunteer on their profile can move to Volunteers.
            const canMove = isVolunteers || person.is_staff === 1
            return (
              <li key={person.id} className={`shift-tile ${isVolunteers ? 'volunteer' : 'guest'}`}>
                <span className="shift-tile-name">
                  <Link href={`/people/${person.id}`}>{name}</Link>
                  {person.flag_level && <FlagPill level={person.flag_level} />}
                </span>
                <div className="shift-tile-actions">
                  {canMove && (
                    <button
                      type="button"
                      className="btn-secondary tile-move"
                      onClick={() => openDialog({ kind: isVolunteers ? 'demote' : 'promote', person })}
                    >
                      {isVolunteers ? 'Move to Guests' : 'Move to Volunteers'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="tile-remove"
                    aria-label={`Remove ${name} from today's check-ins`}
                    onClick={() => openDialog({ kind: 'remove', person })}
                  >
                    <svg aria-hidden="true" viewBox="0 0 16 16">
                      <path d="m4 4 8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </div>
              </li>
            )
          })}
          {people.length === 0 && <li className="muted">None checked in</li>}
        </ul>
      </section>

      {dialog && (
        <div className="shift-dialog-backdrop">
          <section
            className="shift-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shift-dialog-title"
          >
            {dialog.kind === 'remove' ? (
              <>
                <h2 id="shift-dialog-title">
                  Remove {dialog.person.first_name} {dialog.person.last_name}?
                </h2>
                <p>Choose whether to preserve today&apos;s visit in their history.</p>
                {dialog.person.is_volunteer_visit === 1 && (
                  <p>Deleting the record also removes this 2.5-hour volunteer session.</p>
                )}
                <div className="shift-dialog-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={pending}
                    onClick={() => perform(() => checkOutPersonTodayAction(dialog.person.id))}
                  >
                    Check out, keep visit
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={pending}
                    onClick={() => perform(() => deleteVisitTodayAction(dialog.person.id))}
                  >
                    Delete visit record
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={pending}
                    onClick={() => setDialog(null)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : dialog.kind === 'promote' ? (
              <>
                <h2 id="shift-dialog-title">Move to Volunteers?</h2>
                <p>
                  {dialog.person.first_name} {dialog.person.last_name}&apos;s visit will count as a
                  2.5-hour volunteer session, and they&apos;ll move to Volunteers here today.
                </p>
                <div className="shift-dialog-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={pending}
                    onClick={() => perform(() => promoteVisitToVolunteerAction(dialog.person.id))}
                  >
                    Confirm volunteer
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={pending}
                    onClick={() => setDialog(null)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="shift-dialog-title">Move to Guests?</h2>
                <p>
                  {dialog.person.first_name} {dialog.person.last_name}&apos;s visit will no longer
                  count as a volunteer session, removing 2.5 volunteer hours, and they&apos;ll move
                  to Guests here today.
                </p>
                <div className="shift-dialog-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={pending}
                    onClick={() => perform(() => changeVisitToVisitorAction(dialog.person.id))}
                  >
                    Confirm guest
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={pending}
                    onClick={() => setDialog(null)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
            {error && <p className="error" role="alert">{error}</p>}
          </section>
        </div>
      )}
    </>
  )
}
