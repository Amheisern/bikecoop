'use client'

import { useActionState } from 'react'
import type { Person } from '@/lib/people'

type PersonFormAction = (prevState: string | undefined, formData: FormData) => Promise<string | undefined>

export function PersonForm({
  action,
  person,
  submitLabel,
}: {
  action: PersonFormAction
  person?: Person
  submitLabel: string
}) {
  const [error, formAction, pending] = useActionState(action, undefined)

  return (
    <form action={formAction} className="stack">
      <label>
        First name
        <input name="firstName" type="text" defaultValue={person?.first_name} required autoFocus />
      </label>
      <label>
        Last name
        <input name="lastName" type="text" defaultValue={person?.last_name} required />
      </label>
      <label>
        Email
        <input name="email" type="email" defaultValue={person?.email ?? ''} />
      </label>
      <label>
        Phone
        <input name="phone" type="tel" defaultValue={person?.phone ?? ''} />
      </label>
      <label>
        Street address
        <input name="street1" type="text" defaultValue={person?.street1 ?? ''} />
      </label>
      <label>
        Address line 2
        <input name="street2" type="text" defaultValue={person?.street2 ?? ''} />
      </label>
      <label>
        City
        <input name="city" type="text" defaultValue={person?.city ?? ''} />
      </label>
      <label>
        State
        <input name="state" type="text" defaultValue={person?.state ?? ''} />
      </label>
      <label>
        Postal code
        <input name="postalCode" type="text" defaultValue={person?.postal_code ?? ''} />
      </label>
      <label>
        Country
        <input name="country" type="text" defaultValue={person?.country ?? 'US'} />
      </label>
      <label>
        Year of birth
        <input name="yearOfBirth" type="number" defaultValue={person?.year_of_birth ?? ''} />
      </label>
      <label>
        Tags
        <input
          name="tags"
          type="text"
          placeholder="comma, separated, tags"
          defaultValue={person?.tags ?? ''}
        />
      </label>
      <label className="checkbox-row">
        <input type="checkbox" name="isStaff" defaultChecked={person?.is_staff === 1} />
        Volunteer
      </label>
      <label className="checkbox-row">
        <input type="checkbox" name="isSiteLead" defaultChecked={person?.is_site_lead === 1} />
        Shift lead (appears in the &quot;Shift Lead&quot; dropdown)
      </label>
      <label className="checkbox-row">
        <input type="checkbox" name="emailOptOut" defaultChecked={person?.email_opt_out === 1} />
        Opted out of email
      </label>
      {!person && (
        <label className="checkbox-row">
          <input type="checkbox" name="startMembership" />
          Start annual membership today
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
