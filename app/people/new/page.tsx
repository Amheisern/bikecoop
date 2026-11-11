import Link from 'next/link'
import { PersonForm } from '../person-form'
import { createPersonAction } from '../actions'

export default function NewPersonPage() {
  return (
    <main>
      <h1>Add a new person</h1>
      <p className="muted">Saving also checks them in as a guest today.</p>
      <PersonForm action={createPersonAction} submitLabel="Add and check in" />
      <p>
        <Link href="/checkin">Cancel</Link>
      </p>
    </main>
  )
}
