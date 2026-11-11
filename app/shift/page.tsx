import { redirect } from 'next/navigation'

// The old Shift page, now the Check In page. Kept so bookmarks and
// home-screen shortcuts to /shift still land somewhere.
export default function ShiftPage() {
  redirect('/checkin')
}
