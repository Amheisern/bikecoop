'use client'

import { useActionState } from 'react'
import { checkInAction } from './actions'

// `volunteer` controls whether the check-in logs a volunteer session:
// - 'ask': show the "Volunteer session" checkbox (profile page, Volunteer-marked people)
// - 'yes': always a volunteer session (Volunteers tab)
// - 'no':  always a plain visit (Guests tab, or anyone not marked Volunteer)
export function CheckInForm({
  personId,
  volunteer,
}: {
  personId: number
  volunteer: 'ask' | 'yes' | 'no'
}) {
  const [result, action, pending] = useActionState(checkInAction, null)

  return (
    <div>
      <form action={action} className="checkin-form">
        <input type="hidden" name="personId" value={personId} />
        {volunteer === 'yes' && <input type="hidden" name="isVolunteer" value="on" />}
        {volunteer === 'ask' && (
          <label className="checkbox-row">
            <input type="checkbox" name="isVolunteer" />
            Volunteer session
          </label>
        )}
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Checking in…' : 'Check In'}
        </button>
      </form>
      {result?.celebration && <p className="celebration">{result.celebration}</p>}
      {result?.error && <p className="error" role="alert">{result.error}</p>}
    </div>
  )
}
