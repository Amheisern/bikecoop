'use client'

import { useActionState } from 'react'
import { signUpForShiftAction } from './actions'

export function ShiftSignupForm({
  personId,
  shiftDate,
  roleId,
}: {
  personId: number
  shiftDate: string
  roleId: string
}) {
  const [error, action, pending] = useActionState(signUpForShiftAction, null)

  return (
    <div>
      <form action={action} className="checkin-form">
        <input type="hidden" name="personId" value={personId} />
        <input type="hidden" name="shiftDate" value={shiftDate} />
        <input type="hidden" name="roleId" value={roleId} />
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Signing up…' : 'Sign up'}
        </button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
