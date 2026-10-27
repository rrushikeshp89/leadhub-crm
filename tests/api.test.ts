/**
 * End-to-end API tests against a throwaway in-memory database.
 * Walks the fictional "Acme Technologies" scenario from the product brief through the full
 * lead → opportunity → proposal → close lifecycle and checks the business rules on the way.
 */
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from '../server/app'
import { isOverdue, pipelineSummary, qualificationScore, stageConversion, weightedValue, todayIso } from '../shared/calc'
import type { Bootstrap, Lead, Opportunity, Proposal, Task } from '../shared/model'

const ADMIN = { email: 'admin@test.local', password: 'test-password-123' }
let server: Server
let base = ''

class Client {
  cookie = ''
  async call<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const set = res.headers.get('set-cookie')
    if (set) this.cookie = set.split(';')[0]
    const text = await res.text()
    return { status: res.status, data: text ? JSON.parse(text) : null }
  }
  get = <T = any>(p: string) => this.call<T>('GET', p)
  post = <T = any>(p: string, b: unknown = {}) => this.call<T>('POST', p, b)
  patch = <T = any>(p: string, b: unknown) => this.call<T>('PATCH', p, b)
  del = <T = any>(p: string) => this.call<T>('DELETE', p)
}

const admin = new Client()
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) }

before(async () => {
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_AUTH_TOKEN
  delete process.env.AI_ENABLED
  const { app } = await createApp({ dbUrl: ':memory:', admin: ADMIN, demo: false })
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
})
after(() => server.close())

describe('auth', () => {
  test('rejects unauthenticated access and bad passwords', async () => {
    assert.equal((await new Client().get('/bootstrap')).status, 401)
    assert.equal((await new Client().post('/auth/login', { email: ADMIN.email, password: 'wrong' })).status, 401)
  })
  test('signs in with a session cookie', async () => {
    const r = await admin.post('/auth/login', ADMIN)
    assert.equal(r.status, 200)
    assert.equal(r.data.user.role, 'admin')
    assert.equal(r.data.user.passwordHash, undefined, 'never leaks the hash')
    assert.ok(admin.cookie.startsWith('lh_sid='))
  })
})

