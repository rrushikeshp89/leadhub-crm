import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../server/app'
import { publicUser } from '../server/auth'
import { STAGES } from '../shared/model'
import { pipelineSummary } from '../shared/calc'

test('demo seed loads with valid references and is flagged as demo data', async () => {
  const { svc, db } = await createApp({ dbUrl: ':memory:', admin: { email: 'a@test.local', password: 'x-password-1' }, demo: true, repPassword: 'rep-password' })
  const b = await svc.bootstrap(publicUser((await db.get('SELECT * FROM users LIMIT 1')) as never)!)
  assert.equal(b.settings.demoData, true)
  assert.equal((await db.all('PRAGMA foreign_key_check')).length, 0)
  const companies = new Set(b.companies.map((c) => c.id))
  for (const c of b.contacts) assert.ok(companies.has(c.companyId))
  for (const l of b.leads) {
    assert.ok(companies.has(l.companyId))
    assert.equal(b.contacts.find((c) => c.id === l.contactId)?.companyId, l.companyId, 'lead contact belongs to lead company')
  }
  for (const o of b.opportunities) {
    assert.ok(STAGES.includes(o.stage))
    assert.equal(o.probability, b.settings.stageProbabilities[o.stage])
    if (o.stage === 'Closed Lost') assert.ok(o.lostReason)
    assert.equal(b.stageHistory.filter((h) => h.opportunityId === o.id).at(-1)?.toStage, o.stage, 'history ends at current stage')
  }
  assert.ok(new Set(b.opportunities.map((o) => o.stage)).size >= 8, 'demo covers most stages')
  assert.ok(pipelineSummary(b.opportunities).wonValue > 0)
  assert.ok(b.services.length >= 20)

  await svc.clearBusinessData()
  const empty = await svc.bootstrap(b.me)
  assert.equal(empty.leads.length + empty.companies.length + empty.opportunities.length, 0)
  assert.equal(empty.settings.demoData, false)
  assert.ok(empty.users.length >= 1 && empty.services.length >= 20, 'keeps users and the service catalog')
})
