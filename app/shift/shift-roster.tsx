'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type DragEvent } from 'react'
import type { CheckedInPerson } from '@/lib/people'
import { FlagPill } from '../flag-pill'
import {
  checkOutPersonTodayAction,
  changeVisitToVisitorAction,
  deleteVisitTodayAction,
  promoteVisitToVolunteerAction,
} from '../people/actions'

type DialogState =
  | { kind: 'remove'; person: CheckedInPerson }
  | { kind: 'promote'; person: CheckedInPerson }
  | { kind: 'demote'; person: CheckedInPerson }
  | null

export function ShiftRoster({ people }: { people: CheckedInPerson[] }) {
  const router = useRouter()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [selectedPerson, setSelectedPerson] = useState<CheckedInPerson | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [celebration, setCelebration] = useState<string | null>(null)
  const [dragOverGroup, setDragOverGroup] = useState<'volunteer' | 'visitor' | null>(null)
  const volunteers = people.filter((person) => person.is_volunteer_visit === 1)
  const visitors = people.filter((person) => person.is_volunteer_visit === 0)

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
      setSelectedPerson(null)
      setDialog(null)
      router.refresh()
    } catch (actionError) {
      console.error('Shift roster action failed', actionError)
      setError('The action failed. Please try again.')
    } finally {
      setPending(false)
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragOverGroup(null)
    const personId = Number(event.dataTransfer.getData('text/person-id'))
    // Only people marked Volunteer on their profile can become volunteers.
    const person = visitors.find((visitor) => visitor.id === personId && visitor.is_staff === 1)
    if (person) {
      setError(null)
      setDialog({ kind: 'promote', person })
    }
  }

  function handleVolunteerDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragOverGroup(null)
    const personId = Number(event.dataTransfer.getData('text/person-id'))
    const person = volunteers.find((volunteer) => volunteer.id === personId)
    if (person) {
      setError(null)
      setDialog({ kind: 'demote', person })
    }
  }

  function moveSelectedPersonTo(destination: 'volunteer' | 'visitor') {
    if (!selectedPerson) return
    const isCurrentlyVolunteer = selectedPerson.is_volunteer_visit === 1
    if ((destination === 'volunteer') === isCurrentlyVolunteer) return
    setError(null)
    setDialog({ kind: isCurrentlyVolunteer ? 'demote' : 'promote', person: selectedPerson })
  }

  return (
    <>
      <section className="shift-roster">
        <div className="shift-roster-heading">
          <h2>Checked in today ({people.length})</h2>
          <p className="muted drop-hint">
            Drag people between columns, or tap a tile&apos;s grip then tap the destination column.
            {selectedPerson && ` Selected ${selectedPerson.first_name} ${selectedPerson.last_name}.`}
          </p>
        </div>
        {celebration && <p className="celebration" role="status">{celebration}</p>}
        <div className="shift-tile-groups">
          <section
            className={`shift-tile-group volunteer-drop-target${dragOverGroup === 'volunteer' ? ' drag-over' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOverGroup('volunteer')
            }}
            onDragLeave={() => setDragOverGroup(null)}
            onDrop={handleDrop}
            onClick={() => moveSelectedPersonTo('volunteer')}
          >
            <h3>Volunteers ({volunteers.length})</h3>
            <ul className="shift-tiles">
              {volunteers.map((person) => (
                <li
                  key={person.id}
                  className={`shift-tile volunteer${selectedPerson?.id === person.id ? ' selected' : ''}`}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/person-id', String(person.id))
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                >
                  <button
                    type="button"
                    className="shift-tile-grip"
                    aria-label={`Select ${person.first_name} ${person.last_name} to move to visitors`}
                    aria-pressed={selectedPerson?.id === person.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedPerson((selected) => selected?.id === person.id ? null : person)
                    }}
                  />
                  <div className="shift-tile-heading">
                    <span className="shift-tile-name">
                      <Link href={`/people/${person.id}`} onClick={(event) => event.stopPropagation()}>
                        {person.first_name} {person.last_name}
                      </Link>
                      {person.flag_level && <FlagPill level={person.flag_level} />}
                    </span>
                    <button
                      type="button"
                      className="tile-remove"
                      aria-label={`Remove ${person.first_name} ${person.last_name} from today's shift`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setError(null)
                        setDialog({ kind: 'remove', person })
                      }}
                    >
                      <svg aria-hidden="true" viewBox="0 0 16 16">
                        <path d="m4 4 8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
              {volunteers.length === 0 && <li className="muted">None checked in</li>}
            </ul>
          </section>

          <section
            className={`shift-tile-group visitor-drop-target${dragOverGroup === 'visitor' ? ' drag-over' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOverGroup('visitor')
            }}
            onDragLeave={() => setDragOverGroup(null)}
            onDrop={handleVolunteerDrop}
            onClick={() => moveSelectedPersonTo('visitor')}
          >
            <h3>Visitors ({visitors.length})</h3>
            <ul className="shift-tiles">
              {visitors.map((person) => {
                const canVolunteer = person.is_staff === 1
                return (
                <li
                  key={person.id}
                  className={`shift-tile visitor${selectedPerson?.id === person.id ? ' selected' : ''}`}
                  draggable={canVolunteer}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/person-id', String(person.id))
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                >
                  <button
                    type="button"
                    className="shift-tile-grip"
                    disabled={!canVolunteer}
                    title={canVolunteer ? undefined : 'Mark them as a Volunteer on their profile first'}
                    aria-label={
                      canVolunteer
                        ? `Select ${person.first_name} ${person.last_name} to move to volunteers`
                        : `${person.first_name} ${person.last_name} isn't marked Volunteer, so can't be moved to volunteers`
                    }
                    aria-pressed={selectedPerson?.id === person.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedPerson((selected) => selected?.id === person.id ? null : person)
                    }}
                  />
                  <div className="shift-tile-heading">
                    <span className="shift-tile-name">
                      <Link href={`/people/${person.id}`} onClick={(event) => event.stopPropagation()}>
                        {person.first_name} {person.last_name}
                      </Link>
                      {person.flag_level && <FlagPill level={person.flag_level} />}
                    </span>
                    <button
                      type="button"
                      className="tile-remove"
                      aria-label={`Remove ${person.first_name} ${person.last_name} from today's shift`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setError(null)
                        setDialog({ kind: 'remove', person })
                      }}
                    >
                      <svg aria-hidden="true" viewBox="0 0 16 16">
                        <path d="m4 4 8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </div>
                </li>
                )
              })}
              {visitors.length === 0 && <li className="muted">None checked in</li>}
            </ul>
          </section>
        </div>
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
                <h2 id="shift-dialog-title">Mark as a volunteer?</h2>
                <p>
                  {dialog.person.first_name} {dialog.person.last_name}&apos;s visit will count as a
                  2.5-hour volunteer session.
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
                <h2 id="shift-dialog-title">Change to a visitor?</h2>
                <p>
                  {dialog.person.first_name} {dialog.person.last_name}&apos;s visit will no longer
                  count as a volunteer session, removing 2.5 volunteer hours.
                </p>
                <div className="shift-dialog-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={pending}
                    onClick={() => perform(() => changeVisitToVisitorAction(dialog.person.id))}
                  >
                    Confirm visitor
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
