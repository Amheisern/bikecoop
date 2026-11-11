import { isAuthenticated } from '@/lib/auth'
import { getExportRows, rowsToCSV } from '@/lib/export'

export async function GET() {
  // proxy.ts already gates this route, but the export is the app's biggest
  // PII dump — check auth here too rather than trust middleware alone.
  if (!(await isAuthenticated())) {
    return new Response('Unauthorized', { status: 401 })
  }

  const csv = rowsToCSV(await getExportRows())

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bikecoop-export.csv"',
    },
  })
}
