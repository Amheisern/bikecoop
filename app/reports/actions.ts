'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { seedSampleData, clearSampleData } from '@/lib/seed'
import { importFreehubPeople, type ImportResult } from '@/lib/import'
import { getSiteLead } from '@/lib/site-lead'
import { sendEmail } from '@/lib/email'
import { getLapseEmailQueue, renderLapseEmail, recordLapseEmail } from '@/lib/lapse-emails'

function revalidateEverything() {
  revalidatePath('/guests')
  revalidatePath('/volunteers')
  revalidatePath('/reports')
}

export async function seedSampleDataAction() {
  await requireAuth()
  seedSampleData()
  revalidateEverything()
}

export async function clearSampleDataAction() {
  await requireAuth()
  clearSampleData()
  revalidateEverything()
}

export type ImportActionState = { error: string } | { result: ImportResult } | null

export type LapseEmailActionState = {
  sent: number
  dryRun: boolean
  failures: { name: string; error: string }[]
} | null

export async function sendLapseEmailsAction(
  _prevState: LapseEmailActionState,
  _formData: FormData
): Promise<LapseEmailActionState> {
  await requireAuth()

  const siteLead = await getSiteLead()
  const loggedBy = siteLead ? `${siteLead.first_name} ${siteLead.last_name}` : null

  // Recompute server-side — never trust what was rendered on the page.
  const queue = getLapseEmailQueue()
  let sent = 0
  let dryRun = false
  const failures: { name: string; error: string }[] = []

  for (const person of queue) {
    const { subject, text } = renderLapseEmail(person.first_name, person.latest_end_date)
    const result = await sendEmail({ to: person.email, subject, text })
    if (result.ok) {
      recordLapseEmail({
        personId: person.id,
        endDate: person.latest_end_date,
        status: result.dryRun ? 'dry_run' : 'sent',
        loggedBy,
      })
      sent++
      dryRun = dryRun || result.dryRun
    } else {
      // Not recorded — stays in the queue for a retry.
      failures.push({ name: `${person.first_name} ${person.last_name}`, error: result.error })
    }
  }

  revalidatePath('/reports')
  return { sent, dryRun, failures }
}

export async function importFreehubAction(
  _prevState: ImportActionState,
  formData: FormData
): Promise<ImportActionState> {
  await requireAuth()

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a CSV file to import.' }
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: 'That file is over 10 MB — a Freehub people export should be far smaller.' }
  }

  try {
    const result = importFreehubPeople(await file.text())
    revalidateEverything()
    return { result }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Import failed.' }
  }
}
