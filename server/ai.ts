import Anthropic from '@anthropic-ai/sdk'
import type { Activity, Company, Contact, Lead, Opportunity, OrgSettings, Proposal, Task, User } from '../shared/model'
import { qualificationScore, weightedValue, formatMoney } from '../shared/calc'

/**
 * Server-side Claude integration. The API key is read from the server environment only and
 * never sent to the browser. Every result is returned to the user as a suggestion; nothing
 * here writes to the CRM database.
 */

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5'

export function aiStatus() {
  const configured = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.AI_ENABLED === 'true')
  return { configured, model: configured ? MODEL : null }
}

let client: Anthropic | null = null
const getClient = () => (client ??= new Anthropic())

export const AI_KINDS = ['summary', 'qualification', 'next_action', 'meeting_brief', 'email'] as const
export type AiKind = (typeof AI_KINDS)[number]

export class AiError extends Error {
  constructor(public status: number, message: string, public code: string) { super(message) }
}

export interface AiContext {
  settings: OrgSettings
  lead?: Lead
  opportunity?: Opportunity
  company?: Company
  contact?: Contact
  owner?: User
  opportunities: Opportunity[]
  tasks: Task[]
  activities: Activity[]
  proposals: Proposal[]
  emailPurpose?: string
}

const str = { type: 'string' } as const
const strList = { type: 'array', items: { type: 'string' } } as const
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })

function schemaFor(kind: AiKind, settings: OrgSettings) {
  switch (kind) {
    case 'summary':
      return obj({ summary: str, keyFacts: strList, openQuestions: strList })
    case 'qualification':
      return obj({
        criteria: {
          type: 'array',
          items: obj({
            key: { type: 'string', enum: settings.qualification.map((c) => c.key) },
            value: { anyOf: [{ type: 'integer', enum: [0, 1, 2, 3] }, { type: 'null' }] },
            rationale: str,
          }),
        },
        overall: str,
      })
    case 'next_action':
      return obj({
        action: str,
        why: str,
        taskType: { type: 'string', enum: ['Follow-up', 'Call', 'Email', 'Discovery Meeting', 'Technical Discussion', 'Proposal Preparation', 'Proposal Follow-up', 'Contract Discussion', 'Demo', 'Other'] },
        priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
        dueInDays: { type: 'integer' },
      })
    case 'meeting_brief':
      return obj({ background: str, knownRequirements: strList, previousInteractions: strList, unresolvedQuestions: strList, discussionPoints: strList })
    case 'email':
      return obj({ subject: str, body: str })
  }
}

const TASK_TEXT: Record<AiKind, string> = {
  summary: 'Write a concise summary of this prospect: who they are, the business problem, which of our services they are interested in, and what has happened recently. List key facts and the most important open questions.',
  qualification: 'Assess each qualification criterion on a 0–3 scale (0 = none, 1 = weak, 2 = moderate, 3 = strong). Use null when the CRM data does not contain enough evidence — do not guess. Give a one-sentence rationale per criterion that cites the evidence.',
  next_action: 'Recommend the single most useful next sales action given the current stage, open tasks and recent interactions. Do not repeat an action that is already an open task. Suggest a task type, a priority and how many days from today it should be due.',
  meeting_brief: 'Prepare a short brief for the next meeting with this prospect: company background, known requirements, previous interactions, unresolved questions and recommended discussion points.',
  email: 'Draft a personalised, professional email from the account owner to the primary contact. Keep it under 180 words, plain text, no placeholders other than the sender signature line. The purpose of the email is given below.',
}

