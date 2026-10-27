/**
 * Input validation for every write. The server enforces these; the client reuses them
 * to show field errors before a request is sent.
 */
import { z } from 'zod'
import {
  BUDGET_READINESS, COMPANY_SIZES, COMPLEXITY, CONTACT_METHODS, CURRENCIES, ENGAGEMENT_MODELS, EVENT_KINDS, INDUSTRIES,
  INVOICE_STATUSES, LEAD_SOURCES, LEAD_STATUSES, LOGGABLE_ACTIVITY_TYPES, LOST_REASONS, PROJECT_TYPES, PROPOSAL_STATUSES,
  ROLES, SERVICE_CATEGORIES, SERVICE_GROUPS, STAGES, TASK_PRIORITIES, TASK_TYPES, TEMPERATURES,
} from './model'

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)
/** Optional, nullable text; empty strings become null (= unknown) */
const text = (max = 2000) => z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional())
const req = (label: string, max = 200) => z.string({ required_error: `${label} is required` }).trim().min(1, `${label} is required`).max(max)
const date = z.preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date').nullable().optional())
const reqDate = (label: string) => z.string({ required_error: `${label} is required` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${label} is required`)
const time = z.preprocess(blankToNull, z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM').nullable().optional())
const money = z.preprocess((v) => (v === '' || v === undefined ? null : typeof v === 'string' ? Number(v) : v),
  z.number({ invalid_type_error: 'Enter a number' }).min(0, 'Cannot be negative').max(1e12).nullable().optional())
const pct = z.preprocess((v) => (v === '' || v === undefined ? null : typeof v === 'string' ? Number(v) : v),
  z.number().min(0).max(100).nullable().optional())
const oneOf = <T extends readonly [string, ...string[]]>(xs: T) => z.preprocess(blankToNull, z.enum(xs).nullable().optional())
const email = z.preprocess(blankToNull, z.string().trim().toLowerCase().email('Enter a valid email').max(200).nullable().optional())
const url = z.preprocess((v) => {
  const s = blankToNull(v)
  if (typeof s === 'string' && !/^https?:\/\//i.test(s)) return `https://${s.trim()}`
  return s
}, z.string().url('Enter a valid URL').max(300).nullable().optional())
const id = z.preprocess(blankToNull, z.string().max(64).nullable().optional())
const services = z.array(z.enum(SERVICE_CATEGORIES)).max(10).default([])

export const companySchema = z.object({
  name: req('Company name'),
  website: url,
  industry: oneOf(INDUSTRIES),
  size: oneOf(COMPANY_SIZES),
  location: text(200),
  description: text(),
  notes: text(5000),
  ownerId: id,
})

export const contactSchema = z.object({
  companyId: req('Company', 64),
  name: req('Full name'),
  email,
  phone: text(40),
  title: text(120),
  linkedin: url,
  avatar: text(500),
  preferredContact: oneOf(CONTACT_METHODS),
  isDecisionMaker: z.boolean().default(false),
})

const qualification = z.record(z.string(), z.number().int().min(0).max(3).nullable()).default({})

export const leadSchema = z.object({
  companyId: req('Company', 64),
  contactId: req('Contact', 64),
  ownerId: id,
  title: req('Lead title', 200),
  source: oneOf(LEAD_SOURCES),
  status: z.enum(LEAD_STATUSES).default('New Lead'),
  temperature: oneOf(TEMPERATURES),
  qualification,
  estimatedBudget: money,
  estimatedValue: money,
  probability: pct,
  expectedDecisionDate: date,
  nextFollowUp: date,
  businessProblem: text(),
  techStack: text(500),
  existingSystems: text(500),
  desiredSolution: text(),
  projectType: oneOf(PROJECT_TYPES),
  engagementModel: oneOf(ENGAGEMENT_MODELS),
  timeline: text(120),
  decisionMakers: text(500),
  budgetReadiness: oneOf(BUDGET_READINESS),
  technicalComplexity: oneOf(COMPLEXITY),
  additionalRequirements: text(),
  preferredContact: oneOf(CONTACT_METHODS),
  services,
  disqualifyReason: text(300),
})

/** One-step intake: create the lead and, if needed, its company and contact. */
export const intakeSchema = z.object({
  company: z.union([z.object({ id: req('Company', 64) }), companySchema]),
  contact: z.union([z.object({ id: req('Contact', 64) }), contactSchema.omit({ companyId: true })]),
  lead: leadSchema.omit({ companyId: true, contactId: true }),
  allowDuplicate: z.boolean().default(false),
})

export const opportunitySchema = z.object({
  name: req('Opportunity name'),
  companyId: req('Company', 64),
  contactId: id,
  leadId: id,
  ownerId: id,
  services: services.refine((s) => s.length > 0, 'Pick at least one service'),
  problemStatement: text(),
  proposedSolution: text(),
  value: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number({ invalid_type_error: 'Enter the estimated deal value' }).min(0).max(1e12)),
  probability: pct,
  deliveryTimeline: text(120),
  expectedCloseDate: date,
  stage: z.enum(STAGES).default('New Lead'),
  competitors: text(300),
  nextAction: text(300),
  nextActionDate: date,
  lostReason: oneOf(LOST_REASONS),
  lostNote: text(500),
})

