import { FrontDesk } from '../front-desk'

export default async function VolunteersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  return <FrontDesk tab="volunteers" query={q} />
}
