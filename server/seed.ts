/**
 * Demo data — every company, person and figure here is fictional.
 * The app labels this as demo data (settings.demoData = true) until it is cleared in Settings.
 */
import { STAGES, type Stage } from '../shared/model'
import { isoDay } from '../shared/calc'
import { hashPassword } from './auth'
import { newId, type Repo } from './repo'
import type { CrmService } from './service'

const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return isoDay(d) }
/** Timestamp N days from now at a given hour; past-dated records never land in the future */
const ts = (offsetDays: number, hour = 10) => {
  const d = new Date(); d.setDate(d.getDate() + offsetDays); d.setHours(hour, 0, 0, 0)
  return (offsetDays <= 0 ? new Date(Math.min(d.getTime(), Date.now() - 60_000)) : d).toISOString()
}
const av = (g: 'men' | 'women', n: number) => `https://randomuser.me/api/portraits/${g}/${n}.jpg`

/** The company's own service catalog (from the business brief). Prices are left for the team to set. */
export const SERVICE_CATALOG: { name: string; group: string; category: string; description: string }[] = [
  { name: 'Custom web application development', group: 'Custom Software Development', category: 'Web Application Development', description: 'Bespoke web platforms, portals and internal tools.' },
  { name: 'Mobile application development', group: 'Custom Software Development', category: 'Mobile App Development', description: 'Native and cross-platform iOS / Android apps.' },
  { name: 'Enterprise software solutions', group: 'Custom Software Development', category: 'Custom Software Development', description: 'Large-scale systems integrated with enterprise stacks.' },
  { name: 'SaaS product development', group: 'Custom Software Development', category: 'SaaS Development', description: 'Multi-tenant SaaS products from architecture to launch.' },
  { name: 'API development & third-party integrations', group: 'Custom Software Development', category: 'Custom Software Development', description: 'APIs, connectors and integration layers.' },
  { name: 'Cloud infrastructure & modernization', group: 'Custom Software Development', category: 'Custom Software Development', description: 'Cloud migration, DevOps and infrastructure as code.' },
  { name: 'Legacy system modernization', group: 'Custom Software Development', category: 'Custom Software Development', description: 'Re-platforming and incremental rewrites of legacy systems.' },
  { name: 'Business process automation', group: 'Custom Software Development', category: 'Automation', description: 'Workflow automation across tools and teams.' },
  { name: 'MVP development for startups', group: 'Custom Software Development', category: 'SaaS Development', description: 'Lean MVPs to validate product ideas quickly.' },
  { name: 'AI-powered business applications', group: 'AI Solutions', category: 'AI Solutions', description: 'Applications with AI at the core of the workflow.' },
  { name: 'Generative AI solutions', group: 'AI Solutions', category: 'Generative AI', description: 'LLM-powered content, copilots and assistants.' },
  { name: 'AI chatbots & virtual assistants', group: 'AI Solutions', category: 'Generative AI', description: 'Conversational assistants for customers and staff.' },
  { name: 'Retrieval-Augmented Generation (RAG) systems', group: 'AI Solutions', category: 'Generative AI', description: 'Assistants grounded in company knowledge and documents.' },
  { name: 'AI agents & multi-agent workflows', group: 'AI Solutions', category: 'AI Agents', description: 'Agents that plan and act across tools and systems.' },
  { name: 'Machine learning & predictive analytics', group: 'AI Solutions', category: 'Data Analytics', description: 'Forecasting, scoring and optimisation models.' },
  { name: 'Intelligent document processing', group: 'AI Solutions', category: 'AI Solutions', description: 'Extraction and classification from documents at scale.' },
  { name: 'AI-powered customer support automation', group: 'AI Solutions', category: 'AI Solutions', description: 'Deflection, triage and agent-assist for support teams.' },
  { name: 'AI integration into existing systems', group: 'AI Solutions', category: 'AI Solutions', description: 'Adding AI capabilities to software clients already run.' },
  { name: 'Custom AI proof-of-concept', group: 'AI Solutions', category: 'AI Solutions', description: 'Time-boxed PoCs that prove value before scale-up.' },
  { name: 'Technology consulting', group: 'Consulting & Digital Transformation', category: 'Technology Consulting', description: 'Independent advice on technology strategy and vendors.' },
  { name: 'AI readiness assessment', group: 'Consulting & Digital Transformation', category: 'Technology Consulting', description: 'Data, process and team readiness for AI adoption.' },
  { name: 'Digital transformation consulting', group: 'Consulting & Digital Transformation', category: 'Technology Consulting', description: 'Roadmaps for modernising operations and products.' },
  { name: 'Workflow optimization', group: 'Consulting & Digital Transformation', category: 'Automation', description: 'Process discovery and redesign before automation.' },
  { name: 'Data analytics & business intelligence', group: 'Consulting & Digital Transformation', category: 'Data Analytics', description: 'Data warehousing, dashboards and reporting.' },
  { name: 'Technology architecture consulting', group: 'Consulting & Digital Transformation', category: 'Technology Consulting', description: 'Architecture reviews and target-state design.' },
]

