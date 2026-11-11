'use client'

import { useActionState, useState } from 'react'
import { checkInAction } from './people/actions'

// The Check In page's buttons, laid out for the front-desk iPad: every row has
// the same two slots, Guest on the left and Volunteer on the right, so buttons
// line up down the list whatever the row needs.
// - guest:     show the Guest button (a plain visit)
// - volunteer: show the Volunteer button (a 2.5-hour volunteer session; only
//              for people marked Volunteer)
// - note:      a short status shown instead of a button ("Here as guest");
//              it takes the Guest slot when Volunteer is still offered,
//              otherwise both slots.
// Rendered for every non-banned row, even with no buttons, so the milestone
// celebration survives the buttons changing after a check-in.
export function FrontDeskCheckIn({
  personId,
  personName,
  guest,
  volunteer,
  note,
}: {
  personId: number
  personName: string
  guest: boolean
  volunteer: boolean
  note?: string
}) {
  const [result, action, pending] = useActionState(checkInAction, null)
  // Which button was tapped, so only that one says "Checking in…".
  const [tapped, setTapped] = useState<'guest' | 'volunteer' | null>(null)

  return (
    <div className="slot-actions">
      <form action={action} className="slots">
        <input type="hidden" name="personId" value={personId} />
        {guest ? (
          <button
            type="submit"
            className="btn-secondary slot slot-guest"
            disabled={pending}
            aria-label={`Check in ${personName} as a guest`}
            onClick={() => setTapped('guest')}
          >
            {pending && tapped === 'guest' ? 'Checking in…' : 'Guest'}
          </button>
        ) : (
          note && <span className={`slot slot-note ${volunteer ? 'slot-guest' : 'slot-wide'}`}>{note}</span>
        )}
        {volunteer && (
          <button
            type="submit"
            name="isVolunteer"
            value="on"
            className="btn-primary slot slot-volunteer"
            disabled={pending}
            aria-label={`Check in ${personName} as a volunteer, 2.5 hours`}
            onClick={() => setTapped('volunteer')}
          >
            {pending && tapped === 'volunteer' ? 'Checking in…' : 'Volunteer'}
          </button>
        )}
      </form>
      {result?.celebration && <p className="celebration">{result.celebration}</p>}
      {result?.error && <p className="error" role="alert">{result.error}</p>}
    </div>
  )
}
