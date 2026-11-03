'use client'

import { useEffect, useRef, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'

// Wait for a short pause in typing before searching, so the server isn't hit
// on every keystroke (or on arrow keys, which never change the value).
const SEARCH_DELAY_MS = 250

export function PeopleSearch({ query, path }: { query: string; path: string }) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cancel a pending search if the page unmounts (e.g. a result was clicked
  // mid-pause), so it can't navigate back to the search afterward.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function searchAsYouType(event: ChangeEvent<HTMLInputElement>) {
    const value = event.currentTarget.value
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // Plain string rather than URLSearchParams.size, which older iPad
      // Safari doesn't support.
      router.replace(value ? `${path}?q=${encodeURIComponent(value)}` : path, { scroll: false })
    }, SEARCH_DELAY_MS)
  }

  return (
    <form method="GET">
      <input
        type="search"
        name="q"
        defaultValue={query}
        placeholder="Search by name or email…"
        className="search-box"
        autoFocus
        onChange={searchAsYouType}
      />
    </form>
  )
}