describe('Acme Technologies scenario', () => {
  const ids: Record<string, string> = {}
  const boot = async () => (await admin.get<Bootstrap>('/bootstrap')).data
  const lead = async () => (await boot()).leads.find((l) => l.id === ids.lead)!

  test('creates the lead, company and contact in one intake', async () => {
    const r = await admin.post('/intake', {
      company: { name: 'Acme Technologies', industry: 'E-commerce', size: '100–250', website: 'acme-tech.example' },
      contact: { name: 'Priya Sharma', title: 'CTO', email: 'priya.sharma@acme-tech.example', isDecisionMaker: true },
      lead: {
        title: 'AI-powered customer support assistant', source: 'Website Inquiry', status: 'New Lead',
        services: ['Generative AI', 'AI Solutions'], estimatedBudget: 1200000, timeline: 'Three months',
        businessProblem: 'Support team spends too much time answering repetitive questions.',
        desiredSolution: 'Generative AI and RAG-based chatbot',
      },
    })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    ids.lead = r.data.lead.id; ids.company = r.data.company.id; ids.contact = r.data.contact.id
    assert.match(r.data.lead.code, /^LD-\d{4}$/)
    assert.equal(r.data.company.website, 'https://acme-tech.example', 'normalises websites')
    const l = await lead()
    assert.equal(l.status, 'New Lead')
    assert.equal(l.estimatedValue, null, 'unknown values stay unknown')
    assert.deepEqual(l.services, ['Generative AI', 'AI Solutions'])
  })

  test('blocks an accidental duplicate company or contact', async () => {
    const r = await admin.post('/intake', {
      company: { name: 'ACME Technologies Pvt Ltd' },
      contact: { name: 'P. Sharma', email: 'PRIYA.SHARMA@acme-tech.example' },
      lead: { title: 'Duplicate', services: [] },
    })
    assert.equal(r.status, 409)
    assert.equal(r.data.details.companies[0].id, ids.company)
    assert.equal(r.data.details.contacts[0].id, ids.contact)
  })

  test('validates input and relationships', async () => {
    const bad = await admin.post('/intake', { company: { name: '' }, contact: { name: 'X', email: 'not-an-email' }, lead: { title: 'T', estimatedBudget: -5 } })
    assert.equal(bad.status, 400)
    assert.ok(bad.data.details['company.name'] || bad.data.details['company'], JSON.stringify(bad.data.details))
    const other = await admin.post('/companies', { name: 'Other Co' })
    const otherContact = await admin.post('/contacts', { companyId: other.data.id, name: 'Someone' })
    const mismatch = await admin.patch(`/leads/${ids.lead}`, { contactId: otherContact.data.id })
    assert.equal(mismatch.status, 400)
    assert.match(mismatch.data.error, /different company/)
    await admin.del(`/companies/${other.data.id}`)
  })

  test('logging a call moves the lead to Contacted', async () => {
    const r = await admin.post('/activities', { type: 'call', title: 'Intro call with Priya', leadId: ids.lead })
    assert.equal(r.status, 200)
    assert.equal(r.data.companyId, ids.company, 'company derived from the lead')
    assert.equal((await lead()).status, 'Contacted')
  })

  test('booking a discovery meeting moves the lead to Discovery Scheduled', async () => {
    const r = await admin.post('/events', { title: 'Discovery — Acme', kind: 'Discovery Meeting', date: todayIso(), start: '10:00', end: '11:00', leadId: ids.lead })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.equal((await lead()).status, 'Discovery Scheduled')
    const bad = await admin.post('/events', { title: 'Bad', date: todayIso(), start: '11:00', end: '10:00' })
    assert.equal(bad.status, 400)
  })

  test('records discovery findings and qualification', async () => {
    const r = await admin.patch(`/leads/${ids.lead}`, {
      status: 'Discovery Completed',
      existingSystems: 'Product documentation site, Zendesk knowledge base',
      qualification: { need: 3, fit: 3, budget: 2, timeline: 2 },
    })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    const b = await boot()
    const q = qualificationScore(r.data.qualification, b.settings.qualification)
    assert.equal(q.answered, 4)
    assert.deepEqual(q.missing, ['Decision-maker access'])
    assert.equal(q.score, Math.round(((30 + 20 + (20 * 2) / 3 + (15 * 2) / 3)) / 100 * 100))
    assert.ok(b.activities.some((a) => a.leadId === ids.lead && a.title === 'Status changed from Discovery Scheduled to Discovery Completed'))
  })

  test('creates an opportunity with stage-based probability and weighted value', async () => {
    const r = await admin.post<Opportunity>('/opportunities', {
      name: 'Acme AI support assistant', companyId: ids.company, contactId: ids.contact, leadId: ids.lead,
      services: ['Generative AI'], value: 1200000, stage: 'Discovery Completed',
      problemStatement: 'Repetitive support questions', proposedSolution: 'RAG assistant over docs and KB',
    })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    ids.opp = r.data.id
    assert.equal(r.data.probability, 25)
    assert.equal(weightedValue(r.data), 300000)
    const noService = await admin.post('/opportunities', { name: 'x', companyId: ids.company, value: 1, services: [] })
    assert.equal(noService.status, 400)
  })

  test('qualifying the opportunity qualifies the lead', async () => {
    const r = await admin.post(`/opportunities/${ids.opp}/stage`, { stage: 'Qualified Opportunity' })
    assert.equal(r.status, 200)
    assert.equal(r.data.probability, 40)
    assert.equal((await lead()).status, 'Qualified')
  })

  test('tracks the proposal and keeps the amount as potential revenue', async () => {
    await admin.post(`/opportunities/${ids.opp}/stage`, { stage: 'Solution Design' })
    const p = await admin.post<Proposal>('/proposals', { title: 'Acme — AI support assistant proposal', opportunityId: ids.opp, services: ['Generative AI'], price: 1200000, deliveryTimeline: '3 months' })
    assert.equal(p.status, 200, JSON.stringify(p.data))
    assert.equal(p.data.status, 'Draft')
    assert.equal(p.data.companyId, ids.company)
    assert.equal(p.data.sentAt, null)
    const sent = await admin.patch<Proposal>(`/proposals/${p.data.id}`, { status: 'Sent' })
    assert.ok(sent.data.sentAt, 'sentAt recorded')
    await admin.post(`/opportunities/${ids.opp}/stage`, { stage: 'Proposal Sent' })
    const neg = await admin.post<Opportunity>(`/opportunities/${ids.opp}/stage`, { stage: 'Negotiation' })
    assert.equal(neg.data.probability, 75)

    const s = pipelineSummary((await boot()).opportunities)
    assert.equal(s.openValue, 1200000)
    assert.equal(s.weightedValue, 900000)
    assert.equal(s.wonValue, 0, 'not confirmed revenue until Closed Won')
  })

  test('requires a lost reason and closes as won', async () => {
    const noReason = await admin.post(`/opportunities/${ids.opp}/stage`, { stage: 'Closed Lost' })
    assert.equal(noReason.status, 400)
    const won = await admin.post<Opportunity>(`/opportunities/${ids.opp}/stage`, { stage: 'Closed Won' })
    assert.equal(won.status, 200)
    assert.equal(won.data.probability, 100)
    assert.ok(won.data.closedAt)
    const b = await boot()
    const s = pipelineSummary(b.opportunities)
    assert.equal(s.wonValue, 1200000)
    assert.equal(s.openValue, 0)
    assert.equal(s.winRate, 1)
    const conv = stageConversion(b.opportunities, b.stageHistory)
    assert.equal(conv.find((c) => c.stage === 'Negotiation')!.reached, 1)
    assert.equal(conv.find((c) => c.stage === 'New Lead')!.reached, 1, 'later-stage entry counts as having passed earlier stages')
    const hist = b.stageHistory.filter((h) => h.opportunityId === ids.opp).map((h) => h.toStage)
    assert.deepEqual(hist, ['Discovery Completed', 'Qualified Opportunity', 'Solution Design', 'Proposal Sent', 'Negotiation', 'Closed Won'])
  })

  test('supports multiple contacts and opportunities per company', async () => {
    const pm = await admin.post('/contacts', { companyId: ids.company, name: 'Rohit Verma', title: 'Product Manager' })
    assert.equal(pm.status, 200)
    const mvp = await admin.post<Opportunity>('/opportunities', { name: 'Acme seller MVP', companyId: ids.company, contactId: pm.data.id, leadId: ids.lead, services: ['SaaS Development'], value: 800000 })
    assert.equal(mvp.data.stage, 'New Lead')
    assert.equal(mvp.data.probability, 5)
    const b = await boot()
    assert.equal(b.contacts.filter((c) => c.companyId === ids.company).length, 2)
    assert.equal(b.opportunities.filter((o) => o.companyId === ids.company).length, 2)
    const lost = await admin.post<Opportunity>(`/opportunities/${mvp.data.id}/stage`, { stage: 'Closed Lost', lostReason: 'Project postponed', lostNote: 'Next quarter' })
    assert.equal(lost.data.lostReason, 'Project postponed')
    const reopened = await admin.post<Opportunity>(`/opportunities/${mvp.data.id}/stage`, { stage: 'Contacted' })
    assert.equal(reopened.data.lostReason, null, 'reopening clears the lost reason')
    assert.equal(reopened.data.closedAt, null)
  })

  test('tasks: overdue detection and completion', async () => {
    const t = await admin.post<Task>('/tasks', { title: 'Schedule a technical architecture discussion', type: 'Technical Discussion', priority: 'High', dueDate: yesterday(), opportunityId: ids.opp })
    assert.equal(t.status, 200, JSON.stringify(t.data))
    assert.equal(t.data.companyId, ids.company)
    assert.equal(isOverdue(t.data), true)
    const done = await admin.patch<Task>(`/tasks/${t.data.id}`, { status: 'Completed' })
    assert.ok(done.data.completedAt)
    assert.equal(isOverdue(done.data), false)
    assert.ok((await boot()).activities.some((a) => a.title === 'Completed: Schedule a technical architecture discussion'))
    assert.equal((await admin.post('/tasks', { title: 'No date' })).status, 400)
  })

  test('protects referential integrity on delete', async () => {
    const r = await admin.del(`/companies/${ids.company}`)
    assert.equal(r.status, 409)
    assert.match(r.data.error, /still has leads/)
    const c = await admin.del(`/contacts/${ids.contact}`)
    assert.equal(c.status, 409)
  })
})

