import type { ZodType } from 'zod'
import { ZodError } from 'zod'
import {
  DEFAULT_SETTINGS, LEAD_STATUSES, STAGES,
  type Activity, type Bootstrap, type Company, type Contact, type Lead, type LeadStatus, type Opportunity, type OrgSettings,
  type Proposal, type Stage, type Task, type User,
} from '../shared/model'
import {
  activitySchema, campaignSchema, companySchema, contactSchema, conversationSchema, eventSchema, fieldErrors, intakeSchema,
  inquirySchema, invoiceSchema, leadSchema, opportunitySchema, proposalSchema, serviceSchema, settingsSchema, stageChangeSchema,
  taskSchema, userSchema, type InquiryInput, type IntakeInput,
} from '../shared/schemas'
import { stageIndex, todayIso } from '../shared/calc'
import { canManage, hashPassword, publicUser } from './auth'
import { now, Repo, type TableKey } from './repo'
import { aiStatus } from './ai'

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message) }
}

type Row = Record<string, unknown>
type Hooks = {
  /** adjust validated data before it is written; prev is undefined on create */
  before?: (svc: CrmService, data: Row, prev: Row | undefined, patch: Row, user: User) => Promise<void>
  after?: (svc: CrmService, next: Row, prev: Row | undefined, user: User) => Promise<void>
  adminOnly?: boolean
  ownerField?: string
  fkMessage?: string
}

interface EntityDef { table: TableKey; schema: ZodType; hooks?: Hooks }

const ENTITIES: Record<string, EntityDef> = {
  companies: { table: 'companies', schema: companySchema, hooks: { ownerField: 'ownerId', fkMessage: 'This company still has leads, opportunities or invoices. Move or delete them first.' } },
  contacts: { table: 'contacts', schema: contactSchema, hooks: { fkMessage: 'This contact is the primary contact of a lead. Reassign the lead first.', before: checkContactCompany } },
  leads: { table: 'leads', schema: leadSchema, hooks: { ownerField: 'ownerId', before: beforeLead, after: afterLead } },
  opportunities: { table: 'opportunities', schema: opportunitySchema, hooks: { ownerField: 'ownerId', before: beforeOpportunity, after: afterOpportunity } },
  tasks: { table: 'tasks', schema: taskSchema, hooks: { ownerField: 'ownerId', before: beforeTask, after: afterTask } },
  activities: { table: 'activities', schema: activitySchema, hooks: { before: beforeActivity, after: afterActivity } },
  proposals: { table: 'proposals', schema: proposalSchema, hooks: { before: beforeProposal, after: afterProposal } },
  events: { table: 'events', schema: eventSchema, hooks: { ownerField: 'ownerId', before: beforeEvent, after: afterEvent } },
  campaigns: { table: 'campaigns', schema: campaignSchema },
  services: { table: 'services', schema: serviceSchema, hooks: { adminOnly: true } },
  invoices: { table: 'invoices', schema: invoiceSchema },
  conversations: { table: 'conversations', schema: conversationSchema },
  users: { table: 'users', schema: userSchema, hooks: { adminOnly: true, before: beforeUser, fkMessage: 'This user cannot be removed.' } },
}
export const ENTITY_NAMES = Object.keys(ENTITIES)

export class CrmService {
  constructor(readonly repo: Repo) {}
  get db() { return this.repo.db }

