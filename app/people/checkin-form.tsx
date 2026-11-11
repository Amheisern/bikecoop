'use client'

import { useActionState, useState } from 'react'
import { checkInAction } from './actions'

// `volunteer` controls whether the check-in logs a volunteer session:
// - 'choose': two buttons, Guest and Volunteer (Check In page, people marked
//   Volunteer). Volunteer logs a 2.5-hour volunteer session.
// - 'yes': one Volunteer button (Check In page, a Volunteer-marked person
//   already here as a guest tonight)
// - 'no':  one Check In button, a plain visit (anyone not marked Volunteer)
// - 'ask': a "Volunteer session" checkbox (profile page, Volunteer-marked people)
// - 'none': no buttons (Check In page, someone already here who can't switch).
//   Rendered rather than removed so the form stays mounted after a check-in
//   and its milestone celebration or error stays on screen.
export function CheckInForm({
  personId,
  personName,
  volunteer,
}: {
  personId: number
  personName?: string
  volunteer: 'choose' | 'yes' | 'no' | 'ask' | 'none'
}) {
  const [result, action, pending] = useActionState(checkInAction, null)
  // Which button was tapped, so only that one says "Checking in…".
  const [tapped, setTapped] = useState<'guest' | 'volunteer' | null>(null)
  const who = personName ? ` ${personName}` : ''

  return (
    <div>
      {volunteer !== 'none' && (
        <form action={action} className="checkin-form">
          <input type="hidden" name="personId" value={personId} />
          {volunteer === 'ask' && (
            <label className="checkbox-row">
              <input type="checkbox" name="isVolunteer" />
              Volunteer session
            </label>
          )}
          {(volunteer === 'no' || volunteer === 'ask') && (
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? 'Checking in…' : 'Check In'}
            </button>
          )}
          {volunteer === 'choose' && (
            <button
              type="submit"
              className="btn-secondary"
              disabled={pending}
              aria-label={`Check in${who} as a guest`}
              onClick={() => setTapped('guest')}
            >
              {pending && tapped === 'guest' ? 'Checking in…' : 'Guest'}
            </button>
          )}
          {(volunteer === 'choose' || volunteer === 'yes') && (
            <button
              type="submit"
              name="isVolunteer"
              value="on"
              className="btn-primary"
              disabled={pending}
              aria-label={`Check in${who} as a volunteer, 2.5 hours`}
              onClick={() => setTapped('volunteer')}
            >
              {pending && tapped === 'volunteer' ? 'Checking in…' : 'Volunteer'}
            </button>
          )}
        </form>
      )}
      {result?.celebration && <p className="celebration">{result.celebration}</p>}
      {result?.error && <p className="error" role="alert">{result.error}</p>}
    </div>
  )
}
