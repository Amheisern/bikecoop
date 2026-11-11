'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { FlagLevel } from '@/lib/flags'
import { FlagPill } from './flag-pill'
import { checkInAction } from './people/actions'

export type ExpectedRow = {
  personId: number
  name: string
  roleLabels: string[]
  flagLevel: FlagLevel | null
  checkedInAsGuest: boolean
}

// Check In page: people signed up for tonight who haven't checked in as a
// volunteer yet. One tap checks them in (a 2.5-hour session); they then move
// to "Volunteers here today". The celebration lives here, not on the row, so
// it survives the row disappearing.
export function ExpectedTonight({ rows, signedUpCount }: { rows: ExpectedRow[]; signedUpCount: number }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [celebration, setCelebration] = useState<string | null>(null)

  async function checkIn(personId: number) {
    setPendingId(personId)
    setError(null)
    try {
      const formData = new FormData()
      formData.set('personId', String(personId))
      formData.set('isVolunteer', 'on')
      const result = await checkInAction(null, formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      if (result?.celebration) setCelebration(result.celebration)
      router.refresh()
    } catch (actionError) {
      console.error('Expected check-in failed', actionError)
      setError('Check-in failed. Please try again.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section className="expected-tonight">
      <h2>Signed up for tonight ({rows.length})</h2>
      {celebration && <p className="celebration" role="status">{celebration}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="shift-tiles">
        {rows.map((row) => (
          <li key={row.personId} className="shift-tile expected">
            <span className="shift-tile-name">
              <Link href={`/people/${row.personId}`}>{row.name}</Link>
              <span className="expected-roles">{row.roleLabels.join(' · ')}</span>
              {row.flagLevel && <FlagPill level={row.flagLevel} />}
              {row.checkedInAsGuest && <span className="here-today">Checked in as a guest</span>}
            </span>
            <div className="shift-tile-actions">
              {row.flagLevel === 'banned' ? (
                // Same as search: banned people go through their profile.
                <Link href={`/people/${row.personId}`} className="btn-secondary tile-move">
                  See why
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn-primary tile-checkin"
                  disabled={pendingId !== null}
                  onClick={() => checkIn(row.personId)}
                >
                  {pendingId === row.personId ? 'Checking in…' : 'Check In'}
                </button>
              )}
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="muted">
            {signedUpCount > 0 ? 'Everyone signed up is checked in.' : 'No one signed up for tonight.'}
          </li>
        )}
      </ul>
    </section>
  )
}
