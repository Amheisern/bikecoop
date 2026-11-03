'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/shift', label: 'Shift' },
  { href: '/people', label: 'People' },
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
          (href === '/reports' && pathname.startsWith('/export/'))
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
