import { redirect } from 'next/navigation'

// The old Shift page split into the Guests and Volunteers tabs. Kept so
// bookmarks and home-screen shortcuts to /shift still land somewhere.
export default function ShiftPage() {
  redirect('/guests')
}
