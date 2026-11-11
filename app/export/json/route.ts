import { isAuthenticated } from '@/lib/auth'
import { getExportRows } from '@/lib/export'

export async function GET() {
  // proxy.ts already gates this route, but the export is the app's biggest
  // PII dump — check auth here too rather than trust middleware alone.
  if (!(await isAuthenticated())) {
    return new Response('Unauthorized', { status: 401 })
  }

  return Response.json(await getExportRows(), {
    headers: {
      'Content-Disposition': 'attachment; filename="bikecoop-export.json"',
    },
  })
}
