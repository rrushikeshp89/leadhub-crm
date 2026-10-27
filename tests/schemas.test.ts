/**
 * Validation messages users see in forms. Guards the wording across Zod upgrades.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { companySchema, fieldErrors, inquirySchema, leadSchema, opportunitySchema, settingsSchema, taskSchema } from '../shared/schemas'

const errors = (schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }, input: unknown) => {
  const r = schema.safeParse(input)
  assert.equal(r.success, false, 'expected validation to fail')
  return fieldErrors(r.error as Parameters<typeof fieldErrors>[0])
}

describe('validation messages', () => {
  test('missing required text says which field is required', () => {
    assert.equal(errors(companySchema, {}).name, 'Company name is required')
    assert.equal(errors(companySchema, { name: '   ' }).name, 'Company name is required')
    assert.equal(errors(taskSchema, { title: 'Call' }).dueDate, 'Due date is required')
  })
  test('a wrong type keeps the generic message instead of "required"', () => {
    assert.notEqual(errors(companySchema, { name: 42 }).name, 'Company name is required')
  })
  test('numbers explain what to enter', () => {
    const base = { name: 'Deal', companyId: 'c1', services: ['AI Agents'] }
    assert.equal(errors(opportunitySchema, { ...base, value: 'lots' }).value, 'Enter the estimated deal value')
    assert.equal(errors(opportunitySchema, base).value, 'Enter the estimated deal value')
    assert.equal(errors(leadSchema, { companyId: 'c', contactId: 'p', title: 'T', estimatedBudget: 'abc' }).estimatedBudget, 'Enter a number')
  })
  test('custom rules and formats', () => {
    assert.equal(errors(companySchema, { name: 'Acme', website: 'not a url' }).website, 'Enter a valid URL')
    assert.equal(errors(inquirySchema, { name: 'A', email: 'nope', company: 'C', problem: 'P' }).email, 'Enter a valid work email')
    assert.equal(errors(opportunitySchema, { name: 'Deal', companyId: 'c1', value: 1, services: [] }).services, 'Pick at least one service')
  })
})

describe('parsing', () => {
  test('blank optional fields become null and defaults fill in', () => {
    const lead = leadSchema.parse({ companyId: 'c', contactId: 'p', title: 'T', estimatedBudget: '', website: '' })
    assert.equal(lead.estimatedBudget, null)
    assert.equal(lead.status, 'New Lead')
    assert.deepEqual(lead.services, [])
  })
  test('settings accept a subset of stage probabilities', () => {
    const s = settingsSchema.parse({ stageProbabilities: { 'Proposal Sent': 60 } })
    assert.deepEqual(s.stageProbabilities, { 'Proposal Sent': 60 })
    assert.deepEqual(settingsSchema.parse({}), {}, 'a partial settings update adds nothing')
  })
  test('websites without a scheme get https://', () => {
    assert.equal(companySchema.parse({ name: 'Acme', website: 'acme.example' }).website, 'https://acme.example')
  })
})