  /* ---------- settings ---------- */
  async settings(): Promise<OrgSettings> {
    const rows = await this.db.all<{ key: string; value: string }>('SELECT key, value FROM settings')
    const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]))
    return { ...DEFAULT_SETTINGS, ...stored, stageProbabilities: { ...DEFAULT_SETTINGS.stageProbabilities, ...(stored.stageProbabilities ?? {}) } }
  }
  async saveSettings(patch: Partial<OrgSettings>) {
    await this.db.tx(async () => {
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) await this.db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, JSON.stringify(v)])
      }
    })
    return this.settings()
  }
  async updateSettings(input: unknown) {
    const parsed = validate(settingsSchema, input)
    if (parsed.qualification) {
      const keys = parsed.qualification.map((c) => c.key)
      if (new Set(keys).size !== keys.length) throw new HttpError(400, 'Criterion keys must be unique', { qualification: 'Duplicate key' })
      if (parsed.qualification.reduce((a, c) => a + c.weight, 0) <= 0) throw new HttpError(400, 'Weights must add up to more than 0')
    }
    return this.saveSettings(parsed as Partial<OrgSettings>)
  }

  /* ---------- activity log ---------- */
  log(a: Pick<Activity, 'type' | 'title'> & Partial<Activity>, user?: User | null) {
    return this.repo.insert<Activity>('activities', {
      body: null, leadId: null, opportunityId: null, companyId: null, contactId: null,
      ...a, userId: a.userId ?? user?.id ?? null, occurredAt: a.occurredAt ?? now(),
    })
  }

  /* ---------- generic CRUD ---------- */
  async create<T = Row>(entity: string, input: unknown, user: User): Promise<T> {
    const def = entityDef(entity)
    if (def.hooks?.adminOnly && user.role !== 'admin') throw new HttpError(403, 'Only admins can do this')
    const data = validate(def.schema, input) as Row
    return this.db.tx(async () => {
      await def.hooks?.before?.(this, data, undefined, (input ?? {}) as Row, user)
      const row = await wrapFk(() => this.repo.insert(def.table, data), 'A related record does not exist.')
      await def.hooks?.after?.(this, row, undefined, user)
      return this.view(entity, row) as T
    })
  }

  async update<T = Row>(entity: string, id: string, patch: unknown, user: User): Promise<T> {
    const def = entityDef(entity)
    if (def.hooks?.adminOnly && user.role !== 'admin') throw new HttpError(403, 'Only admins can do this')
    const prev = await this.repo.get<Row>(def.table, id)
    if (!prev) throw new HttpError(404, 'Record not found')
    const p = (patch ?? {}) as Row
    const ownerField = def.hooks?.ownerField
    if (ownerField && ownerField in p && p[ownerField] !== prev[ownerField] && !canManage(user, prev[ownerField] as string)) {
      throw new HttpError(403, 'Only the owner or an admin can reassign this record')
    }
    const merged = { ...strip(prev), ...p }
    const data = validate(def.schema, merged) as Row
    return this.db.tx(async () => {
      await def.hooks?.before?.(this, data, prev, p, user)
      const row = await wrapFk(() => this.repo.update(def.table, id, data), 'A related record does not exist.')
      await def.hooks?.after?.(this, row, prev, user)
      return this.view(entity, row) as T
    })
  }

  async remove(entity: string, id: string, user: User) {
    const def = entityDef(entity)
    if (def.hooks?.adminOnly && user.role !== 'admin') throw new HttpError(403, 'Only admins can do this')
    const prev = await this.repo.get<Row>(def.table, id)
    if (!prev) throw new HttpError(404, 'Record not found')
    if (entity === 'users' && id === user.id) throw new HttpError(400, 'You cannot remove your own account')
    const ownerField = def.hooks?.ownerField
    if (ownerField && !canManage(user, prev[ownerField] as string)) throw new HttpError(403, 'Only the owner or an admin can delete this record')
    await wrapFk(() => this.repo.remove(def.table, id), def.hooks?.fkMessage ?? 'This record is still referenced by other records.', 409)
    return { id }
  }

  private view(entity: string, row: Row): unknown {
    return entity === 'users' ? publicUser(row as never) : row
  }

  /* ---------- pipeline ---------- */
  changeStage(id: string, input: unknown, user: User) {
    const body = validate(stageChangeSchema, input)
    return this.update<Opportunity>('opportunities', id, { stage: body.stage, lostReason: body.lostReason ?? null, lostNote: body.lostNote ?? null }, user)
  }

  /** Move a lead forward through its status list (never backwards, never out of Disqualified) */
  async advanceLead(leadId: string | null | undefined, to: LeadStatus, why: string, user: User | null) {
    if (!leadId) return
    const lead = await this.repo.get<Lead>('leads', leadId)
    if (!lead || lead.status === 'Disqualified') return
    if (LEAD_STATUSES.indexOf(lead.status) >= LEAD_STATUSES.indexOf(to)) return
    await this.repo.update('leads', leadId, { status: to })
    await this.log({ type: 'status_change', title: `Status changed from ${lead.status} to ${to}`, body: why, leadId, companyId: lead.companyId }, user)
  }

  /* ---------- duplicates & intake ---------- */
  async findDuplicates(q: { companyName?: string | null; website?: string | null; email?: string | null }) {
    const companies = await this.repo.all<Company>('companies')
    const nameKey = q.companyName ? normName(q.companyName) : null
    const domain = domainOf(q.website) ?? businessDomain(q.email)
    const companyMatches = companies.filter((c) =>
      (nameKey && normName(c.name) === nameKey) || (domain && domainOf(c.website) === domain))
    const contactMatches = q.email
      ? await this.repo.all<Contact>('contacts', 'email = ? COLLATE NOCASE', [q.email.trim()])
      : []
    const contactIds = new Set(contactMatches.map((c) => c.id))
    const leadMatches = (await this.repo.all<Lead>('leads', "status != 'Disqualified'")).filter((l) => contactIds.has(l.contactId))
    return { companies: companyMatches, contacts: contactMatches, leads: leadMatches }
  }

  async intake(input: unknown, user: User) {
    const body = validate(intakeSchema, input) as IntakeInput
    return this.db.tx(async () => {
      const newCompany = !('id' in body.company)
      const newContact = !('id' in body.contact)
      if (!body.allowDuplicate) {
        const dup = await this.findDuplicates({
          companyName: newCompany ? (body.company as { name: string }).name : null,
          website: newCompany ? (body.company as { website?: string | null }).website : null,
          email: newContact ? (body.contact as { email?: string | null }).email : null,
        })
        const existingContactLeads = !newContact ? await this.repo.all<Lead>('leads', "contactId = ? AND status != 'Disqualified'", [(body.contact as { id: string }).id]) : []
        if (dup.companies.length || dup.contacts.length || existingContactLeads.length) {
          throw new HttpError(409, 'Possible duplicate found', { ...dup, leads: [...dup.leads, ...existingContactLeads] })
        }
      }
      const company = newCompany
        ? await this.create<Company>('companies', { ownerId: user.id, ...body.company }, user)
        : await this.repo.get<Company>('companies', (body.company as { id: string }).id)
      if (!company) throw new HttpError(400, 'Company not found')
      const contact = newContact
        ? await this.create<Contact>('contacts', { ...body.contact, companyId: company.id }, user)
        : await this.repo.get<Contact>('contacts', (body.contact as { id: string }).id)
      if (!contact) throw new HttpError(400, 'Contact not found')
      const lead = await this.create<Lead>('leads', { ownerId: user.id, ...body.lead, companyId: company.id, contactId: contact.id }, user)
      return { lead, company, contact }
    })
  }

  /** Public website inquiry → company/contact (reused when they exist) + lead + response task */
  async inquiry(input: unknown) {
    const body = validate(inquirySchema, input) as InquiryInput
    if (body.company_url) return { ok: true } // honeypot tripped — silently accept
    return this.db.tx(async () => {
      const dup = await this.findDuplicates({ companyName: body.company, website: body.website, email: body.email })
      const owner = await this.pickOwner()
      let company = dup.companies[0]
      if (!company) {
        company = await this.repo.insert<Company>('companies', {
          name: body.company, website: body.website ?? null, size: body.companySize ?? null, industry: null, location: null,
          description: null, notes: null, ownerId: owner?.id ?? null,
        })
      }
      let contact = dup.contacts.find((c) => c.companyId === company!.id) ?? dup.contacts[0]
      if (!contact) {
        contact = await this.repo.insert<Contact>('contacts', {
          companyId: company.id, name: body.name, email: body.email, phone: body.phone ?? null, title: body.jobTitle ?? null,
          linkedin: null, avatar: null, preferredContact: body.preferredContact ?? null, isDecisionMaker: false,
        })
      }
      const open = dup.leads.find((l) => l.contactId === contact!.id)
      if (open) {
        await this.log({ type: 'email', title: 'New website inquiry from an existing lead', body: body.problem, leadId: open.id, companyId: open.companyId, contactId: contact.id }, null)
        return { ok: true }
      }
      const lead = await this.repo.insert<Lead>('leads', {
        companyId: company.id, contactId: contact.id, ownerId: owner?.id ?? null,
        title: body.problem.split(/[.\n]/)[0].slice(0, 90) || 'Website inquiry',
        source: 'Website Inquiry', status: 'New Lead', temperature: null, qualification: {},
        estimatedBudget: body.budget ?? null, estimatedValue: null, probability: null, expectedDecisionDate: null,
        nextFollowUp: todayIso(), businessProblem: body.problem, techStack: null, existingSystems: null, desiredSolution: null,
        projectType: null, engagementModel: null, timeline: body.timeline ?? null, decisionMakers: null, budgetReadiness: null,
        technicalComplexity: null, additionalRequirements: null, preferredContact: body.preferredContact ?? null,
        services: body.services, disqualifyReason: null,
      })
      await this.log({ type: 'system', title: 'Inquiry received via website form', body: body.problem, leadId: lead.id, companyId: company.id, contactId: contact.id }, null)
      await this.repo.insert<Task>('tasks', {
        title: `Respond to website inquiry from ${body.name}`, type: 'Follow-up', priority: 'High', dueDate: todayIso(), dueTime: null,
        status: 'Open', ownerId: owner?.id ?? null, leadId: lead.id, opportunityId: null, companyId: company.id, notes: null, completedAt: null,
      })
      return { ok: true }
    })
  }

  /** Auto-assign: the sales rep (or admin, if no reps) with the fewest active leads */
  async pickOwner(): Promise<User | undefined> {
    const row = await this.db.get<User & { passwordHash: string }>(`
      SELECT u.*, (SELECT COUNT(*) FROM leads l WHERE l.ownerId = u.id AND l.status != 'Disqualified') AS load
      FROM users u ORDER BY CASE u.role WHEN 'sales_rep' THEN 0 ELSE 1 END, load, u.createdAt LIMIT 1`)
    return publicUser(row)
  }

  /* ---------- messages ---------- */
  async postMessage(conversationId: string, body: string, user: User) {
    if (!(await this.repo.get('conversations', conversationId))) throw new HttpError(404, 'Conversation not found')
    const text = String(body ?? '').trim()
    if (!text) throw new HttpError(400, 'Message is empty', { body: 'Message is required' })
    if (text.length > 4000) throw new HttpError(400, 'Message is too long')
    return this.repo.insert('messages', { conversationId, userId: user.id, author: user.name, body: text })
  }

  /* ---------- bootstrap ---------- */
  async bootstrap(user: User): Promise<Bootstrap> {
    const r = this.repo
    // Independent reads: run them together (one round trip each to a remote database)
    const [users, companies, contacts, leads, opportunities, stageHistory, tasks, activities, proposals, events, campaigns, services, invoices, conversations, messages, settings] =
      await Promise.all([
        r.all('users'), r.all('companies'), r.all('contacts'), r.all('leads'), r.all('opportunities'), r.all('stageHistory'),
        r.all('tasks'), r.all('activities'), r.all('proposals'), r.all('events'), r.all('campaigns'), r.all('services'),
        r.all('invoices'), r.all('conversations'), r.all('messages'), this.settings(),
      ])
    return {
      me: user,
      users: users.map((u) => publicUser(u as never)!),
      companies, contacts, leads, opportunities, stageHistory, tasks, activities, proposals, events, campaigns, services, invoices, conversations, messages,
      settings,
      meta: { ai: aiStatus() },
    } as unknown as Bootstrap
  }

  /** Remove every business record (keeps users, settings and the service catalog) */
  async clearBusinessData() {
    await this.db.tx(async () => {
      for (const t of ['messages', 'conversations', 'invoices', 'campaigns', 'events', 'proposals', 'activities', 'tasks', 'stage_history', 'opportunities', 'leads', 'contacts', 'companies']) {
        await this.db.run(`DELETE FROM ${t}`)
      }
      await this.saveSettings({ demoData: false })
    })
  }
}

