import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isValidSessionCookieValue, SESSION_COOKIE_NAME } from '@/lib/auth'

const PUBLIC_PATHS = ['/login']

// Open to anyone, signed in or not, with no redirects:
// - the keep-awake health check (app/api/health/route.ts)
// - Slack's button taps and the weekly post (app/api/slack/), which check a
//   Slack signature or are safe to repeat instead of a login
const HEALTH_CHECK_PATH = '/api/health'
const SLACK_PATH_PREFIX = '/api/slack/'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname === HEALTH_CHECK_PATH || pathname.startsWith(SLACK_PATH_PREFIX)) return NextResponse.next()
  const isPublic = PUBLIC_PATHS.includes(pathname)
  const isAuthenticated = isValidSessionCookieValue(
    request.cookies.get(SESSION_COOKIE_NAME)?.value
  )

  if (!isAuthenticated && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isAuthenticated && isPublic) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
