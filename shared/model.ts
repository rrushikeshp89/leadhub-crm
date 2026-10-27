/**
 * Domain model shared by the API server and the web client.
 * Business vocabulary is specific to a B2B custom-software / AI solutions company.
 */

export const LEAD_STATUSES = ['New Lead', 'Contacted', 'Discovery Scheduled', 'Discovery Completed', 'Qualified', 'Disqualified'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const STAGES = [
  'New Lead', 'Contacted', 'Discovery Scheduled', 'Discovery Completed', 'Qualified Opportunity',
  'Solution Design', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost',
] as const
export type Stage = (typeof STAGES)[number]
export const OPEN_STAGES = STAGES.slice(0, 8) as readonly Stage[]
/** Stages that count as a "qualified opportunity" (credible need, budget path, decision path) */
export const QUALIFIED_STAGES: readonly Stage[] = ['Qualified Opportunity', 'Solution Design', 'Proposal Sent', 'Negotiation']

export const DEFAULT_STAGE_PROBABILITY: Record<Stage, number> = {
  'New Lead': 5, Contacted: 10, 'Discovery Scheduled': 15, 'Discovery Completed': 25, 'Qualified Opportunity': 40,
  'Solution Design': 50, 'Proposal Sent': 60, Negotiation: 75, 'Closed Won': 100, 'Closed Lost': 0,
}

export const LOST_REASONS = ['Budget constraints', 'Chose a competitor', 'Project postponed', 'Requirements mismatch', 'No response', 'Internal project cancellation', 'Other'] as const
export type LostReason = (typeof LOST_REASONS)[number]

/** Interest categories a lead / opportunity can be tagged with (multi-select) */
export const SERVICE_CATEGORIES = [
  'Custom Software Development', 'AI Solutions', 'Generative AI', 'AI Agents', 'SaaS Development',
  'Mobile App Development', 'Web Application Development', 'Data Analytics', 'Automation', 'Technology Consulting',
] as const
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]

export const SERVICE_GROUPS = ['Custom Software Development', 'AI Solutions', 'Consulting & Digital Transformation'] as const
export type ServiceGroup = (typeof SERVICE_GROUPS)[number]

export const TEMPERATURES = ['Hot', 'Warm', 'Cold'] as const
export type Temperature = (typeof TEMPERATURES)[number]

export const LEAD_SOURCES = ['Website Inquiry', 'Referral', 'LinkedIn', 'Outbound Email', 'Cold Call', 'Event / Conference', 'Partner', 'Campaign', 'Other'] as const
export const INDUSTRIES = ['E-commerce', 'FinTech', 'Healthcare', 'Logistics', 'Education', 'SaaS', 'Manufacturing', 'Real Estate', 'Retail', 'Media', 'Professional Services', 'Other'] as const
export const COMPANY_SIZES = ['1–10', '11–50', '51–100', '100–250', '251–1000', '1000+'] as const
export const PROJECT_TYPES = ['New Product / MVP', 'Feature Extension', 'Integration', 'Legacy Modernization', 'AI Proof of Concept', 'Process Automation', 'Consulting Engagement', 'Other'] as const
export const ENGAGEMENT_MODELS = ['Fixed Price', 'Time & Materials', 'Dedicated Team', 'Retainer', 'Not decided'] as const
export const BUDGET_READINESS = ['Approved', 'Pending approval', 'Exploring', 'No budget'] as const
export const COMPLEXITY = ['Low', 'Medium', 'High'] as const
export const CONTACT_METHODS = ['Email', 'Phone', 'Video call', 'WhatsApp', 'LinkedIn'] as const