/* ================= hooks ================= */

async function checkContactCompany(svc: CrmService, data: Row) {
  if (!(await svc.repo.get('companies', data.companyId as string))) throw new HttpError(400, 'Company not found', { companyId: 'Company not found' })
}

async function beforeLead(svc: CrmService, data: Row, prev: Row | undefined, _patch: Row, user: User) {
  const contact = await svc.repo.get<Contact>('contacts', data.contactId as string)
  if (!contact) throw new HttpError(400, 'Contact not found', { contactId: 'Contact not found' })
  if (contact.companyId !== data.companyId) throw new HttpError(400, 'The contact belongs to a different company', { contactId: 'Pick a contact from this company' })
  if (!prev && !data.ownerId) data.ownerId = user.id
  if (data.status !== 'Disqualified') data.disqualifyReason = null
}

async function afterLead(svc: CrmService, next: Row, prev: Row | undefined, user: User) {
  const l = next as unknown as Lead
  const base = { leadId: l.id, companyId: l.companyId, contactId: l.contactId }
  if (!prev) {
    await svc.log({ ...base, type: 'system', title: `Lead created (${l.status})`, body: l.businessProblem }, user)
    return
  }
  const p = prev as unknown as Lead
  if (p.status !== l.status) {
    await svc.log({ ...base, type: 'status_change', title: `Status changed from ${p.status} to ${l.status}`, body: l.status === 'Disqualified' ? l.disqualifyReason : null }, user)
  }
  if (p.ownerId !== l.ownerId) {
    const owner = l.ownerId ? await svc.repo.get<User>('users', l.ownerId) : null
    await svc.log({ ...base, type: 'system', title: `Lead owner changed to ${owner?.name ?? 'Unassigned'}` }, user)
  }
  if (p.temperature !== l.temperature && l.temperature) await svc.log({ ...base, type: 'system', title: `Temperature set to ${l.temperature}` }, user)
}

