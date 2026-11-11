import { FrontDesk } from '../front-desk'

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  return <FrontDesk query={q} />
}
