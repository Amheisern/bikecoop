import type { FlagLevel } from '@/lib/flags'

// Compact flag marker for lists and tiles. The full flag (note, who flagged,
// blocking modal for banned) lives on the person's profile.
export function FlagPill({ level }: { level: FlagLevel }) {
  return (
    <span className={`flag-pill ${level}`}>
      {level === 'banned' ? '⛔ Banned' : '⚠️ Watch'}
    </span>
  )
}