async function beforeOpportunity(svc: CrmService, data: Row, prev: Row | undefined, patch: Row, user: User) {
  const companyId = data.companyId as string
  if (!(await svc.repo.get('companies', companyId))) throw new HttpError(400, 'Company not found', { companyId: 'Company not found' })
  if (data.contactId) {
    const c = await svc.repo.get<Contact>('contacts', data.contactId as string)
    if (!c || c.companyId !== companyId) throw new HttpError(400, 'The contact belongs to a different company', { contactId: 'Pick a contact from this company' })
  }
  if (data.leadId) {
    const l = await svc.repo.get<Lead>('leads', data.leadId as string)
    if (!l || l.companyId !== companyId) throw new HttpError(400, 'The lead belongs to a different company', { leadId: 'Pick a lead from this company' })
  }
  if (!prev && !data.ownerId) data.ownerId = user.id
  const stage = data.stage as Stage
  const stageChanged = !prev || prev.stage !== stage
  const probabilities = (await svc.settings()).stageProbabilities
  // Probability follows the stage unless the user set it explicitly in this request
  if (stageChanged && (patch.probability === undefined || patch.probability === null || patch.probability === '')) {
    data.probability = probabilities[stage] ?? 0
  }
  if (data.probability === null || data.probability === undefined) data.probability = probabilities[stage] ?? 0
  if (stage === 'Closed Lost' && !data.lostReason) throw new HttpError(400, 'A lost reason is required', { lostReason: 'Pick a lost reason' })
  if (stage !== 'Closed Lost') { data.lostReason = null; data.lostNote = null }
  if (stage === 'Closed Won' || stage === 'Closed Lost') {
    if (stageChanged || !prev?.closedAt) data.closedAt = now()
    if (stage === 'Closed Won') data.probability = 100
    if (stage === 'Closed Lost') data.probability = 0
  } else data.closedAt = null
}

