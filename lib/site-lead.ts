import { cookies } from 'next/headers'
import { getPerson, type Person } from '@/lib/people'

const SITE_LEAD_COOKIE = 'site_lead_id'

export async function getSiteLead(): Promise<Person | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(SITE_LEAD_COOKIE)?.value
  if (!raw) return null
  const person = await getPerson(Number(raw))
  return person ?? null
}

export const SITE_LEAD_COOKIE_NAME = SITE_LEAD_COOKIE
