'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSiteLead } from '@/lib/site-lead'
import { cancelSignup, getSignupDate, signUpForShift } from '@/lib/shifts'
import { refreshNightPost } from '@/lib/slack'

// Tonight's signups show as "Signed up for tonight" on the Check In page too.
function revalidateSchedule() {
  revalidatePath('/schedule')
  revalidatePath('/checkin')
}

export async function signUpForShiftAction(
  _prevState: string | null | undefined,
  formData: FormData
): Promise<string | null> {
  await requireAuth()
  const shiftDate = String(formData.get('shiftDate') ?? '')
  const siteLead = await getSiteLead()
  const result = await signUpForShift({
    personId: Number(formData.get('personId')),
    shiftDate,
    roleId: String(formData.get('roleId') ?? ''),
    loggedBy: siteLead ? `${siteLead.first_name} ${siteLead.last_name}` : null,
  })
  if (!result.ok) return result.error

  revalidateSchedule()
  // Keep that night's Slack post in step (after the page responds).
  after(() => refreshNightPost(shiftDate))
  // shiftDate is safe in the URL: signUpForShift only accepts open shift dates.
  redirect(`/schedule#night-${shiftDate}`)
}

export async function cancelSignupAction(formData: FormData) {
  await requireAuth()
  const signupId = Number(formData.get('signupId'))
  if (Number.isInteger(signupId) && signupId > 0) {
    const shiftDate = await getSignupDate(signupId)
    if ((await cancelSignup(signupId)) && shiftDate) after(() => refreshNightPost(shiftDate))
  }
  revalidateSchedule()
}