async function afterOpportunity(svc: CrmService, next: Row, prev: Row | undefined, user: User) {
  const o = next as unknown as Opportunity
  const base = { opportunityId: o.id, companyId: o.companyId, leadId: o.leadId, contactId: o.contactId }
  if (!prev || prev.stage !== o.stage) {
    await svc.repo.insert('stageHistory', { opportunityId: o.id, fromStage: prev ? prev.stage : null, toStage: o.stage, userId: user.id, changedAt: now() })
    await svc.log({
      ...base,
      type: prev ? 'status_change' : 'system',
      title: prev ? `${o.name}: ${prev.stage} → ${o.stage}` : `Opportunity created: ${o.name} (${o.stage})`,
      body: o.stage === 'Closed Lost' ? [o.lostReason, o.lostNote].filter(Boolean).join(' — ') : null,
    }, user)
    if (stageIndex(o.stage) >= stageIndex('Qualified Opportunity') && o.stage !== 'Closed Lost') {
      await svc.advanceLead(o.leadId, 'Qualified', `Opportunity “${o.name}” reached ${o.stage}`, user)
    }
  }
  if (prev && prev.value !== o.value) await svc.log({ ...base, type: 'system', title: `${o.name}: estimated value updated` }, user)
}

async function deriveCompany(svc: CrmService, data: Row) {
  if (data.companyId) return
  if (data.opportunityId) data.companyId = (await svc.repo.get<Opportunity>('opportunities', data.opportunityId as string))?.companyId ?? null
  if (!data.companyId && data.leadId) data.companyId = (await svc.repo.get<Lead>('leads', data.leadId as string))?.companyId ?? null
}

