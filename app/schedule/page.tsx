import Link from 'next/link'
import { addDaysISO, todayISO } from '@/lib/dates'
import {
  SHIFT_HOURS,
  SHIFT_ROLES,
  SIGNUP_WEEKS_AHEAD,
  formatShiftDate,
  getSignupsBetween,
  upcomingShiftDates,
  type ShiftSignup,
} from '@/lib/shifts'
import { FlagPill } from '../flag-pill'
import { cancelSignupAction } from './actions'

const weekFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

// Monday of the week a date falls in, for grouping nights by week.
function weekStartOf(dateISO: string): string {
  const weekday = new Date(`${dateISO}T00:00:00Z`).getUTCDay()
  return addDaysISO(dateISO, -((weekday + 6) % 7))
}

export default async function SchedulePage() {
  const today = todayISO()
  const dates = upcomingShiftDates(today)
  const signups = await getSignupsBetween(dates[0], dates[dates.length - 1])

  const weeks = new Map<string, string[]>()
  for (const date of dates) {
    const week = weekStartOf(date)
    weeks.set(week, [...(weeks.get(week) ?? []), date])
  }

  return (
    <main>
      <h1 className="visually-hidden">Schedule</h1>
      <div className="page-header schedule-intro">
        <p className="muted">
          Shift nights for the next {SIGNUP_WEEKS_AHEAD} weeks, {SHIFT_HOURS}. Signing up doesn&apos;t log
          hours; checking in as a Volunteer on the Check In page does.
        </p>
      </div>

      {[...weeks.entries()].map(([weekStart, nights]) => (
        <section key={weekStart} className="schedule-week">
          <h2>Week of {weekFormat.format(new Date(`${weekStart}T00:00:00Z`))}</h2>
          <div className="schedule-nights">
            {nights.map((date) => (
              <NightCard
                key={date}
                date={date}
                isTonight={date === today}
                signups={signups.filter((signup) => signup.shift_date === date)}
              />
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}

function NightCard({ date, isTonight, signups }: { date: string; isTonight: boolean; signups: ShiftSignup[] }) {
  return (
    <article id={`night-${date}`} className={`night-card${isTonight ? ' tonight' : ''}`}>
      <h3>
        {formatShiftDate(date)}
        {isTonight && <span className="tonight-badge">Tonight</span>}
      </h3>
      {SHIFT_ROLES.map((role) => {
        const filled = signups.filter((signup) => signup.role_id === role.id)
        const isFull = role.maxSlots !== null && filled.length >= role.maxSlots
        return (
          <div key={role.id} className="night-role">
            <div className="night-role-heading">
              <h4>{role.label}</h4>
              {!isFull && (
                <Link
                  href={`/schedule/${date}/${role.id}`}
                  className="btn-secondary role-add"
                  aria-label={`Add a ${role.label.toLowerCase()} for ${formatShiftDate(date)}`}
                >
                  + Add
                </Link>
              )}
            </div>
            <ul className="signup-list">
              {filled.map((signup) => {
                const name = `${signup.first_name} ${signup.last_name}`
                return (
                  <li key={signup.id}>
                    <span>
                      <Link href={`/people/${signup.person_id}`}>{name}</Link>
                      {signup.flag_level && <FlagPill level={signup.flag_level} />}
                    </span>
                    <form action={cancelSignupAction}>
                      <input type="hidden" name="signupId" value={signup.id} />
                      <button
                        type="submit"
                        className="signup-remove"
                        aria-label={`Remove ${name} as ${role.label.toLowerCase()} on ${formatShiftDate(date)}`}
                      >
                        <svg aria-hidden="true" viewBox="0 0 16 16">
                          <path d="m4 4 8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </form>
                  </li>
                )
              })}
              {filled.length === 0 &&
                (role.maxSlots === 1 ? (
                  <li className="needed">Needed</li>
                ) : (
                  <li className="muted">No one yet</li>
                ))}
            </ul>
          </div>
        )
      })}
    </article>
  )
}
