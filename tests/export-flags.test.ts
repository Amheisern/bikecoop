import test from 'node:test'
import assert from 'node:assert/strict'
import { createPerson, type PersonInput } from '../lib/people'
import { createFlag, resolveFlag, getActiveFlags } from '../lib/flags'
import { getExportRows, rowsToCSV } from '../lib/export'

async function makePerson(overrides: Partial<PersonInput> = {}): Promise<number> {
  const input: PersonInput = {
    firstName: 'Export',
    lastName: 'Test',
    email: null,
    phone: null,
    isStaff: false,
    isSiteLead: false,
    emailOptOut: false,
    street1: null,
    street2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    yearOfBirth: null,
    tags: null,
    ...overrides,
  }
  return await createPerson(input)
}

test('export blanks the email of opted-out people but keeps everyone else’s', async () => {
  const optedOutId = await makePerson({ firstName: 'Opted', email: 'private@example.com', emailOptOut: true })
  const normalId = await makePerson({ firstName: 'Normal', email: 'ok@example.com' })

  const rows = await getExportRows()
  assert.equal(rows.find((r) => r.id === optedOutId)?.email, null)
  assert.equal(rows.find((r) => r.id === optedOutId)?.email_opt_out, true)
  assert.equal(rows.find((r) => r.id === normalId)?.email, 'ok@example.com')
})

test('export includes active flags and drops resolved ones', async () => {
  const id = await makePerson({ firstName: 'Flagged' })
  await createFlag({ personId: id, level: 'watch', note: 'test', loggedBy: null })
  await createFlag({ personId: id, level: 'banned', note: 'test', loggedBy: null })

  let row = (await getExportRows()).find((r) => r.id === id)
  assert.ok(row)
  assert.ok(row.active_flags.includes('watch'))
  assert.ok(row.active_flags.includes('banned'))

  const banned = (await getActiveFlags(id)).find((f) => f.level === 'banned')!
  await resolveFlag(banned.id)
  row = (await getExportRows()).find((r) => r.id === id)
  assert.equal(row?.active_flags, 'watch')
})

test('CSV output escapes commas and quotes, and is empty for no rows', async () => {
  await makePerson({ firstName: 'Comma, Inc.', lastName: 'Has "Quotes"' })
  const csv = rowsToCSV(await getExportRows())
  const lines = csv.split('\n')
  assert.equal(lines[0].split(',')[0], 'id')
  assert.ok(csv.includes('"Comma, Inc."'))
  assert.ok(csv.includes('"Has ""Quotes"""'))
  assert.equal(rowsToCSV([]), '')
})