async function beforeTask(svc: CrmService, data: Row, prev: Row | undefined, _patch: Row, user: User) {
  await deriveCompany(svc, data)
  if (!prev && !data.ownerId) data.ownerId = user.id
  if (data.status === 'Completed') data.completedAt = prev?.status === 'Completed' ? prev.completedAt : now()
  else data.completedAt = null
}

async function afterTask(svc: CrmService, next: Row, prev: Row | undefined, user: User) {
  const t = next as unknown as Task
  const base = { leadId: t.leadId, opportunityId: t.opportunityId, companyId: t.companyId }
  if (!t.leadId && !t.opportunityId && !t.companyId) return
  if (!prev) await svc.log({ ...base, type: 'task', title: `${t.type} scheduled: ${t.title}`, body: `Due ${t.dueDate}${t.dueTime ? ' ' + t.dueTime : ''} · ${t.priority} priority` }, user)
  else if (prev.status !== 'Completed' && t.status === 'Completed') await svc.log({ ...base, type: 'task', title: `Completed: ${t.title}`, body: t.notes }, user)
}

async function beforeActivity(svc: CrmService, data: Row, _prev: Row | undefined, _patch: Row, user: User) {
  await deriveCompany(svc, data)
  data.userId = user.id
  data.occurredAt = data.occurredAt || now()
}

async function afterActivity(svc: CrmService, next: Row, prev: Row | undefined, user: User) {
  const a = next as unknown as Activity
  if (!prev && ['call', 'email', 'meeting'].includes(a.type)) {
    await svc.advanceLead(a.leadId, 'Contacted', `First ${a.type} logged`, user)
  }
}

async function beforeProposal(svc: CrmService, data: Row, prev: Row | undefined) {
  const opp = await svc.repo.get<Opportunity>('opportunities', data.opportunityId as string)
  if (!opp) throw new HttpError(400, 'Opportunity not found', { opportunityId: 'Opportunity not found' })
  data.companyId = opp.companyId
  if (data.status === 'Sent' && !prev?.sentAt) data.sentAt = now()
  else if (prev) data.sentAt = prev.sentAt
  else data.sentAt = null
}

