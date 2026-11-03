import Link from 'next/link'
import { getReportMetrics, getPeriodRange, MONTH_NAMES, type Period, type PeriodType } from '@/lib/reports'
import { todayISO } from '@/lib/dates'
import { getLapsedPeople } from '@/lib/memberships'
import { getVolunteerRoster, getCurrentMilestone } from '@/lib/hours'
import { seedSampleDataAction, clearSampleDataAction } from './actions'
import { ImportForm } from './import-form'
import { LapseEmailForm } from './lapse-email-form'
import { getLapseEmailQueue, getRecentLapseEmails, LAPSE_GRACE_DAYS } from '@/lib/lapse-emails'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; year?: string; month?: string; quarter?: string }>
}) {
  const sp = await searchParams
  const today = todayISO()
  const currentYear = Number(today.slice(0, 4))
  const currentMonth = Number(today.slice(5, 7))

  const type: PeriodType =
    sp.type === 'quarterly' || sp.type === 'annual' ? sp.type : 'monthly'
  const year = Number(sp.year) || currentYear
  const month = Number(sp.month) || currentMonth
  const quarter = Number(sp.quarter) || Math.floor((currentMonth - 1) / 3) + 1

  const period: Period = { type, year, month, quarter }
  const { label } = getPeriodRange(period)
  const metrics = getReportMetrics(period)
  const lapsed = getLapsedPeople()
  const volunteers = getVolunteerRoster()
  const emailQueue = getLapseEmailQueue()
  const recentLapseEmails = getRecentLapseEmails()

  return (
    <main className="dense">
      <h1 className="visually-hidden">Reports</h1>
      <form method="GET" className="stack" style={{ maxWidth: 400 }}>
        <label>
          Period type
          <select name="type" defaultValue={type}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </label>
        <label>
          Year
          <input type="number" name="year" defaultValue={year} />
        </label>
        <label>
          Month (used when period type is Monthly)
          <select name="month" defaultValue={month}>
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quarter (used when period type is Quarterly)
          <select name="quarter" defaultValue={quarter}>
            <option value={1}>Q1</option>
            <option value={2}>Q2</option>
            <option value={3}>Q3</option>
            <option value={4}>Q4</option>
          </select>
        </label>
        <button type="submit" className="btn-primary">
          View Report
        </button>
      </form>

      <h2 style={{ marginTop: '2rem' }}>{label}</h2>
      <div className="stats-row">
        <div className="stat">
          <span className="value">{metrics.totalVisits}</span>
          <span className="label">Total visits</span>
        </div>
        <div className="stat">
          <span className="value">{metrics.uniqueVisitors}</span>
          <span className="label">Unique visitors</span>
        </div>
        <div className="stat">
          <span className="value">{metrics.volunteerSessions}</span>
          <span className="label">Volunteer sessions</span>
        </div>
        <div className="stat">
          <span className="value">{metrics.volunteerHours}</span>
          <span className="label">Volunteer hours</span>
        </div>
        <div className="stat">
          <span className="value">{metrics.newMembers}</span>
          <span className="label">New members</span>
        </div>
        <div className="stat">
          <span className="value">{metrics.lapsedMembers}</span>
          <span className="label">Lapsed members</span>
        </div>
      </div>

      <section style={{ marginTop: '2rem' }}>
        <h2>Lapsed Members</h2>
        <ul className="person-list">
          {lapsed.map((person) => (
            <li key={person.id} className="person-row">
              <span className="name">
                <Link href={`/people/${person.id}`}>
                  {person.first_name} {person.last_name}
                </Link>
              </span>
              <span className="muted">Expired {person.latest_end_date}</span>
            </li>
          ))}
          {lapsed.length === 0 && <p className="muted">No lapsed members.</p>}
        </ul>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Volunteers</h2>
        <ul className="person-list">
          {volunteers.map((volunteer) => (
            <li key={volunteer.id} className="person-row">
              <span className="name">
                <Link href={`/people/${volunteer.id}`}>
                  {volunteer.first_name} {volunteer.last_name}
                </Link>
              </span>
              <span className="muted">
                {volunteer.hours} hrs
                {getCurrentMilestone(volunteer.hours) && ` · ${getCurrentMilestone(volunteer.hours)}+ hr milestone`}
              </span>
            </li>
          ))}
          {volunteers.length === 0 && <p className="muted">No volunteers yet.</p>}
        </ul>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Lapsed-Member Emails</h2>
        <p className="muted">
          Renewal notices for members whose membership expired at least {LAPSE_GRACE_DAYS} days
          ago. One email per lapse, ever — re-sending is impossible. People with no email,
          who opted out of email, or who are banned are skipped automatically. Nothing sends
          until you click.
        </p>
        <ul className="person-list">
          {emailQueue.map((person) => (
            <li key={person.id} className="person-row">
              <span className="name">
                <Link href={`/people/${person.id}`}>
                  {person.first_name} {person.last_name}
                </Link>
              </span>
              <span className="muted">
                {person.email} · expired {person.latest_end_date}
              </span>
            </li>
          ))}
          {emailQueue.length === 0 && <p className="muted">No one is due a renewal notice.</p>}
        </ul>
        <LapseEmailForm queueCount={emailQueue.length} />
        {recentLapseEmails.length > 0 && (
          <>
            <h3 style={{ marginTop: '1.5rem' }}>Recently sent</h3>
            <ul className="visit-list">
              {recentLapseEmails.map((entry) => (
                <li key={entry.id}>
                  <Link href={`/people/${entry.person_id}`}>
                    {entry.first_name} {entry.last_name}
                  </Link>
                  {' — for lapse on '}
                  {entry.membership_end_date}
                  {entry.status === 'dry_run' && ' · dry run'}
                  <span className="muted">
                    {' · '}
                    {entry.sent_at}
                    {entry.logged_by && ` · by ${entry.logged_by}`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>AI-Friendly Export</h2>
        <p className="muted">
          One row per person, with computed membership and volunteer-hour fields. Meant to be
          fed into an external AI tool to draft emails — this app never sends email itself.
        </p>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <a href="/export/csv" className="btn-primary">
            Download CSV
          </a>
          <a href="/export/json" className="btn-secondary">
            Download JSON
          </a>
        </div>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Legacy Import (Freehub)</h2>
        <p className="muted">
          One-time import of the legacy Freehub &quot;People&quot; report CSV export
          (people + latest membership per person; legacy data has no volunteer hours).
          Safe to re-run — people already imported are matched and left unchanged, never
          duplicated.
        </p>
        <ImportForm />
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Sample Data</h2>
        <p className="muted">
          Adds a handful of fake people (prefixed &quot;Sample&quot;) covering a patron, an
          active member, a lapsed member, volunteers at different hour tiers, and banned/watch
          flags — for testing the app. Safe to load and clear as many times as you like.
        </p>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <form action={seedSampleDataAction}>
            <button type="submit" className="btn-primary">
              Load Sample Data
            </button>
          </form>
          <form action={clearSampleDataAction}>
            <button type="submit" className="btn-secondary">
              Clear Sample Data
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
