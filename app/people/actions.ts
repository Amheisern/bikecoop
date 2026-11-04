'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { getSiteLead } from '@/lib/site-lead'
import {
  createPerson,
  updatePerson,
  checkIn,
  getPerson,
  promoteVisitToVolunteer,
  changeVisitToVisitor,
  checkOutPersonToday,
  deleteVisitToday,
} from '@/lib/people'
import { getVolunteerHours, getCrossedMilestone } from '@/lib/hours'
import { createFlag, resolveFlag, type FlagLevel } from '@/lib/flags'
import { createMembership } from '@/lib/memberships'
import { oneYearFrom, todayISO } from '@/lib/dates'
import { createNote } from '@/lib/notes'
import { REWARD_TIERS, getRedemptionsForPerson, redeemReward, type RewardTierId } from '@/lib/rewards'

function readPersonForm(formData: FormData) {
  const yearOfBirthRaw = String(formData.get('yearOfBirth') ?? '').trim()
  return {
    firstName: String(formData.get('firstName') ?? '').trim(),
    lastName: String(formData.get('lastName') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    isStaff: formData.get('isStaff') === 'on',
    isSiteLead: formData.get('isSiteLead') === 'on',
    emailOptOut: formData.get('emailOptOut') === 'on',
    street1: String(formData.get('street1') ?? '').trim() || null,
    street2: String(formData.get('street2') ?? '').trim() || null,
    city: String(formData.get('city') ?? '').trim() || null,
    state: String(formData.get('state') ?? '').trim() || null,
    postalCode: String(formData.get('postalCode') ?? '').trim() || null,
    country: String(formData.get('country') ?? '').trim() || null,
    yearOfBirth: yearOfBirthRaw ? Number(yearOfBirthRaw) : null,
    tags: String(formData.get('tags') ?? '').trim() || null,
  }
}

// Adding a person happens from the Guests tab (someone new just walked in), so
// saving also checks them in as a guest and returns to Guests.
export async function createPersonAction(_prevState: string | undefined, formData: FormData) {
  await requireAuth()
  const input = readPersonForm(formData)
  if (!input.firstName || !input.lastName) {
    return 'First and last name are required.'
  }
  const id = createPerson(input)

  const loggedByName = await currentShiftLeadName()

  if (formData.get('startMembership') === 'on') {
    const start = todayISO()
    createMembership({ personId: id, startDate: start, endDate: oneYearFrom(start), loggedBy: loggedByName })
  }

  checkIn({ personId: id, isVolunteer: false, loggedBy: loggedByName })

  revalidateFrontDesk()
  revalidatePath('/reports')
  redirect('/guests')
}

export async function updatePersonAction(
  id: number,
  _prevState: string | undefined,
  formData: FormData
) {
  await requireAuth()
  const input = readPersonForm(formData)
  if (!input.firstName || !input.lastName) {
    return 'First and last name are required.'
  }
  updatePerson(id, input)
  revalidateFrontDesk()
  revalidatePath(`/people/${id}`)
  redirect(`/people/${id}`)
}

export type CheckInResult = { error?: string; celebration?: string } | null

export async function checkInAction(
  _prevState: CheckInResult | undefined,
  formData: FormData
): Promise<CheckInResult> {
  await requireAuth()
  const personId = Number(formData.get('personId'))
  const isVolunteer = formData.get('isVolunteer') === 'on'
  const person = getPerson(personId)
  if (!person) return { error: 'Invalid person.' }
  // Only people marked Volunteer on their profile can log a volunteer session.
  // The forms already hide the option for everyone else; this is the backstop.
  if (isVolunteer && person.is_staff !== 1) {
    return { error: `Mark ${person.first_name} as a Volunteer on their profile first.` }
  }
  const siteLead = await getSiteLead()

  const hoursBefore = isVolunteer ? getVolunteerHours(personId) : 0

  checkIn({ personId, isVolunteer, loggedBy: siteLead ? `${siteLead.first_name} ${siteLead.last_name}` : null })

  revalidateFrontDesk()
  revalidatePath(`/people/${personId}`)

  if (!isVolunteer) return null

  const crossed = getCrossedMilestone(hoursBefore, getVolunteerHours(personId))
  if (!crossed) return null

  return { celebration: `🎉 ${person.first_name} just passed ${crossed} hours!` }
}

// Both front-desk tabs show today's check-ins, so any change refreshes both.
function revalidateFrontDesk() {
  revalidatePath('/guests')
  revalidatePath('/volunteers')
}

function validPersonId(personId: number): boolean {
  return Number.isInteger(personId) && personId > 0
}

async function currentShiftLeadName(): Promise<string | null> {
  const siteLead = await getSiteLead()
  return siteLead ? `${siteLead.first_name} ${siteLead.last_name}` : null
}

export async function promoteVisitToVolunteerAction(
  personId: number
): Promise<{ error?: string; celebration?: string }> {
  await requireAuth()
  if (!validPersonId(personId)) return { error: 'Invalid person.' }
  const person = getPerson(personId)
  if (!person) return { error: 'Invalid person.' }
  // Same rule as the check-in form: only people marked Volunteer on their
  // profile can log a volunteer session.
  if (person.is_staff !== 1) {
    return { error: `Mark ${person.first_name} as a Volunteer on their profile first.` }
  }
  const hoursBefore = getVolunteerHours(personId)
  if (!promoteVisitToVolunteer(personId, await currentShiftLeadName())) {
    return { error: 'This person is no longer checked in as a guest.' }
  }

  revalidateFrontDesk()
  revalidatePath(`/people/${personId}`)
  revalidatePath('/reports')
  const crossed = getCrossedMilestone(hoursBefore, getVolunteerHours(personId))
  if (crossed) return { celebration: `🎉 ${person.first_name} just passed ${crossed} hours!` }
  return {}
}

export async function changeVisitToVisitorAction(personId: number): Promise<string | null> {
  await requireAuth()
  if (!validPersonId(personId)) return 'Invalid person.'
  if (!changeVisitToVisitor(personId, await currentShiftLeadName())) {
    return 'This person is no longer checked in as a volunteer.'
  }

  revalidateFrontDesk()
  revalidatePath(`/people/${personId}`)
  revalidatePath('/reports')
  return null
}

export async function checkOutPersonTodayAction(personId: number): Promise<string | null> {
  await requireAuth()
  if (!validPersonId(personId)) return 'Invalid person.'
  if (!checkOutPersonToday(personId)) return 'This person is no longer checked in.'

  revalidateFrontDesk()
  return null
}

export async function deleteVisitTodayAction(personId: number): Promise<string | null> {
  await requireAuth()
  if (!validPersonId(personId)) return 'Invalid person.'
  if (!deleteVisitToday(personId)) return 'This person is no longer checked in.'

  revalidateFrontDesk()
  revalidatePath(`/people/${personId}`)
  revalidatePath('/reports')
  return null
}

const FLAG_LEVELS: FlagLevel[] = ['banned', 'watch']

export async function addFlagAction(_prevState: string | undefined, formData: FormData) {
  await requireAuth()
  const personId = Number(formData.get('personId'))
  const level = String(formData.get('level') ?? '') as FlagLevel
  const note = String(formData.get('note') ?? '').trim()

  if (!FLAG_LEVELS.includes(level)) {
    return 'Choose a flag level.'
  }
  if (!note) {
    return 'A note explaining the flag is required.'
  }

  const siteLead = await getSiteLead()
  createFlag({
    personId,
    level,
    note,
    loggedBy: siteLead ? `${siteLead.first_name} ${siteLead.last_name}` : null,
  })

  revalidatePath(`/people/${personId}`)
}

export async function resolveFlagAction(formData: FormData) {
  await requireAuth()
  const flagId = Number(formData.get('flagId'))
  const personId = Number(formData.get('personId'))

  resolveFlag(flagId)
  revalidatePath(`/people/${personId}`)
}

export async function addMembershipAction(_prevState: string | undefined, formData: FormData) {
  await requireAuth()
  const personId = Number(formData.get('personId'))
  const startDate = String(formData.get('startDate') ?? '')
  const endDate = String(formData.get('endDate') ?? '')

  if (!startDate || !endDate) {
    return 'Start and end date are required.'
  }
  if (endDate < startDate) {
    return 'End date must be on or after the start date.'
  }

  const siteLead = await getSiteLead()
  createMembership({
    personId,
    startDate,
    endDate,
    loggedBy: siteLead ? `${siteLead.first_name} ${siteLead.last_name}` : null,
  })

  revalidatePath(`/people/${personId}`)
  revalidatePath('/reports')
}

export async function addNoteAction(_prevState: string | undefined, formData: FormData) {
  await requireAuth()
  const personId = Number(formData.get('personId'))
  const text = String(formData.get('text') ?? '').trim()

  if (!text) {
    return 'Note text is required.'
  }

  const siteLead = await getSiteLead()
  createNote({
    personId,
    text,
    loggedBy: siteLead ? `${siteLead.first_name} ${siteLead.last_name}` : null,
  })

  revalidatePath(`/people/${personId}`)
}

export async function redeemRewardAction(formData: FormData) {
  await requireAuth()
  const personId = Number(formData.get('personId'))
  const tierId = String(formData.get('tierId') ?? '') as RewardTierId

  const tier = REWARD_TIERS.find((t) => t.id === tierId)
  if (!tier) return

  const hours = getVolunteerHours(personId)
  if (hours < tier.hours) return

  const alreadyRedeemed = getRedemptionsForPerson(personId).some((r) => r.tier_id === tierId)
  if (alreadyRedeemed) return

  const siteLead = await getSiteLead()
  const loggedByName = siteLead ? `${siteLead.first_name} ${siteLead.last_name}` : null

  redeemReward({ personId, tierId, loggedBy: loggedByName })

  if (tier.id === 'free_membership') {
    const start = todayISO()
    createMembership({
      personId,
      startDate: start,
      endDate: oneYearFrom(start),
      loggedBy: loggedByName ? `${loggedByName} (redeemed reward)` : 'Redeemed reward',
    })
  }

  revalidatePath(`/people/${personId}`)
  revalidatePath('/reports')
}