export const TASK_TYPES = ['Follow-up', 'Call', 'Email', 'Discovery Meeting', 'Technical Discussion', 'Proposal Preparation', 'Proposal Follow-up', 'Contract Discussion', 'Demo', 'Other'] as const
export type TaskType = (typeof TASK_TYPES)[number]
export const TASK_PRIORITIES = ['High', 'Medium', 'Low'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note', 'status_change', 'task', 'proposal', 'system'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]
/** Activity types a user may log by hand; the rest are written by the server */
export const LOGGABLE_ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note'] as const

/** "Viewed" is intentionally absent: proposal view tracking is not implemented. */
export const PROPOSAL_STATUSES = ['Draft', 'In Review', 'Sent', 'Negotiation', 'Accepted', 'Rejected', 'Expired'] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export const EVENT_KINDS = ['Discovery Meeting', 'Technical Discussion', 'Demo', 'Call', 'Proposal Review', 'Contract Discussion', 'Internal'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export const INVOICE_STATUSES = ['Paid', 'Pending', 'Overdue'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const ROLES = ['admin', 'sales_rep'] as const
export type Role = (typeof ROLES)[number]

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const

/* ---------------- Entities (as returned by the API) ---------------- */

export interface User {
  id: string
  name: string
  email: string
  role: Role
  title: string | null
  phone: string | null
  territory: string | null
  avatar: string | null
  canLogin: boolean
  createdAt: string
}

export interface Company {
  id: string
  code: string
  name: string
  website: string | null
  industry: string | null
  size: string | null
  location: string | null
  description: string | null
  notes: string | null
  ownerId: string | null
  createdAt: string
  updatedAt: string
}

export interface Contact {
  id: string
  companyId: string
  name: string
  email: string | null
  phone: string | null
  title: string | null
  linkedin: string | null
  avatar: string | null
  preferredContact: string | null
  isDecisionMaker: boolean
  createdAt: string
  updatedAt: string
}

/** Criterion key -> 0 (none) … 3 (strong); null/absent means unknown */
export type QualificationAnswers = Record<string, number | null>

export interface Lead {
  id: string
  code: string
  companyId: string
  contactId: string
  ownerId: string | null
  title: string
  source: string | null
  status: LeadStatus
  temperature: Temperature | null
  qualification: QualificationAnswers
  estimatedBudget: number | null
  estimatedValue: number | null
  probability: number | null
  expectedDecisionDate: string | null
  nextFollowUp: string | null
  businessProblem: string | null
  techStack: string | null
  existingSystems: string | null
  desiredSolution: string | null
  projectType: string | null
  engagementModel: string | null
  timeline: string | null
  decisionMakers: string | null
  budgetReadiness: string | null
  technicalComplexity: string | null
  additionalRequirements: string | null
  preferredContact: string | null
  services: string[]
  disqualifyReason: string | null
  createdAt: string
  updatedAt: string
}

export interface Opportunity {
  id: string
  code: string
  name: string
  companyId: string
  contactId: string | null
  leadId: string | null
  ownerId: string | null
  services: string[]
  problemStatement: string | null
  proposedSolution: string | null
  value: number
  probability: number
  deliveryTimeline: string | null
  expectedCloseDate: string | null
  stage: Stage
  competitors: string | null
  nextAction: string | null
  nextActionDate: string | null
  lostReason: string | null
  lostNote: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface StageChange {
  id: string
  opportunityId: string
  fromStage: Stage | null
  toStage: Stage
  userId: string | null
  changedAt: string
}

export interface Task {
  id: string
  title: string
  type: TaskType
  priority: TaskPriority
  dueDate: string
  dueTime: string | null
  status: 'Open' | 'Completed'
  ownerId: string | null
  leadId: string | null
  opportunityId: string | null
  companyId: string | null
  notes: string | null
  completedAt: string | null
  createdAt: string
}

export interface Activity {
  id: string
  type: ActivityType
  title: string
  body: string | null
  leadId: string | null
  opportunityId: string | null
  companyId: string | null
  contactId: string | null
  userId: string | null
  occurredAt: string
}

export interface Proposal {
  id: string
  code: string
  title: string
  opportunityId: string
  companyId: string
  services: string[]
  problemStatement: string | null
  solutionSummary: string | null
  price: number
  deliveryTimeline: string | null
  status: ProposalStatus
  sentAt: string | null
  validUntil: string | null
  createdAt: string
  updatedAt: string
}

export interface CalEvent {
  id: string
  title: string
  date: string
  start: string
  end: string
  kind: EventKind
  location: string | null
  ownerId: string | null
  leadId: string | null
  opportunityId: string | null
  companyId: string | null
  createdAt: string
}

export interface Campaign {
  id: string
  title: string
  author: string
  date: string
  views: number
  body: string
  image: string | null
  tags: string[]
  createdAt: string
}

export interface Service {
  id: string
  code: string
  name: string
  group: ServiceGroup
  category: ServiceCategory
  description: string | null
  startingPrice: number | null
  typicalDuration: string | null
  active: boolean
}

export interface Invoice {
  id: string
  code: string
  companyId: string
  opportunityId: string | null
  item: string
  subtotal: number
  tax: number
  discount: number
  status: InvoiceStatus
  dueDate: string
  createdAt: string
}

export interface Conversation {
  id: string
  name: string
  isGroup: boolean
  memberIds: string[]
  contactId: string | null
  description: string | null
  createdAt: string
}

export interface Message {
  id: string
  conversationId: string
  userId: string | null
  author: string
  body: string
  createdAt: string
}

export interface Criterion {
  key: string
  label: string
  weight: number
  hint: string
}

export interface OrgSettings {
  companyName: string
  currency: (typeof CURRENCIES)[number]
  qualification: Criterion[]
  stageProbabilities: Record<Stage, number>
  staleDays: number
  pageSize: number
  demoData: boolean
}

export const DEFAULT_QUALIFICATION: Criterion[] = [
  { key: 'need', label: 'Business need', weight: 30, hint: 'Is there a clear, painful business problem we can solve?' },
  { key: 'fit', label: 'Service fit', weight: 20, hint: 'Does the need match our software / AI services?' },
  { key: 'budget', label: 'Budget readiness', weight: 20, hint: 'Is budget approved or realistically available?' },
  { key: 'timeline', label: 'Timeline', weight: 15, hint: 'Is there a defined, reasonable timeline?' },
  { key: 'authority', label: 'Decision-maker access', weight: 15, hint: 'Are we talking to, or connected to, the decision maker?' },
]

export const DEFAULT_SETTINGS: OrgSettings = {
  companyName: 'LeadHub Technologies',
  currency: 'INR',
  qualification: DEFAULT_QUALIFICATION,
  stageProbabilities: DEFAULT_STAGE_PROBABILITY,
  staleDays: 14,
  pageSize: 10,
  demoData: false,
}

/** Everything the client loads after sign-in */
export interface Bootstrap {
  me: User
  users: User[]
  companies: Company[]
  contacts: Contact[]
  leads: Lead[]
  opportunities: Opportunity[]
  stageHistory: StageChange[]
  tasks: Task[]
  activities: Activity[]
  proposals: Proposal[]
  events: CalEvent[]
  campaigns: Campaign[]
  services: Service[]
  invoices: Invoice[]
  conversations: Conversation[]
  messages: Message[]
  settings: OrgSettings
  meta: { ai: { configured: boolean; model: string | null } }
}
