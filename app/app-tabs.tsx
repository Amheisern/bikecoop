'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/checkin', label: 'Check In' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/reports', label: 'Reports' },
]

export function AppTabs() {
  const pathname = usePathname()

  return (
    <nav className="app-tabs" aria-label="Main navigation">
      {tabs.map(({ href, label }) => {
        const active =
          pathname === href ||
          pathname.startsWith(`${href}/`) ||
          (href === '/reports' && pathname.startsWith('/export/')) ||
          // Profiles and Add Person live under /people but belong to Check In.
          (href === '/checkin' && pathname.startsWith('/people/'))
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
