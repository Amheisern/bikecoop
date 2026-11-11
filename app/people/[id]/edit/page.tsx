import { notFound } from 'next/navigation'
import { getPerson } from '@/lib/people'
import { PersonForm } from '../../person-form'
import { updatePersonAction } from '../../actions'

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const person = await getPerson(Number(id))
  if (!person) notFound()

  const action = updatePersonAction.bind(null, person.id)

  return (
    <main>
      <h1>
        Edit {person.first_name} {person.last_name}
      </h1>
      <PersonForm action={action} person={person} submitLabel="Save Changes" />
    </main>
  )
}