describe('public inquiry form', () => {
  test('creates a lead with a response task, and dedupes repeat inquiries', async () => {
    const body = { name: 'Jordan Lee', email: 'jordan@globex.example', company: 'Globex', problem: 'We want an AI agent to triage invoices. Budget approved.', services: ['AI Agents'], budget: 500000 }
    const r = await new Client().post('/public/inquiries', body)
    assert.equal(r.status, 200, JSON.stringify(r.data))
    let b = (await admin.get<Bootstrap>('/bootstrap')).data
    const l = b.leads.find((x) => x.source === 'Website Inquiry' && x.businessProblem?.startsWith('We want an AI agent'))!
    assert.ok(l)
    assert.equal(l.status, 'New Lead')
    assert.ok(b.tasks.some((t) => t.leadId === l.id && t.priority === 'High'))
    await new Client().post('/public/inquiries', { ...body, problem: 'Following up on my inquiry' })
    b = (await admin.get<Bootstrap>('/bootstrap')).data
    assert.equal(b.leads.filter((x: Lead) => x.contactId === l.contactId).length, 1, 'no duplicate lead')
    assert.ok(b.activities.some((a) => a.leadId === l.id && a.title.includes('existing lead')))
    const invalid = await new Client().post('/public/inquiries', { name: 'x', email: 'bad', company: '', problem: '' })
    assert.equal(invalid.status, 400)
  })
})