export const stageChangeSchema = z.object({
  stage: z.enum(STAGES),
  lostReason: oneOf(LOST_REASONS),
  lostNote: text(500),
}).refine((v) => v.stage !== 'Closed Lost' || !!v.lostReason, { message: 'A lost reason is required', path: ['lostReason'] })

export const taskSchema = z.object({
  title: req('Task'),
  type: z.enum(TASK_TYPES).default('Follow-up'),
  priority: z.enum(TASK_PRIORITIES).default('Medium'),
  dueDate: reqDate('Due date'),
  dueTime: time,
  status: z.enum(['Open', 'Completed']).default('Open'),
  ownerId: id,
  leadId: id,
  opportunityId: id,
  companyId: id,
  notes: text(),
})

export const activitySchema = z.object({
  type: z.enum(LOGGABLE_ACTIVITY_TYPES),
  title: req('Summary', 200),
  body: text(5000),
  leadId: id,
  opportunityId: id,
  companyId: id,
  contactId: id,
  occurredAt: z.preprocess(blankToNull, z.string().max(40).nullable().optional()),
})

export const proposalSchema = z.object({
  title: req('Proposal title'),
  opportunityId: req('Opportunity', 64),
  services: services.refine((s) => s.length > 0, 'Pick at least one service'),
  problemStatement: text(),
  solutionSummary: text(),
  price: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number({ invalid_type_error: 'Enter the estimated price' }).min(0).max(1e12)),
  deliveryTimeline: text(120),
  status: z.enum(PROPOSAL_STATUSES).default('Draft'),
  validUntil: date,
})

export const eventSchema = z.object({
  title: req('Title'),
  date: reqDate('Date'),
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Start time is required'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'End time is required'),
  kind: z.enum(EVENT_KINDS).default('Discovery Meeting'),
  location: text(200),
  ownerId: id,
  leadId: id,
  opportunityId: id,
  companyId: id,
}).refine((v) => v.end > v.start, { message: 'End must be after start', path: ['end'] })

export const campaignSchema = z.object({
  title: req('Title'),
  author: req('Owner', 120),
  date: reqDate('Date'),
  body: z.string().max(5000).default(''),
  image: text(500),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
})

export const serviceSchema = z.object({
  name: req('Service name'),
  group: z.enum(SERVICE_GROUPS),
  category: z.enum(SERVICE_CATEGORIES),
  description: text(),
  startingPrice: money,
  typicalDuration: text(80),
  active: z.boolean().default(true),
})

export const invoiceSchema = z.object({
  companyId: req('Client', 64),
  opportunityId: id,
  item: req('Item'),
  subtotal: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().min(0)),
  tax: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().min(0).default(0)),
  discount: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().min(0).default(0)),
  status: z.enum(INVOICE_STATUSES).default('Pending'),
  dueDate: reqDate('Due date'),
})

export const userSchema = z.object({
  name: req('Full name'),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  role: z.enum(ROLES).default('sales_rep'),
  title: text(120),
  phone: text(40),
  territory: text(120),
  avatar: text(500),
  password: z.preprocess(blankToNull, z.string().min(8, 'At least 8 characters').max(200).nullable().optional()),
})

export const profileSchema = userSchema.omit({ role: true, password: true }).extend({
  currentPassword: z.preprocess(blankToNull, z.string().nullable().optional()),
  newPassword: z.preprocess(blankToNull, z.string().min(8, 'At least 8 characters').max(200).nullable().optional()),
})

export const settingsSchema = z.object({
  companyName: req('Company name', 120),
  currency: z.enum(CURRENCIES),
  qualification: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/, 'Use lowercase letters'),
    label: req('Label', 60),
    weight: z.number().int().min(0).max(100),
    hint: z.string().max(200).default(''),
  })).min(1, 'Keep at least one criterion').max(10),
  stageProbabilities: z.record(z.enum(STAGES), z.number().min(0).max(100)),
  staleDays: z.number().int().min(1).max(365),
  pageSize: z.number().int().min(5).max(100),
}).partial()

export const messageSchema = z.object({ body: req('Message', 4000) })
export const conversationSchema = z.object({
  name: req('Name'),
  isGroup: z.boolean().default(false),
  memberIds: z.array(z.string()).default([]),
  contactId: id,
  description: text(),
})

/** Public website inquiry form */
export const inquirySchema = z.object({
  name: req('Your name', 120),
  email: z.string().trim().toLowerCase().email('Enter a valid work email').max(200),
  phone: text(40),
  jobTitle: text(120),
  company: req('Company', 200),
  website: url,
  companySize: oneOf(COMPANY_SIZES),
  problem: req('Tell us what you want to solve', 3000),
  services,
  budget: money,
  timeline: text(120),
  preferredContact: oneOf(CONTACT_METHODS),
  /** honeypot — must stay empty */
  company_url: z.string().max(0).optional(),
})

export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) })

export type CompanyInput = z.infer<typeof companySchema>
export type ContactInput = z.infer<typeof contactSchema>
export type LeadInput = z.infer<typeof leadSchema>
export type IntakeInput = z.infer<typeof intakeSchema>
export type OpportunityInput = z.infer<typeof opportunitySchema>
export type TaskInput = z.infer<typeof taskSchema>
export type ProposalInput = z.infer<typeof proposalSchema>
export type InquiryInput = z.infer<typeof inquirySchema>

/** Flatten zod issues to { field: message } for forms */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of err.issues) {
    const k = i.path.join('.') || '_'
    if (!out[k]) out[k] = i.message
  }
  return out
}
