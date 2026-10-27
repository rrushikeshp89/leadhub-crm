/**
 * Deterministic, rule-based checks. These are not AI — the UI labels them as rules.
 */
import type { Activity, Lead, Opportunity, OrgSettings, Proposal, Stage, StageChange, Task } from '../../shared/model'
import { dayDiff, isOpen, isOverdue, missingLeadFields, qualificationScore, stageIndex, todayIso } from '../../shared/calc'

export interface Insight { level: 'danger' | 'warn' | 'info'; text: string }

interface Ctx {
  opportunities: Opportunity[]
  tasks: Task[]
  activities: Activity[]
  proposals: Proposal[]
  stageHistory: StageChange[]
  settings: OrgSettings
}

const lastActivity = (acts: Activity[]) => acts.reduce<string | null>((m, a) => (!m || a.occurredAt > m ? a.occurredAt : m), null)

export function leadInsights(lead: Lead, c: Ctx): Insight[] {
  const out: Insight[] = []
  const today = todayIso()
  if (lead.status === 'Disqualified') return [{ level: 'info', text: `Disqualified${lead.disqualifyReason ? `: ${lead.disqualifyReason}` : ''}` }]
  const tasks = c.tasks.filter((t) => t.leadId === lead.id)
  const overdue = tasks.filter((t) => isOverdue(t, today))
  if (overdue.length) out.push({ level: 'danger', text: `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}` })
  if (lead.nextFollowUp && lead.nextFollowUp < today) out.push({ level: 'danger', text: `Follow-up was due ${-dayDiff(today, lead.nextFollowUp)} day(s) ago` })
  if (!lead.nextFollowUp && !tasks.some((t) => t.status === 'Open')) out.push({ level: 'warn', text: 'No next follow-up or open task — the lead has no next action' })
  const last = lastActivity(c.activities.filter((a) => a.leadId === lead.id && a.type !== 'system'))
  if (last && dayDiff(last, today) > c.settings.staleDays) out.push({ level: 'warn', text: `No interaction in ${dayDiff(last, today)} days` })
  const opps = c.opportunities.filter((o) => o.leadId === lead.id)
  const q = qualificationScore(lead.qualification, c.settings.qualification)
  if (!opps.length && (lead.status === 'Qualified' || q.score >= 70)) out.push({ level: 'info', text: 'Looks qualified but has no opportunity yet' })
  const missing = missingLeadFields(lead)
  if (missing.length) out.push({ level: 'info', text: `Missing: ${missing.join(', ')}` })
  if (q.missing.length) out.push({ level: 'info', text: `Qualification not assessed: ${q.missing.join(', ')}` })
  return out
}

export function opportunityInsights(o: Opportunity, c: Ctx): Insight[] {
  const out: Insight[] = []
  const today = todayIso()
  if (!isOpen(o.stage)) return out
  if (o.expectedCloseDate && o.expectedCloseDate < today) out.push({ level: 'danger', text: `Expected close date passed ${-dayDiff(today, o.expectedCloseDate)} day(s) ago` })
  if (o.nextActionDate && o.nextActionDate < today) out.push({ level: 'danger', text: 'Next action is overdue' })
  if (!o.nextAction && !c.tasks.some((t) => t.opportunityId === o.id && t.status === 'Open')) out.push({ level: 'warn', text: 'No next action recorded' })
  const props = c.proposals.filter((p) => p.opportunityId === o.id)
  const awaiting = props.find((p) => p.status === 'Sent' && p.sentAt && dayDiff(p.sentAt, today) >= 7)
  if (awaiting) {
    const since = c.activities.some((a) => a.opportunityId === o.id && a.occurredAt > awaiting.sentAt! && ['call', 'email', 'meeting'].includes(a.type))
    if (!since) out.push({ level: 'warn', text: `Proposal sent ${dayDiff(awaiting.sentAt!, today)} days ago with no follow-up logged` })
  }
  if (stageIndex(o.stage) >= stageIndex('Solution Design') && !props.length) out.push({ level: 'info', text: 'No proposal created yet' })
  const lastMove = c.stageHistory.filter((h) => h.opportunityId === o.id).reduce<string | null>((m, h) => (!m || h.changedAt > m ? h.changedAt : m), null)
  if (lastMove && dayDiff(lastMove, today) > c.settings.staleDays) out.push({ level: 'warn', text: `In “${o.stage}” for ${dayDiff(lastMove, today)} days` })
  if (!o.contactId) out.push({ level: 'info', text: 'No primary contact linked' })
  if (!o.value) out.push({ level: 'warn', text: 'Estimated deal value is not set' })
  return out
}

/** Standard next step for each stage — a sales playbook, not an AI prediction */
export const PLAYBOOK: Record<Stage, string> = {
  'New Lead': 'Make first contact by the prospect’s preferred channel',
  Contacted: 'Schedule a discovery meeting',
  'Discovery Scheduled': 'Prepare discovery questions and run the meeting',
  'Discovery Completed': 'Request technical requirements and confirm budget & decision makers',
  'Qualified Opportunity': 'Arrange a solution demonstration or technical deep-dive',
  'Solution Design': 'Prepare the estimate and proposal',
  'Proposal Sent': 'Follow up on the proposal and address questions',
  Negotiation: 'Clarify commercial terms and send the contract',
  'Closed Won': 'Hand over to delivery and set up invoicing',
  'Closed Lost': 'Record lessons learned and schedule a later check-in',
}

export const LEAD_PLAYBOOK: Record<Lead['status'], string> = {
  'New Lead': PLAYBOOK['New Lead'],
  Contacted: PLAYBOOK.Contacted,
  'Discovery Scheduled': PLAYBOOK['Discovery Scheduled'],
  'Discovery Completed': 'Score qualification and create an opportunity if it fits',
  Qualified: 'Move the opportunity into solution design',
  Disqualified: 'No action — revisit only if circumstances change',
}
