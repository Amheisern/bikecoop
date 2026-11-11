'use client'

import { useActionState } from 'react'
import { checkInAction } from './actions'

// Check-in on a profile page. (The Check In page has its own two-slot buttons,
// app/front-desk-checkin.tsx.)
// - 'ask': a "Volunteer session" checkbox (people marked Volunteer)
// - 'no':  a plain visit only (everyone else)
export function CheckInForm({ personId, volunteer }: { personId: number; volunteer: 'ask' | 'no' }) {
  const [result, action, pending] = useActionState(checkInAction, null)

  return (
    <div>
      <form action={action} className="checkin-form">
        <input type="hidden" name="personId" value={personId} />
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