function contextText(c: AiContext) {
  const money = (n: number | null | undefined) => formatMoney(n, c.settings.currency)
  const u = (v: unknown) => (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) ? 'Unknown' : Array.isArray(v) ? v.join(', ') : String(v))
  const lines: string[] = []
  if (c.company) {
    lines.push('## Company', `Name: ${c.company.name}`, `Industry: ${u(c.company.industry)}`, `Size: ${u(c.company.size)}`,
      `Location: ${u(c.company.location)}`, `Website: ${u(c.company.website)}`, `Description: ${u(c.company.description)}`, `Notes: ${u(c.company.notes)}`)
  }
  if (c.contact) {
    lines.push('## Primary contact', `Name: ${c.contact.name}`, `Title: ${u(c.contact.title)}`, `Decision maker: ${c.contact.isDecisionMaker ? 'Yes' : 'Unknown'}`, `Preferred contact: ${u(c.contact.preferredContact)}`)
  }
  if (c.lead) {
    const l = c.lead
    const q = qualificationScore(l.qualification, c.settings.qualification)
    lines.push('## Lead', `Title: ${l.title}`, `Status: ${l.status}`, `Source: ${u(l.source)}`, `Temperature: ${u(l.temperature)}`,
      `Recorded qualification score: ${q.score}/100 (${q.answered}/${q.total} criteria answered)`,
      `Services of interest: ${u(l.services)}`, `Business problem: ${u(l.businessProblem)}`, `Desired solution: ${u(l.desiredSolution)}`,
      `Current tech stack: ${u(l.techStack)}`, `Existing systems: ${u(l.existingSystems)}`, `Project type: ${u(l.projectType)}`,
      `Engagement model: ${u(l.engagementModel)}`, `Timeline: ${u(l.timeline)}`, `Estimated budget (prospect's estimate, not confirmed): ${money(l.estimatedBudget)}`,
      `Budget readiness: ${u(l.budgetReadiness)}`, `Decision makers: ${u(l.decisionMakers)}`, `Technical complexity: ${u(l.technicalComplexity)}`,
      `Expected decision date: ${u(l.expectedDecisionDate)}`, `Next follow-up: ${u(l.nextFollowUp)}`, `Additional requirements: ${u(l.additionalRequirements)}`)
  }
  if (c.opportunities.length) {
    lines.push('## Opportunities')
    for (const o of c.opportunities) {
      lines.push(`- ${o.name} — stage ${o.stage}, estimated value ${money(o.value)} (not confirmed revenue unless Closed Won), probability ${o.probability}%, weighted ${money(weightedValue(o))}; services: ${u(o.services)}; problem: ${u(o.problemStatement)}; proposed solution: ${u(o.proposedSolution)}; competitors: ${u(o.competitors)}; next action: ${u(o.nextAction)} (${u(o.nextActionDate)})`)
    }
  }
  if (c.proposals.length) {
    lines.push('## Proposals')
    for (const p of c.proposals) lines.push(`- ${p.title}: ${p.status}, ${money(p.price)}, timeline ${u(p.deliveryTimeline)}, last updated ${p.updatedAt.slice(0, 10)}`)
  }
  const open = c.tasks.filter((t) => t.status === 'Open')
  if (open.length) {
    lines.push('## Open tasks')
    for (const t of open) lines.push(`- ${t.type}: ${t.title} (due ${t.dueDate}, ${t.priority})`)
  }
  if (c.activities.length) {
    lines.push('## Recent interactions (newest first)')
    for (const a of c.activities.slice(0, 25)) lines.push(`- ${a.occurredAt.slice(0, 10)} [${a.type}] ${a.title}${a.body ? ` — ${a.body.slice(0, 300)}` : ''}`)
  }
  if (c.owner) lines.push('## Account owner', `${c.owner.name}${c.owner.title ? `, ${c.owner.title}` : ''}`)
  return lines.join('\n')
}

export async function runAi(kind: AiKind, ctx: AiContext) {
  if (!aiStatus().configured) {
    throw new AiError(503, 'AI is not configured. Set ANTHROPIC_API_KEY in the server environment to enable it.', 'ai_not_configured')
  }
  const criteria = ctx.settings.qualification.map((c) => `- ${c.key}: ${c.label} (weight ${c.weight}) — ${c.hint}`).join('\n')
  const system = [
    `You are a sales assistant inside the CRM of ${ctx.settings.companyName}, a B2B technology company that sells custom software development, AI solutions (generative AI, RAG, AI agents, ML) and technology consulting. Sales are consultative.`,
    'Use only the CRM data provided. When a fact is not in the data, say it is unknown instead of assuming. Never present an estimated budget or deal value as confirmed revenue.',
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
  ].join('\n')
  const user = [
    TASK_TEXT[kind],
    kind === 'qualification' ? `\nQualification criteria:\n${criteria}` : '',
    kind === 'email' ? `\nEmail purpose: ${ctx.emailPurpose?.trim() || 'a helpful follow-up that moves the conversation to the next step'}` : '',
    '\n# CRM data\n' + contextText(ctx),
  ].join('\n')

  try {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: schemaFor(kind, ctx.settings) } },
    })
    if (response.stop_reason === 'refusal') throw new AiError(422, 'The AI declined to answer this request.', 'ai_refusal')
    if (response.stop_reason === 'max_tokens') throw new AiError(502, 'The AI response was cut off. Try again.', 'ai_truncated')
    const text = response.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
    let result: unknown
    try { result = JSON.parse(text) } catch { throw new AiError(502, 'The AI returned an unreadable response. Try again.', 'ai_bad_output') }
    return { kind, result, model: response.model, generatedAt: new Date().toISOString(), aiGenerated: true as const }
  } catch (e) {
    if (e instanceof AiError) throw e
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AiError(503, 'The AI credentials were rejected. Check ANTHROPIC_API_KEY on the server.', 'ai_auth')
    if (e instanceof Anthropic.RateLimitError) throw new AiError(429, 'The AI service is rate limited. Try again in a minute.', 'ai_rate_limited')
    if (e instanceof Anthropic.BadRequestError) throw new AiError(502, `The AI request was rejected: ${e.message}`, 'ai_bad_request')
    if (e instanceof Anthropic.APIConnectionError) throw new AiError(503, 'Could not reach the AI service.', 'ai_unreachable')
    if (e instanceof Anthropic.APIError) throw new AiError(502, `AI service error (${e.status ?? 'unknown'}).`, 'ai_error')
    throw e
  }
}