export async function seedServices(repo: Repo) {
  if ((await repo.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM services'))!.n) return
  for (const s of SERVICE_CATALOG) await repo.insert('services', { ...s, startingPrice: null, typicalDuration: null, active: true })
}

export function seedAdmin(repo: Repo, email: string, password: string) {
  return repo.insert<{ id: string }>('users', {
    name: 'Linda Adora', email, role: 'admin', title: 'Head of Sales', phone: '+91 98200 00001', territory: 'All regions',
    avatar: av('women', 90), passwordHash: hashPassword(password),
  })
}

export async function seedDemo(svc: CrmService, repPassword: string | null) {
  const repo = svc.repo
  await repo.db.tx(async () => {
    const admin = (await repo.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'admin' ORDER BY createdAt LIMIT 1"))!
    const pw = repPassword ? hashPassword(repPassword) : null
    const rep = async (name: string, email: string, title: string, territory: string, g: 'men' | 'women', n: number) => {
      const found = await repo.db.get<{ id: string }>('SELECT id FROM users WHERE email = ? COLLATE NOCASE', [email])
      return found?.id ?? (await repo.insert<{ id: string }>('users', { name, email, role: 'sales_rep', title, territory, phone: null, avatar: av(g, n), passwordHash: pw })).id
    }
    const U = {
      linda: admin.id,
      carlos: await rep('Carlos Garcia', 'carlos.garcia@leadhub.demo', 'Account Executive – Enterprise', 'West India', 'men', 32),
      angela: await rep('Angela Jackson', 'angela.jackson@leadhub.demo', 'Sales Development Rep', 'Inbound', 'women', 65),
      susan: await rep('Susan Chen', 'susan.chen@leadhub.demo', 'Solutions Consultant', 'Pre-sales', 'women', 68),
      daniel: await rep('Daniel Kim', 'daniel.kim@leadhub.demo', 'Account Executive – Startups', 'South India', 'men', 52),
    }

    type C = { name: string; website: string; industry: string; size: string; location: string; description: string; owner: string; age: number }
    const company = (c: C) => repo.insert<{ id: string }>('companies', {
      name: c.name, website: c.website, industry: c.industry, size: c.size, location: c.location, description: c.description, notes: null,
      ownerId: c.owner, createdAt: ts(-c.age), updatedAt: ts(-c.age),
    })
    const contact = (companyId: string, name: string, title: string, email: string, dm: boolean, g: 'men' | 'women', n: number, pref = 'Email') =>
      repo.insert<{ id: string }>('contacts', {
        companyId, name, title, email, phone: null, linkedin: `https://www.linkedin.com/in/${name.toLowerCase().replace(/[^a-z]+/g, '-')}-demo`,
        avatar: av(g, n), preferredContact: pref, isDecisionMaker: dm,
      })

    const lead = async (d: Record<string, unknown> & { companyId: string; contactId: string; ownerId: string; title: string; status: string; age: number }) => {
      const { age, ...rest } = d
      const row = await repo.insert<{ id: string; companyId: string; contactId: string }>('leads', {
        source: null, temperature: null, qualification: {}, estimatedBudget: null, estimatedValue: null, probability: null,
        expectedDecisionDate: null, nextFollowUp: null, businessProblem: null, techStack: null, existingSystems: null, desiredSolution: null,
        projectType: null, engagementModel: null, timeline: null, decisionMakers: null, budgetReadiness: null, technicalComplexity: null,
        additionalRequirements: null, preferredContact: null, services: [], disqualifyReason: null,
        ...rest, createdAt: ts(-age), updatedAt: ts(-Math.max(0, age - 3)),
      })
      await repo.insert('activities', { type: 'system', title: `Lead created (New Lead)`, body: rest.businessProblem ?? null, leadId: row.id, companyId: row.companyId, contactId: row.contactId, userId: rest.ownerId, occurredAt: ts(-age, 9) })
      return row
    }

    /** Opportunity with a realistic stage history from New Lead up to `stage` */
    const opp = async (d: { name: string; companyId: string; contactId: string; leadId: string; ownerId: string; services: string[]; value: number; stage: Stage; age: number; problem: string; solution?: string; timeline?: string; close?: number; competitors?: string; nextAction?: string; nextActionDate?: number; lostReason?: string; lostNote?: string }) => {
      const settings = await svc.settings()
      const path: Stage[] = d.stage === 'Closed Lost'
        ? [...STAGES.slice(0, STAGES.indexOf('Proposal Sent') + 1), 'Closed Lost']
        : STAGES.slice(0, STAGES.indexOf(d.stage) + 1)
      const closed = d.stage === 'Closed Won' || d.stage === 'Closed Lost'
      const id = newId('op')
      const step = Math.max(1, Math.floor(d.age / (path.length + 1)))
      const closedAt = closed ? ts(-(d.age - step * (path.length - 1)), 16) : null
      await repo.insert('opportunities', {
        id, name: d.name, companyId: d.companyId, contactId: d.contactId, leadId: d.leadId, ownerId: d.ownerId, services: d.services,
        problemStatement: d.problem, proposedSolution: d.solution ?? null, value: d.value, probability: settings.stageProbabilities[d.stage],
        deliveryTimeline: d.timeline ?? null, expectedCloseDate: d.close !== undefined ? day(d.close) : null, stage: d.stage,
        competitors: d.competitors ?? null, nextAction: d.nextAction ?? null, nextActionDate: d.nextActionDate !== undefined ? day(d.nextActionDate) : null,
        lostReason: d.lostReason ?? null, lostNote: d.lostNote ?? null, closedAt, createdAt: ts(-d.age), updatedAt: ts(-Math.max(0, d.age - step * path.length)),
      })
      for (const [i, s] of path.entries()) {
        const at = ts(-(d.age - step * i), 11 + (i % 5))
        await repo.insert('stageHistory', { opportunityId: id, fromStage: i ? path[i - 1] : null, toStage: s, userId: d.ownerId, changedAt: at })
        await repo.insert('activities', {
          type: i ? 'status_change' : 'system', title: i ? `${d.name}: ${path[i - 1]} → ${s}` : `Opportunity created: ${d.name} (${s})`,
          body: s === 'Closed Lost' ? [d.lostReason, d.lostNote].filter(Boolean).join(' — ') : null,
          leadId: d.leadId, opportunityId: id, companyId: d.companyId, contactId: d.contactId, userId: d.ownerId, occurredAt: at,
        })
      }
      return { id, companyId: d.companyId, leadId: d.leadId }
    }

    const act = (type: string, title: string, body: string | null, ref: { leadId?: string; opportunityId?: string; companyId: string; contactId?: string }, user: string, ago: number, hour = 12) =>
      repo.insert('activities', { type, title, body, leadId: ref.leadId ?? null, opportunityId: ref.opportunityId ?? null, companyId: ref.companyId, contactId: ref.contactId ?? null, userId: user, occurredAt: ts(-ago, hour) })
    const task = (title: string, type: string, priority: string, due: number, owner: string, ref: { leadId?: string; opportunityId?: string; companyId: string }, done = false, time: string | null = null) =>
      repo.insert('tasks', { title, type, priority, dueDate: day(due), dueTime: time, status: done ? 'Completed' : 'Open', ownerId: owner, leadId: ref.leadId ?? null, opportunityId: ref.opportunityId ?? null, companyId: ref.companyId, notes: null, completedAt: done ? ts(due) : null })
    const event = (title: string, kind: string, d: number, start: string, end: string, owner: string, ref: { leadId?: string; opportunityId?: string; companyId: string }, location = 'Google Meet') =>
      repo.insert('events', { title, kind, date: day(d), start, end, location, ownerId: owner, leadId: ref.leadId ?? null, opportunityId: ref.opportunityId ?? null, companyId: ref.companyId })
    const proposal = (title: string, o: { id: string; companyId: string }, services: string[], price: number, status: string, ageDays: number, sentAgo: number | null, timeline: string, problem: string, solution: string, validFor = 30) =>
      repo.insert('proposals', {
        title, opportunityId: o.id, companyId: o.companyId, services, problemStatement: problem, solutionSummary: solution, price, deliveryTimeline: timeline,
        status, sentAt: sentAgo !== null ? ts(-sentAgo) : null, validUntil: day(-ageDays + validFor), createdAt: ts(-ageDays), updatedAt: ts(-(sentAgo ?? ageDays)),
      })

    /* 1. Northwind Logistics — ML forecasting in Solution Design */
    const nw = await company({ name: 'Northwind Logistics', website: 'https://northwind-logistics.example', industry: 'Logistics', size: '251–1000', location: 'Pune, India', description: 'Regional freight and last-mile delivery network with 40 hubs.', owner: U.carlos, age: 48 })
    const nwRahul = await contact(nw.id, 'Rahul Mehta', 'CTO', 'rahul.mehta@northwind-logistics.example', true, 'men', 11)
    await contact(nw.id, 'Anita Desai', 'Head of Operations', 'anita.desai@northwind-logistics.example', false, 'women', 21, 'Phone')
    const nwLead = await lead({
      companyId: nw.id, contactId: nwRahul.id, ownerId: U.carlos, title: 'Predictive ETAs and demand forecasting', status: 'Qualified', source: 'Referral', temperature: 'Hot',
      qualification: { need: 3, fit: 3, budget: 2, timeline: 2, authority: 3 }, estimatedBudget: 3000000, estimatedValue: 2800000, probability: 50,
      expectedDecisionDate: day(21), nextFollowUp: day(2), businessProblem: 'Late deliveries and manual capacity planning cost the operations team ~15% in overtime every peak season.',
      techStack: 'Java microservices, PostgreSQL, AWS', existingSystems: 'In-house TMS, SAP for finance', desiredSolution: 'ML models for ETA prediction and weekly demand forecasts surfaced inside the TMS.',
      projectType: 'AI Proof of Concept', engagementModel: 'Fixed Price', timeline: '4–5 months', decisionMakers: 'Rahul Mehta (CTO), CFO sign-off above ₹25L',
      budgetReadiness: 'Pending approval', technicalComplexity: 'High', services: ['AI Solutions', 'Data Analytics'], preferredContact: 'Video call', age: 46,
    })
    const nwOpp = await opp({ name: 'Predictive ETA & demand forecasting platform', companyId: nw.id, contactId: nwRahul.id, leadId: nwLead.id, ownerId: U.carlos, services: ['AI Solutions', 'Data Analytics'], value: 2800000, stage: 'Solution Design', age: 40, problem: 'Manual capacity planning and unreliable ETAs.', solution: 'Gradient-boosted ETA model + weekly demand forecast service integrated with the TMS via REST APIs.', timeline: '20 weeks', close: 28, competitors: 'In-house data team', nextAction: 'Share solution architecture and data requirements', nextActionDate: 2 })
    await act('meeting', 'Discovery call with Rahul and Anita', 'Confirmed 2 years of shipment history available in PostgreSQL. Peak-season overtime is the main pain.', { leadId: nwLead.id, opportunityId: nwOpp.id, companyId: nw.id, contactId: nwRahul.id }, U.carlos, 34)
    await act('note', 'Data sample received', 'Sample of 50k shipments shared over SFTP; quality looks good, missing weather data.', { leadId: nwLead.id, opportunityId: nwOpp.id, companyId: nw.id }, U.susan, 20)
    await proposal('Northwind — Forecasting platform proposal (draft)', nwOpp, ['AI Solutions', 'Data Analytics'], 2800000, 'Draft', 6, null, '20 weeks', 'Manual capacity planning and unreliable ETAs.', 'Phase 1 ETA model (8 weeks), Phase 2 demand forecasting (12 weeks).')
    await task('Share solution architecture with Rahul', 'Technical Discussion', 'High', 2, U.susan, { leadId: nwLead.id, opportunityId: nwOpp.id, companyId: nw.id })
    await event('Architecture review — Northwind', 'Technical Discussion', 3, '11:00', '12:00', U.susan, { leadId: nwLead.id, opportunityId: nwOpp.id, companyId: nw.id })

    /* 2. Brightpath Health — IDP proposal sent, needs follow-up */
    const bp = await company({ name: 'Brightpath Health', website: 'https://brightpath-health.example', industry: 'Healthcare', size: '100–250', location: 'Bengaluru, India', description: 'Network of outpatient clinics processing ~8,000 insurance claims a month.', owner: U.carlos, age: 60 })
    const bpKavya = await contact(bp.id, 'Dr. Kavya Iyer', 'CIO', 'kavya.iyer@brightpath-health.example', true, 'women', 44)
    const bpLead = await lead({
      companyId: bp.id, contactId: bpKavya.id, ownerId: U.carlos, title: 'Claims document processing automation', status: 'Qualified', source: 'LinkedIn', temperature: 'Hot',
      qualification: { need: 3, fit: 3, budget: 3, timeline: 2, authority: 3 }, estimatedBudget: 2000000, estimatedValue: 1850000, probability: 60,
      expectedDecisionDate: day(10), nextFollowUp: day(-2), businessProblem: 'Claims staff re-key data from scanned forms; turnaround is 6 days and error rates trigger rejections.',
      techStack: '.NET, SQL Server, Azure', existingSystems: 'Practice management system, insurer portals', desiredSolution: 'Extract and validate claim fields automatically with human review for low-confidence items.',
      projectType: 'Process Automation', engagementModel: 'Fixed Price', timeline: '3 months', decisionMakers: 'Dr. Kavya Iyer (CIO), COO', budgetReadiness: 'Approved', technicalComplexity: 'Medium',
      services: ['AI Solutions', 'Automation'], preferredContact: 'Email', age: 58,
    })
    const bpOpp = await opp({ name: 'Claims intelligent document processing', companyId: bp.id, contactId: bpKavya.id, leadId: bpLead.id, ownerId: U.carlos, services: ['AI Solutions', 'Automation'], value: 1850000, stage: 'Proposal Sent', age: 52, problem: 'Manual re-keying of scanned claim forms.', solution: 'OCR + LLM extraction pipeline with validation rules and a review queue.', timeline: '12 weeks', close: 12, competitors: 'Off-the-shelf IDP vendor', nextAction: 'Follow up on proposal and pricing questions', nextActionDate: -2 })
    await proposal('Brightpath — Claims IDP proposal', bpOpp, ['AI Solutions', 'Automation'], 1850000, 'Sent', 16, 12, '12 weeks', 'Manual re-keying of scanned claim forms.', 'Extraction pipeline, review UI and integration with the practice management system.')
    await act('email', 'Proposal emailed to Dr. Iyer', 'Shared PDF proposal and SOW. Asked for feedback by Friday.', { leadId: bpLead.id, opportunityId: bpOpp.id, companyId: bp.id, contactId: bpKavya.id }, U.carlos, 12)
    await task('Follow up on Brightpath proposal', 'Proposal Follow-up', 'High', -2, U.carlos, { leadId: bpLead.id, opportunityId: bpOpp.id, companyId: bp.id })

    /* 3. Finverse Capital — two opportunities, two contacts */
    const fv = await company({ name: 'Finverse Capital', website: 'https://finverse.example', industry: 'FinTech', size: '51–100', location: 'Mumbai, India', description: 'Digital lending platform for small businesses.', owner: U.daniel, age: 75 })
    const fvArjun = await contact(fv.id, 'Arjun Kapoor', 'CEO', 'arjun@finverse.example', true, 'men', 46, 'Phone')
    const fvNeha = await contact(fv.id, 'Neha Joshi', 'Product Manager', 'neha@finverse.example', false, 'women', 50)
    const fvLead1 = await lead({
      companyId: fv.id, contactId: fvArjun.id, ownerId: U.daniel, title: 'KYC review automation with AI agents', status: 'Qualified', source: 'Event / Conference', temperature: 'Hot',
      qualification: { need: 3, fit: 3, budget: 3, timeline: 3, authority: 3 }, estimatedBudget: 2500000, estimatedValue: 2200000, probability: 75,
      expectedDecisionDate: day(7), nextFollowUp: day(1), businessProblem: 'KYC analysts spend 40 minutes per application cross-checking documents and bureau data.',
      techStack: 'Node.js, MongoDB, GCP', existingSystems: 'Loan origination system, credit bureau APIs', desiredSolution: 'Agentic workflow that pre-checks documents and drafts the KYC decision for analyst approval.',
      projectType: 'Process Automation', engagementModel: 'Time & Materials', timeline: '4 months', decisionMakers: 'Arjun Kapoor (CEO), Head of Risk', budgetReadiness: 'Approved', technicalComplexity: 'High',
      services: ['AI Agents', 'Automation'], preferredContact: 'Phone', age: 70,
    })
    const fvOpp1 = await opp({ name: 'Agentic KYC pre-check workflow', companyId: fv.id, contactId: fvArjun.id, leadId: fvLead1.id, ownerId: U.daniel, services: ['AI Agents', 'Automation'], value: 2200000, stage: 'Negotiation', age: 64, problem: 'Slow manual KYC checks.', solution: 'Multi-agent workflow with audit trail and analyst approval step.', timeline: '16 weeks', close: 7, competitors: 'Two local agencies', nextAction: 'Send revised commercials with phased billing', nextActionDate: 1 })
    await proposal('Finverse — Agentic KYC proposal v2', fvOpp1, ['AI Agents', 'Automation'], 2200000, 'Negotiation', 20, 14, '16 weeks', 'Slow manual KYC checks.', 'Agent workflow, risk-rule engine, analyst console and bureau integrations.')
    await act('call', 'Pricing call with Arjun', 'Asked for phased billing and a 10% reduction; scope otherwise agreed.', { leadId: fvLead1.id, opportunityId: fvOpp1.id, companyId: fv.id, contactId: fvArjun.id }, U.daniel, 3)
    await task('Send revised commercials to Finverse', 'Contract Discussion', 'High', 1, U.daniel, { leadId: fvLead1.id, opportunityId: fvOpp1.id, companyId: fv.id })
    const fvLead2 = await lead({
      companyId: fv.id, contactId: fvNeha.id, ownerId: U.daniel, title: 'Borrower mobile app redesign', status: 'Discovery Completed', source: 'Referral', temperature: 'Warm',
      qualification: { need: 2, fit: 3, budget: null, timeline: 2, authority: 1 }, estimatedBudget: null, estimatedValue: 900000,
      nextFollowUp: day(5), businessProblem: 'Low app ratings (3.1★) and drop-off during loan application.', techStack: 'React Native', desiredSolution: 'Redesigned onboarding and loan application flow.',
      projectType: 'Feature Extension', timeline: '10 weeks', services: ['Mobile App Development'], age: 25,
    })
    await opp({ name: 'Borrower app redesign', companyId: fv.id, contactId: fvNeha.id, leadId: fvLead2.id, ownerId: U.daniel, services: ['Mobile App Development'], value: 900000, stage: 'Discovery Completed', age: 18, problem: 'Drop-off during loan application.', nextAction: 'Clarify budget owner with Neha', nextActionDate: 5 })
    await event('Discovery follow-up — Finverse app', 'Discovery Meeting', 5, '15:00', '15:45', U.daniel, { leadId: fvLead2.id, companyId: fv.id })

    /* 4. Cartly — MVP closed won */
    const ct = await company({ name: 'Cartly', website: 'https://cartly.example', industry: 'E-commerce', size: '11–50', location: 'New Delhi, India', description: 'Seed-funded social commerce startup.', owner: U.daniel, age: 110 })
    const ctSameer = await contact(ct.id, 'Sameer Khan', 'Founder & CEO', 'sameer@cartly.example', true, 'men', 61, 'WhatsApp')
    const ctLead = await lead({
      companyId: ct.id, contactId: ctSameer.id, ownerId: U.daniel, title: 'Marketplace MVP (web + mobile)', status: 'Qualified', source: 'Website Inquiry', temperature: 'Hot',
      qualification: { need: 3, fit: 3, budget: 3, timeline: 3, authority: 3 }, estimatedBudget: 1500000, estimatedValue: 1400000, businessProblem: 'Needs an MVP to launch with first 50 sellers before the next funding round.',
      projectType: 'New Product / MVP', engagementModel: 'Fixed Price', timeline: '14 weeks', budgetReadiness: 'Approved', services: ['SaaS Development', 'Mobile App Development'], age: 105,
    })
    const ctOpp = await opp({ name: 'Cartly MVP — web & mobile', companyId: ct.id, contactId: ctSameer.id, leadId: ctLead.id, ownerId: U.daniel, services: ['SaaS Development', 'Mobile App Development'], value: 1400000, stage: 'Closed Won', age: 98, problem: 'Launch MVP before funding round.', solution: 'React web app, React Native app, Node API.', timeline: '14 weeks' })
    await proposal('Cartly — MVP proposal', ctOpp, ['SaaS Development', 'Mobile App Development'], 1400000, 'Accepted', 60, 55, '14 weeks', 'Launch MVP before funding round.', 'Marketplace MVP with seller onboarding, catalog, checkout and payouts.')
    await repo.insert('invoices', { companyId: ct.id, opportunityId: ctOpp.id, item: 'Cartly MVP — milestone 1', subtotal: 560000, tax: 100800, discount: 0, status: 'Paid', dueDate: day(-20) })
    await repo.insert('invoices', { companyId: ct.id, opportunityId: ctOpp.id, item: 'Cartly MVP — milestone 2', subtotal: 420000, tax: 75600, discount: 0, status: 'Pending', dueDate: day(10) })
    // A second opportunity found during delivery: AI shopping assistant
    const ctOpp2 = await opp({ name: 'AI shopping assistant for Cartly', companyId: ct.id, contactId: ctSameer.id, leadId: ctLead.id, ownerId: U.daniel, services: ['Generative AI', 'AI Solutions'], value: 650000, stage: 'Qualified Opportunity', age: 15, problem: 'Shoppers struggle to discover products in a growing catalog.', solution: 'RAG-based assistant over catalog and reviews.', nextAction: 'Prepare demo using Cartly catalog sample', nextActionDate: 4 })
    await task('Prepare assistant demo with catalog sample', 'Demo', 'Medium', 4, U.susan, { leadId: ctLead.id, opportunityId: ctOpp2.id, companyId: ct.id })

    /* 5. EduSpark — RAG tutor, qualified */
    const ed = await company({ name: 'EduSpark Learning', website: 'https://eduspark.example', industry: 'Education', size: '51–100', location: 'Hyderabad, India', description: 'Online test-prep platform with 200k learners.', owner: U.angela, age: 30 })
    const edPriyanka = await contact(ed.id, 'Priyanka Rao', 'COO', 'priyanka.rao@eduspark.example', true, 'women', 33)
    const edLead = await lead({
      companyId: ed.id, contactId: edPriyanka.id, ownerId: U.angela, title: 'AI tutor grounded in course content', status: 'Qualified', source: 'Campaign', temperature: 'Warm',
      qualification: { need: 3, fit: 3, budget: 1, timeline: 2, authority: 2 }, estimatedBudget: 1200000, estimatedValue: 1100000, expectedDecisionDate: day(35), nextFollowUp: day(0),
      businessProblem: 'Doubt-solving team cannot keep up with 3,000 student questions per day.', desiredSolution: 'RAG assistant over videos, notes and past answers.',
      projectType: 'AI Proof of Concept', timeline: '3 months', budgetReadiness: 'Exploring', services: ['Generative AI', 'AI Solutions'], age: 28,
    })
    const edOpp = await opp({ name: 'EduSpark AI doubt-solving tutor', companyId: ed.id, contactId: edPriyanka.id, leadId: edLead.id, ownerId: U.angela, services: ['Generative AI'], value: 1100000, stage: 'Qualified Opportunity', age: 22, problem: 'Doubt-solving backlog.', nextAction: 'Clarify budget and PoC success criteria', nextActionDate: 0 })
    await task('Call Priyanka to confirm PoC budget', 'Call', 'High', 0, U.angela, { leadId: edLead.id, opportunityId: edOpp.id, companyId: ed.id }, false, '15:00')

    /* 6. Meridian — closed lost to competitor */
    const md = await company({ name: 'Meridian Manufacturing', website: 'https://meridian-mfg.example', industry: 'Manufacturing', size: '1000+', location: 'Chennai, India', description: 'Auto components manufacturer with 6 plants.', owner: U.carlos, age: 140 })
    const mdVikram = await contact(md.id, 'Vikram Nair', 'CIO', 'vikram.nair@meridian-mfg.example', true, 'men', 75)
    const mdLead = await lead({ companyId: md.id, contactId: mdVikram.id, ownerId: U.carlos, title: 'Legacy ERP modernization', status: 'Qualified', source: 'Outbound Email', temperature: 'Cold', estimatedValue: 4500000, businessProblem: 'AS/400 ERP is expensive to maintain and blocks new integrations.', projectType: 'Legacy Modernization', services: ['Custom Software Development', 'Technology Consulting'], age: 135 })
    const mdOpp = await opp({ name: 'Meridian ERP modernization — phase 1', companyId: md.id, contactId: mdVikram.id, leadId: mdLead.id, ownerId: U.carlos, services: ['Custom Software Development', 'Technology Consulting'], value: 4500000, stage: 'Closed Lost', age: 120, problem: 'Legacy AS/400 ERP.', lostReason: 'Chose a competitor', lostNote: 'Went with their existing SI partner at a lower day rate.', competitors: 'Incumbent SI partner' })
    await proposal('Meridian — ERP modernization proposal', mdOpp, ['Custom Software Development'], 4500000, 'Rejected', 80, 75, '9 months', 'Legacy AS/400 ERP.', 'Strangler-pattern migration of order management first.')

    /* 7. UrbanNest — contacted, follow-up overdue */
    const un = await company({ name: 'UrbanNest Realty', website: 'https://urbannest.example', industry: 'Real Estate', size: '51–100', location: 'Gurugram, India', description: 'Residential brokerage with 12 offices.', owner: U.angela, age: 12 })
    const unIshaan = await contact(un.id, 'Ishaan Malhotra', 'Director', 'ishaan@urbannest.example', true, 'men', 14, 'Phone')
    const unLead = await lead({ companyId: un.id, contactId: unIshaan.id, ownerId: U.angela, title: 'Lead routing and CRM automation for brokers', status: 'Contacted', source: 'Cold Call', temperature: 'Warm', nextFollowUp: day(-3), businessProblem: 'Portal leads reach brokers hours late.', services: ['Automation'], age: 11 })
    await act('call', 'Intro call with Ishaan', 'Interested; asked us to call back after their sales review.', { leadId: unLead.id, companyId: un.id, contactId: unIshaan.id }, U.angela, 9)
    await task('Call back Ishaan after sales review', 'Follow-up', 'Medium', -3, U.angela, { leadId: unLead.id, companyId: un.id })

    /* 8. Streamline SaaS — discovery scheduled */
    const ss = await company({ name: 'Streamline SaaS', website: 'https://streamline-saas.example', industry: 'SaaS', size: '11–50', location: 'Bengaluru, India', description: 'B2B scheduling software for clinics and salons.', owner: U.daniel, age: 9 })
    const ssMeera = await contact(ss.id, 'Meera Pillai', 'CTO', 'meera@streamline-saas.example', true, 'women', 26)
    const ssLead = await lead({ companyId: ss.id, contactId: ssMeera.id, ownerId: U.daniel, title: 'Multi-tenant platform rebuild', status: 'Discovery Scheduled', source: 'Partner', temperature: 'Warm', estimatedValue: 1200000, nextFollowUp: day(1), businessProblem: 'Single-tenant deployments per customer do not scale past 80 customers.', services: ['SaaS Development', 'Custom Software Development'], age: 8 })
    const ssOpp = await opp({ name: 'Streamline multi-tenant re-architecture', companyId: ss.id, contactId: ssMeera.id, leadId: ssLead.id, ownerId: U.daniel, services: ['SaaS Development'], value: 1200000, stage: 'Discovery Scheduled', age: 6, problem: 'Single-tenant deployments do not scale.', nextAction: 'Run discovery meeting', nextActionDate: 1 })
    await event('Discovery — Streamline SaaS', 'Discovery Meeting', 1, '10:30', '11:30', U.daniel, { leadId: ssLead.id, opportunityId: ssOpp.id, companyId: ss.id })

    /* 9. Pixel & Pine — brand-new website inquiry */
    const pp = await company({ name: 'Pixel & Pine Media', website: 'https://pixelpine.example', industry: 'Media', size: '11–50', location: 'Mumbai, India', description: 'Content studio producing video and social content for brands.', owner: U.angela, age: 0 })
    const ppTara = await contact(pp.id, 'Tara Sen', 'Head of Content', 'tara@pixelpine.example', false, 'women', 2)
    const ppLead = await lead({ companyId: pp.id, contactId: ppTara.id, ownerId: U.angela, title: 'Generative AI content workflow', status: 'New Lead', source: 'Website Inquiry', nextFollowUp: day(0), businessProblem: 'Writers spend most of their time on first drafts and variations of captions.', services: ['Generative AI', 'Automation'], timeline: 'This quarter', age: 0 })
    await task('Respond to website inquiry from Tara Sen', 'Follow-up', 'High', 0, U.angela, { leadId: ppLead.id, companyId: pp.id })

    /* 10. Greenleaf Retail — BI, early stage */
    const gl = await company({ name: 'Greenleaf Retail', website: 'https://greenleaf-retail.example', industry: 'Retail', size: '251–1000', location: 'Kolkata, India', description: 'Grocery chain with 85 stores.', owner: U.carlos, age: 20 })
    const glRohan = await contact(gl.id, 'Rohan Bose', 'VP Digital', 'rohan.bose@greenleaf-retail.example', true, 'men', 18)
    const glLead = await lead({ companyId: gl.id, contactId: glRohan.id, ownerId: U.carlos, title: 'Store performance BI & data warehouse', status: 'Contacted', source: 'LinkedIn', temperature: 'Cold', estimatedValue: 750000, nextFollowUp: day(6), businessProblem: 'Store managers get weekly Excel reports; no single view of sales and stock.', services: ['Data Analytics'], age: 18 })
    await opp({ name: 'Greenleaf BI platform', companyId: gl.id, contactId: glRohan.id, leadId: glLead.id, ownerId: U.carlos, services: ['Data Analytics'], value: 750000, stage: 'Contacted', age: 14, problem: 'No single view of store performance.', nextAction: 'Book discovery call', nextActionDate: 6 })

    /* 11. Atlas — disqualified */
    const at = await company({ name: 'Atlas Professional Services', website: 'https://atlas-ps.example', industry: 'Professional Services', size: '100–250', location: 'Ahmedabad, India', description: 'Accounting and advisory firm.', owner: U.angela, age: 40 })
    const atKunal = await contact(at.id, 'Kunal Shah', 'Operations Manager', 'kunal.shah@atlas-ps.example', false, 'men', 7)
    await lead({ companyId: at.id, contactId: atKunal.id, ownerId: U.angela, title: 'Invoice workflow automation', status: 'Disqualified', disqualifyReason: 'No budget this financial year; revisit in April.', source: 'Website Inquiry', temperature: 'Cold', qualification: { need: 2, fit: 2, budget: 0, timeline: 0, authority: 1 }, services: ['Automation'], age: 38 })

    /* 12. Helix Bio Labs — won PoC, lost follow-on */
    const hx = await company({ name: 'Helix Bio Labs', website: 'https://helixbio.example', industry: 'Healthcare', size: '11–50', location: 'Bengaluru, India', description: 'Diagnostics research lab.', owner: U.susan, age: 160 })
    const hxRitu = await contact(hx.id, 'Dr. Ritu Verma', 'Research Director', 'ritu.verma@helixbio.example', true, 'women', 72)
    const hxLead = await lead({ companyId: hx.id, contactId: hxRitu.id, ownerId: U.susan, title: 'Literature search assistant', status: 'Qualified', source: 'Event / Conference', temperature: 'Warm', estimatedValue: 600000, businessProblem: 'Researchers spend days searching papers and internal reports.', services: ['Generative AI', 'AI Solutions'], age: 150 })
    const hxOpp = await opp({ name: 'Research RAG proof-of-concept', companyId: hx.id, contactId: hxRitu.id, leadId: hxLead.id, ownerId: U.susan, services: ['Generative AI'], value: 600000, stage: 'Closed Won', age: 140, problem: 'Slow literature search.', solution: 'RAG PoC over 12k papers.', timeline: '6 weeks' })
    await repo.insert('invoices', { companyId: hx.id, opportunityId: hxOpp.id, item: 'Research RAG PoC', subtotal: 600000, tax: 108000, discount: 30000, status: 'Paid', dueDate: day(-70) })
    await opp({ name: 'Research assistant — production rollout', companyId: hx.id, contactId: hxRitu.id, leadId: hxLead.id, ownerId: U.susan, services: ['Generative AI', 'Custom Software Development'], value: 800000, stage: 'Closed Lost', age: 70, problem: 'Scale PoC to all teams.', lostReason: 'Project postponed', lostNote: 'Grant funding delayed to next year.' })

    /* Upcoming calendar + misc tasks */
    await event('Weekly pipeline review', 'Internal', 0, '09:00', '09:45', U.linda, { companyId: nw.id })
    await event('Demo — Cartly AI assistant', 'Demo', 4, '16:00', '17:00', U.susan, { leadId: ctLead.id, opportunityId: ctOpp2.id, companyId: ct.id })
    await event('Proposal review — Brightpath', 'Proposal Review', 2, '12:00', '12:30', U.carlos, { leadId: bpLead.id, opportunityId: bpOpp.id, companyId: bp.id })
    await task('Update Northwind proposal with phase pricing', 'Proposal Preparation', 'Medium', 5, U.carlos, { leadId: nwLead.id, opportunityId: nwOpp.id, companyId: nw.id })
    await task('Send AI readiness checklist to Greenleaf', 'Email', 'Low', 7, U.carlos, { leadId: glLead.id, companyId: gl.id })
    await task('Kick-off notes for Cartly MVP', 'Other', 'Low', -30, U.daniel, { leadId: ctLead.id, opportunityId: ctOpp.id, companyId: ct.id }, true)

    /* Campaigns (marketing) */
    const img = (s: string) => `https://picsum.photos/seed/${s}/640/420`
    await repo.insert('campaigns', { title: 'AI Readiness Webinar for Operations Leaders', author: 'Marketing — Linda Adora', date: day(-10), views: 0, image: img('ai-readiness'), tags: ['Webinar', 'AI Solutions'], body: 'A 45-minute session on assessing data, process and team readiness before investing in AI. Attendees get a free readiness checklist; follow up with every attendee who requested an assessment.' })
    await repo.insert('campaigns', { title: 'Startup MVP Sprint Offer', author: 'Growth — Daniel Kim', date: day(-25), views: 0, image: img('mvp-sprint'), tags: ['Startups', 'MVP'], body: 'Fixed-scope 12-week MVP packages for seed-stage founders. Route replies to the startup AE.' })
    await repo.insert('campaigns', { title: 'Customer Support Automation Case Study', author: 'Marketing — Angela Jackson', date: day(-40), views: 0, image: img('support-case'), tags: ['Case study', 'Generative AI'], body: 'Case study email on reducing support ticket volume with a RAG assistant. Track replies as Campaign-sourced leads.' })

    /* Team chat */
    const cv = await repo.insert<{ id: string }>('conversations', { name: 'Sales Team', isGroup: true, memberIds: Object.values(U), contactId: null, description: 'Team channel for deal updates, help requests and wins.' })
    const say = (userId: string, author: string, body: string, ago: number) => repo.insert('messages', { conversationId: cv.id, userId, author, body, createdAt: ts(-ago, 9) })
    await say(U.carlos, 'Carlos Garcia', 'Brightpath has had the proposal for 12 days — any objections if I loop in their COO?', 2)
    await say(U.susan, 'Susan Chen', 'Go for it. I can join to cover the integration questions.', 2)
    await say(U.daniel, 'Daniel Kim', 'Finverse asked for phased billing. Sending revised commercials tomorrow.', 1)
    await repo.insert('conversations', { name: 'Pre-sales', isGroup: true, memberIds: [U.linda, U.susan, U.carlos], contactId: null, description: 'Solution design and estimates.' })

    await svc.saveSettings({ demoData: true })
  })
}
