import { redirect } from 'next/navigation'

// The People tab was merged into the Check In page (same search, plus Add Person).
// Kept so bookmarks to /people still land somewhere.
export default function PeoplePage() {
  redirect('/checkin')
}
