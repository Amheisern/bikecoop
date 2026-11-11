import { redirect } from 'next/navigation'

// Guests and Volunteers were merged into the single Check In page. Kept so
// bookmarks and home-screen shortcuts still land somewhere (search kept).
export default async function GuestsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  redirect(q ? `/checkin?q=${encodeURIComponent(q)}` : '/checkin')
}