async function afterProposal(svc: CrmService, next: Row, prev: Row | undefined, user: User) {
  const p = next as unknown as Proposal
  const opp = await svc.repo.get<Opportunity>('opportunities', p.opportunityId)
  const base = { opportunityId: p.opportunityId, companyId: p.companyId, leadId: opp?.leadId ?? null }
  if (!prev) await svc.log({ ...base, type: 'proposal', title: `Proposal created: ${p.title} (${p.status})` }, user)
  else if (prev.status !== p.status) await svc.log({ ...base, type: 'proposal', title: `Proposal “${p.title}” marked ${p.status}` }, user)
  else if (prev.price !== p.price) await svc.log({ ...base, type: 'proposal', title: `Proposal “${p.title}” price revised` }, user)
}

async function beforeEvent(svc: CrmService, data: Row, prev: Row | undefined, _patch: Row, user: User) {
  await deriveCompany(svc, data)
  if (!prev && !data.ownerId) data.ownerId = user.id
}

async function afterEvent(svc: CrmService, next: Row, prev: Row | undefined, user: User) {
  if (prev) return
  const e = next as unknown as { id: string; title: string; date: string; start: string; kind: string; leadId: string | null; opportunityId: string | null; companyId: string | null }
  if (!e.leadId && !e.opportunityId && !e.companyId) return
  await svc.log({ type: 'meeting', title: `${e.kind} scheduled: ${e.title}`, body: `${e.date} at ${e.start}`, leadId: e.leadId, opportunityId: e.opportunityId, companyId: e.companyId }, user)
  if (e.kind === 'Discovery Meeting') await svc.advanceLead(e.leadId, 'Discovery Scheduled', `Discovery meeting booked for ${e.date}`, user)
}

async function beforeUser(svc: CrmService, data: Row, prev: Row | undefined) {
  const dupe = await svc.db.get('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id != ?', [data.email as string, (prev?.id as string) ?? ''])
  if (dupe) throw new HttpError(409, 'A user with this email already exists', { email: 'Already in use' })
  if (data.password) data.passwordHash = hashPassword(data.password as string)
  else if (prev) data.passwordHash = prev.passwordHash
  else data.passwordHash = null
  delete data.password
}

/* ================= helpers ================= */

function entityDef(name: string) {
  const def = ENTITIES[name]
  if (!def) throw new HttpError(404, 'Unknown resource')
  return def
}

export function validate<T extends ZodType>(schema: T, input: unknown) {
  try {
    return schema.parse(input) as ReturnType<T['parse']>
  } catch (e) {
    if (e instanceof ZodError) throw new HttpError(400, 'Please fix the highlighted fields', fieldErrors(e))
    throw e
  }
}

async function wrapFk<T>(fn: () => Promise<T>, message: string, status = 400): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const msg = String((e as Error).message)
    if (msg.includes('FOREIGN KEY')) throw new HttpError(status, message)
    if (msg.includes('UNIQUE')) throw new HttpError(409, 'This record already exists')
    throw e
  }
}

/** Remove server-managed columns before re-validating a merged record */
function strip(row: Row) {
  const { id, code, createdAt, updatedAt, closedAt, completedAt, sentAt, passwordHash, ...rest } = row
  void id; void code; void createdAt; void updatedAt; void closedAt; void completedAt; void sentAt; void passwordHash
  return rest
}

const SUFFIXES = /\b(inc|llc|ltd|limited|pvt|private|corp|corporation|co|company|gmbh|plc|llp)\b/g
export const normName = (s: string) => s.toLowerCase().replace(SUFFIXES, '').replace(/[^a-z0-9]/g, '')
export function domainOf(url?: string | null) {
  if (!url) return null
  try { return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase() } catch { return null }
}
const FREE_MAIL = new Set(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'protonmail.com', 'aol.com', 'live.com', 'rediffmail.com'])
export function businessDomain(email?: string | null) {
  const d = email?.split('@')[1]?.toLowerCase()
  return d && !FREE_MAIL.has(d) ? d : null
}

export { STAGES }
