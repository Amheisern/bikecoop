import { FrontDesk } from '../front-desk'

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  return <FrontDesk tab="guests" query={q} />
}