describe('permissions, settings and AI', () => {
  test('sales reps cannot change org settings', async () => {
    const u = await admin.post('/users', { name: 'Rep One', email: 'rep1@test.local', role: 'sales_rep', password: 'rep-password-1' })
    assert.equal(u.status, 200, JSON.stringify(u.data))
    assert.equal(u.data.canLogin, true)
    const rep = new Client()
    assert.equal((await rep.post('/auth/login', { email: 'rep1@test.local', password: 'rep-password-1' })).status, 200)
    assert.equal((await rep.patch('/settings', { staleDays: 3 })).status, 403)
    assert.equal((await rep.post('/users', { name: 'X', email: 'x@test.local' })).status, 403)
  })
  test('admins can configure the qualification framework', async () => {
    const r = await admin.patch('/settings', { qualification: [{ key: 'need', label: 'Need', weight: 60, hint: '' }, { key: 'budget', label: 'Budget', weight: 40, hint: '' }] })
    assert.equal(r.status, 200)
    assert.equal(qualificationScore({ need: 3, budget: null }, r.data.qualification).score, 60)
    assert.equal((await admin.patch('/settings', { qualification: [] })).status, 400)
  })
  test('AI endpoints report "not configured" instead of faking output', async () => {
    const b = (await admin.get<Bootstrap>('/bootstrap')).data
    assert.equal(b.meta.ai.configured, false)
    const r = await admin.post('/ai/summary', { leadId: b.leads[0].id })
    assert.equal(r.status, 503)
    assert.equal(r.data.details.code, 'ai_not_configured')
  })
})
