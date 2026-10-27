/**
 * Business calculations. Used by the API (dashboard endpoint, validation) and the UI,
 * so a number shown anywhere in the product is computed exactly one way.
 */
import {
  OPEN_STAGES, QUALIFIED_STAGES, STAGES,
  type Criterion, type Lead, type Opportunity, type QualificationAnswers, type Stage, type StageChange, type Task, type Temperature,
} from './model'

/* ---------- dates (local calendar days as YYYY-MM-DD) ---------- */
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const todayIso = () => isoDay(new Date())
export const dayDiff = (a: string, b: string) => {
  const [y1, m1, d1] = a.slice(0, 10).split('-').map(Number)
  const [y2, m2, d2] = b.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

/* ---------- opportunities ---------- */
export const isOpen = (stage: Stage) => (OPEN_STAGES as readonly string[]).includes(stage)
export const isQualified = (stage: Stage) => QUALIFIED_STAGES.includes(stage)
export const stageIndex = (s: Stage) => STAGES.indexOf(s)

/** Weighted Pipeline Value = Estimated Deal Value × Probability of Closing */
export const weightedValue = (o: Pick<Opportunity, 'value' | 'probability'>) => Math.round((o.value * o.probability) / 100)

export interface PipelineSummary {
  openCount: number
  openValue: number
  weightedValue: number
  wonCount: number
  wonValue: number
  lostCount: number
  lostValue: number
  qualifiedCount: number
  winRate: number | null
  avgDealSize: number | null
  avgCycleDays: number | null
}

export function pipelineSummary(opps: Opportunity[]): PipelineSummary {
  const open = opps.filter((o) => isOpen(o.stage))
  const won = opps.filter((o) => o.stage === 'Closed Won')
  const lost = opps.filter((o) => o.stage === 'Closed Lost')
  const sum = (xs: Opportunity[], f: (o: Opportunity) => number) => xs.reduce((a, o) => a + f(o), 0)
  const cycles = won.filter((o) => o.closedAt).map((o) => Math.max(0, dayDiff(o.createdAt, o.closedAt!)))
  return {
    openCount: open.length,
    openValue: sum(open, (o) => o.value),
    weightedValue: sum(open, weightedValue),
    wonCount: won.length,
    wonValue: sum(won, (o) => o.value),
    lostCount: lost.length,
    lostValue: sum(lost, (o) => o.value),
    qualifiedCount: open.filter((o) => isQualified(o.stage)).length,
    winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
    avgDealSize: won.length ? Math.round(sum(won, (o) => o.value) / won.length) : null,
    avgCycleDays: cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null,
  }
}

/**
 * Stage-to-stage conversion along the main path (New Lead → … → Closed Won).
 * An opportunity "reached" a stage if it is there now, passed through it (stage history),
 * or is currently beyond it. Closed Lost opportunities count up to the furthest stage they reached.
 */
export function stageConversion(opps: Opportunity[], history: StageChange[]) {
  const path = STAGES.filter((s) => s !== 'Closed Lost')
  const furthest = new Map<string, number>()
  for (const o of opps) {
    let max = o.stage === 'Closed Lost' ? -1 : stageIndex(o.stage)
    for (const h of history) if (h.opportunityId === o.id && h.toStage !== 'Closed Lost') max = Math.max(max, stageIndex(h.toStage))
    if (o.stage === 'Closed Lost' && max < 0) max = 0
    furthest.set(o.id, max)
  }
  const reached = path.map((_, i) => [...furthest.values()].filter((m) => m >= i).length)
  return path.map((stage, i) => ({
    stage,
    reached: reached[i],
    toNext: i < path.length - 1 && reached[i] ? reached[i + 1] / reached[i] : null,
  }))
}

/* ---------- leads ---------- */
export interface QualificationResult {
  score: number
  answered: number
  total: number
  missing: string[]
}

/** Each criterion is answered 0–3; unknown criteria contribute 0 and are reported as missing. */
export function qualificationScore(answers: QualificationAnswers, criteria: Criterion[]): QualificationResult {
  const totalWeight = criteria.reduce((a, c) => a + c.weight, 0) || 1
  let pts = 0
  const missing: string[] = []
  for (const c of criteria) {
    const v = answers?.[c.key]
    if (v === null || v === undefined) missing.push(c.label)
    else pts += (c.weight * Math.max(0, Math.min(3, v))) / 3
  }
  return { score: Math.round((pts / totalWeight) * 100), answered: criteria.length - missing.length, total: criteria.length, missing }
}

export const suggestedTemperature = (score: number): Temperature => (score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cold')

export const isActiveLead = (l: Lead) => l.status !== 'Disqualified'

/** Lead-to-opportunity conversion: share of leads that produced at least one opportunity */
export function leadConversion(leads: Lead[], opps: Opportunity[]) {
  if (!leads.length) return null
  const withOpp = new Set(opps.map((o) => o.leadId).filter(Boolean))
  return leads.filter((l) => withOpp.has(l.id)).length / leads.length
}

/** Fields worth knowing before qualification; used by "missing information" insights */
export const LEAD_KEY_FIELDS: { key: keyof Lead; label: string }[] = [
  { key: 'businessProblem', label: 'Business problem' },
  { key: 'estimatedBudget', label: 'Estimated budget' },
  { key: 'timeline', label: 'Project timeline' },
  { key: 'decisionMakers', label: 'Decision makers' },
  { key: 'budgetReadiness', label: 'Budget readiness' },
  { key: 'expectedDecisionDate', label: 'Expected decision date' },
  { key: 'nextFollowUp', label: 'Next follow-up date' },
]
export const missingLeadFields = (l: Lead) =>
  LEAD_KEY_FIELDS.filter((f) => l[f.key] === null || l[f.key] === '' || (Array.isArray(l[f.key]) && !(l[f.key] as unknown[]).length)).map((f) => f.label)

/* ---------- tasks ---------- */
export const isOverdue = (t: Pick<Task, 'status' | 'dueDate'>, today = todayIso()) => t.status === 'Open' && t.dueDate < today
export const isDueToday = (t: Pick<Task, 'status' | 'dueDate'>, today = todayIso()) => t.status === 'Open' && t.dueDate === today

/* ---------- money ---------- */
export function formatMoney(amount: number | null | undefined, currency = 'INR', compact = false) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—'
  const locale = currency === 'INR' ? 'en-IN' : 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency, maximumFractionDigits: compact ? 1 : 0, notation: compact ? 'compact' : 'standard',
  }).format(amount)
}
