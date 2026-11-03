import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPerson, getVisitsForPerson } from '@/lib/people'
import { getVolunteerHours, getFootTraffic, getAchievedMilestones, MILESTONES } from '@/lib/hours'
import { getActiveFlags } from '@/lib/flags'
import { getMembershipStatus, getMembershipsForPerson } from '@/lib/memberships'
import { todayISO, oneYearFrom } from '@/lib/dates'
import { getNotesForPerson } from '@/lib/notes'
import { getRewardStatuses } from '@/lib/rewards'
import { CheckInForm } from '../checkin-form'
import { BannedModal } from '../banned-modal'
import { FlagAddForm } from '../flag-add-form'
import { MembershipForm } from '../membership-form'
import { NoteForm } from '../note-form'
import { resolveFlagAction, redeemRewardAction } from '../actions'

export default async function PersonProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const person = getPerson(Number(id))
  if (!person) notFound()

  const visits = getVisitsForPerson(person.id)
  const volunteerHours = getVolunteerHours(person.id)
  const footTraffic = getFootTraffic(person.id)
  const achieved = new Set(getAchievedMilestones(volunteerHours))
  const activeFlags = getActiveFlags(person.id)
  const bannedFlags = activeFlags.filter((f) => f.level === 'banned')
  const warningFlags = activeFlags.filter((f) => f.level !== 'banned')
  const { status: membershipStatus, latest: latestMembership } = getMembershipStatus(person.id)
  const membershipHistory = getMembershipsForPerson(person.id)
  const notes = getNotesForPerson(person.id)
  const rewardStatuses = getRewardStatuses(person.id, volunteerHours)
  const today = todayISO()
  const defaultStartDate = today
  const defaultEndDate = oneYearFrom(today)

  const personType = person.is_staff === 1 ? 'Volunteer' : membershipStatus === 'active' ? 'Member' : 'Patron'
  const address = [person.street1, person.street2, person.city, person.state, person.postal_code, person.country]
    .filter(Boolean)
    .join(', ')
  const tags = person.tags
    ? person.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : []

  return (
    <main>
      <BannedModal personName={`${person.first_name} ${person.last_name}`} flags={bannedFlags} />

      <div className="page-header">
        <h1>
          {person.first_name} {person.last_name}
        </h1>
        <Link href={`/people/${person.id}/edit`} className="btn-secondary">
          Edit
        </Link>
      </div>

      <p className="muted">
        {personType}
        {' · '}
        {person.email || 'No email'} · {person.phone || 'No phone'}
        {person.year_of_birth && ` · b. ${person.year_of_birth}`}
        {person.is_site_lead === 1 && ' · Shift lead'}
        {person.email_opt_out === 1 && ' · Opted out of email'}
      </p>
      {address && <p className="muted">{address}</p>}
      {tags.length > 0 && (
        <div className="badge-row">
          {tags.map((tag) => (
            <span key={tag} className="badge achieved">
              {tag}
            </span>
          ))}
        </div>
      )}

      {[...bannedFlags, ...warningFlags].map((flag) => (
        <div key={flag.id} className={`flag-banner ${flag.level}`}>
          <span>
            {flag.level === 'banned' ? '⛔ Banned' : '⚠️ Watch'}
            {' — '}
            {flag.note}
            {flag.logged_by && <span className="muted"> · flagged by {flag.logged_by}</span>}
          </span>
          <form action={resolveFlagAction}>
            <input type="hidden" name="flagId" value={flag.id} />
            <input type="hidden" name="personId" value={person.id} />
            <button type="submit" className="btn-secondary">
              Clear
            </button>
          </form>
        </div>
      ))}

      <div className={`membership-status ${membershipStatus}`}>
        {membershipStatus === 'active' && `Current member — through ${latestMembership!.end_date}`}
        {membershipStatus === 'lapsed' && `Lapsed — expired ${latestMembership!.end_date}`}
        {membershipStatus === 'none' && 'No membership on file'}
      </div>

      <div className="stats-row">
        {volunteerHours > 0 && (
          <div className="stat">
            <span className="value">{volunteerHours}</span>
            <span className="label">Volunteer hours</span>
          </div>
        )}
        <div className="stat">
          <span className="value">{footTraffic}</span>
          <span className="label">Foot traffic (visits)</span>
        </div>
      </div>

      {volunteerHours > 0 && (
        <div className="badge-row">
          {MILESTONES.map((threshold) => (
            <span key={threshold} className={`badge${achieved.has(threshold) ? ' achieved' : ''}`}>
              {threshold === 500 && achieved.has(500) ? '500+' : threshold} hrs
            </span>
          ))}
        </div>
      )}

      {volunteerHours > 0 && (
        <section style={{ marginTop: '2rem' }}>
          <h2>Rewards</h2>
          <ul className="visit-list">
            {rewardStatuses.map(({ tier, status, redemption }) => (
              <li key={tier.id}>
                {tier.label} ({tier.hours}+ hrs) —{' '}
                {status === 'locked' && <span className="muted">Locked</span>}
                {status === 'redeemed' && (
                  <span className="muted">
                    Redeemed {redemption!.redeemed_at}
                    {redemption!.logged_by && ` by ${redemption!.logged_by}`}
                  </span>
                )}
                {status === 'available' && (
                  <form action={redeemRewardAction} style={{ display: 'inline' }}>
                    <input type="hidden" name="personId" value={person.id} />
                    <input type="hidden" name="tierId" value={tier.id} />
                    <button type="submit" className="btn-primary">
                      Redeem
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={{ marginTop: '2rem' }}>
        <h2>Check In</h2>
        <CheckInForm personId={person.id} showVolunteerOption={person.is_staff === 1} />
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Flags</h2>
        <FlagAddForm personId={person.id} />
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Membership</h2>
        <MembershipForm
          personId={person.id}
          defaultStartDate={defaultStartDate}
          defaultEndDate={defaultEndDate}
        />
        <ul className="visit-list" style={{ marginTop: '1rem' }}>
          {membershipHistory.map((m) => (
            <li key={m.id}>
              {m.start_date} → {m.end_date}
              {m.logged_by && <span className="muted"> · logged by {m.logged_by}</span>}
            </li>
          ))}
          {membershipHistory.length === 0 && <p className="muted">No membership history.</p>}
        </ul>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Notes</h2>
        <NoteForm personId={person.id} />
        <ul className="visit-list" style={{ marginTop: '1rem' }}>
          {notes.map((note) => (
            <li key={note.id}>
              {note.text}
              {note.logged_by && <span className="muted"> · {note.logged_by}</span>}
              <span className="muted"> · {note.created_at}</span>
            </li>
          ))}
          {notes.length === 0 && <p className="muted">No notes yet.</p>}
        </ul>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Visit History</h2>
        <ul className="visit-list">
          {visits.map((visit) => (
            <li key={visit.id}>
              {visit.visit_date}
              {visit.is_volunteer === 1 && ' · Volunteer'}
              {visit.logged_by && <span className="muted"> · logged by {visit.logged_by}</span>}
            </li>
          ))}
          {visits.length === 0 && <p className="muted">No visits yet.</p>}
        </ul>
      </section>
    </main>
  )
}
