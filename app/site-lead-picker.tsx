'use client'

import { useRef } from 'react'
import { setSiteLead } from './actions'
import type { Person } from '@/lib/people'

export function SiteLeadPicker({
  siteLeads,
  currentId,
}: {
  siteLeads: Person[]
  currentId: number | null
}) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form ref={formRef} action={setSiteLead}>
      <label className="site-lead-label">
        Shift Lead:
        <select
          name="personId"
          defaultValue={currentId ?? ''}
          onChange={() => formRef.current?.requestSubmit()}
        >
          <option value="">— Select shift lead —</option>
          {siteLeads.map((person) => (
            <option key={person.id} value={person.id}>
              {person.first_name} {person.last_name}
            </option>
          ))}
        </select>
      </label>
    </form>
  )
}
