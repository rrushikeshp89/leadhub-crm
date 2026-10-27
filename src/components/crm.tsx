import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Add, Call, Copy, DocumentText, Edit2, Flag, Magicpen, MessageText1, Note1, People, Refresh2, Sms, TaskSquare, Trash, Warning2,
} from 'iconsax-react'
import { STAGES, TASK_PRIORITIES, type Activity, type Lead, type Opportunity, type Stage, type Task } from '../../shared/model'
import { dayDiff, isOverdue, qualificationScore, suggestedTemperature, todayIso } from '../../shared/calc'
import { ApiError, post } from '../lib/api'
import { useLookups, useStore } from '../store/Store'
import type { Insight } from '../lib/insights'
import { Avatar, Card, CardHeader, Checkbox, ConfirmModal, Empty, IconAction, Notice, Pill, Spinner, Tabs, Tag } from './ui'
import { Gauge } from './widgets'
import { ActivityForm, LostReasonModal, TaskForm } from './forms'
import { cx, longDate, timeAgo } from '../lib/format'
import { C } from '../lib/theme'

/* ---------- small badges ---------- */
export const StagePill = ({ stage }: { stage: Stage }) => <Pill>{stage}</Pill>
export function TempPill({ t }: { t: Lead['temperature'] }) {
  return t ? <Pill dot={false}>{t}</Pill> : <span className="text-[12px] italic text-faint">Not set</span>
}
export function DueLabel({ date, done }: { date: string | null; done?: boolean }) {
  if (!date) return <span className="italic text-faint">Not set</span>
  const today = todayIso()
  const diff = dayDiff(today, date)
  const overdue = !done && date < today
  return (
    <span className={cx('whitespace-nowrap', overdue ? 'font-medium text-danger' : diff === 0 && !done ? 'font-medium text-warn' : '')}>
      {longDate(date)}{overdue ? ` · ${-diff}d overdue` : diff === 0 && !done ? ' · today' : ''}
    </span>
  )
}

/* ---------- activity timeline ---------- */
const ACT_ICON: Record<Activity['type'], { icon: typeof Call; bg: string; color: string; label: string }> = {
  call: { icon: Call, bg: 'bg-sky-light', color: C.skyAccent, label: 'Call' },
  email: { icon: Sms, bg: 'bg-lavender-light', color: C.lavenderInk, label: 'Email' },
  meeting: { icon: People, bg: 'bg-sun-light', color: C.sun, label: 'Meeting' },
  note: { icon: Note1, bg: 'bg-canvas', color: C.muted, label: 'Note' },
  status_change: { icon: Flag, bg: 'bg-success-light', color: C.success, label: 'Status' },
  task: { icon: TaskSquare, bg: 'bg-sky-light', color: C.skyAccent, label: 'Task' },
  proposal: { icon: DocumentText, bg: 'bg-warn-light', color: C.warn, label: 'Proposal' },
  system: { icon: Flag, bg: 'bg-canvas', color: C.faint, label: 'System' },
}
const FILTERS = [
  { key: 'all', label: 'All' }, { key: 'interactions', label: 'Interactions' }, { key: 'status', label: 'Status' }, { key: 'tasks', label: 'Tasks' }, { key: 'proposals', label: 'Proposals' },
] as const
type Filter = (typeof FILTERS)[number]['key']
const matches = (a: Activity, f: Filter) =>
  f === 'all' || (f === 'interactions' && ['call', 'email', 'meeting', 'note'].includes(a.type)) || (f === 'status' && ['status_change', 'system'].includes(a.type)) ||
  (f === 'tasks' && a.type === 'task') || (f === 'proposals' && a.type === 'proposal')

export function Timeline({ activities, defaults, title = 'Activity Timeline', className }: {
  activities: Activity[]; defaults: { leadId?: string | null; opportunityId?: string | null; companyId?: string | null; contactId?: string | null }; title?: string; className?: string
}) {
  const { userById, oppById } = useLookups()
  const [filter, setFilter] = useState<Filter>('all')
  const [log, setLog] = useState(false)
  const list = useMemo(() => [...activities].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).filter((a) => matches(a, filter)), [activities, filter])
  return (
    <Card className={className}>
      <CardHeader title={title} action={<button className="btn-soft" onClick={() => setLog(true)}><Add size={14} color="currentColor" />Log activity</button>} />
      <Tabs className="mb-4" tabs={FILTERS.map((f) => ({ ...f, count: activities.filter((a) => matches(a, f.key)).length }))} value={filter} onChange={setFilter} />
      {list.length === 0 ? <Empty text="No activity recorded yet. Log a call, email, meeting or note." /> : (
        <ol className="scroll-thin relative max-h-[560px] space-y-5 overflow-y-auto pr-2">
          {list.map((a, i) => {
            const m = ACT_ICON[a.type]
            const user = a.userId ? userById.get(a.userId) : undefined
            const opp = a.opportunityId ? oppById.get(a.opportunityId) : undefined
            return (
              <li key={a.id} className="relative flex gap-3">
                {i < list.length - 1 && <span className="absolute left-[13px] top-8 h-[calc(100%-4px)] border-l border-dashed border-faint/50" />}
                <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', m.bg)}><m.icon size={14} color={m.color} variant="Bold" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-[13px] font-medium">{a.title}</p>
                    <time className="whitespace-nowrap text-[11px] text-faint" title={new Date(a.occurredAt).toLocaleString()}>{timeAgo(a.occurredAt)}</time>
                  </div>
                  {a.body && <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-muted">{a.body}</p>}
                  <p className="mt-1 text-[11px] text-faint">
                    {m.label}{user ? ` · ${user.name}` : a.userId === null && a.type === 'system' ? ' · Automatic' : ''}
                    {opp && !defaults.opportunityId && <> · <Link className="hover:text-sky-accent" to={`/opportunities/${opp.id}`}>{opp.name}</Link></>}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      <ActivityForm open={log} onClose={() => setLog(false)} defaults={defaults} />
    </Card>
  )
}

/* ---------- tasks ---------- */
export function TaskList({ tasks, defaults, title = 'Tasks & Follow-ups', className, showRelated, emptyText }: {
  tasks: Task[]; defaults?: Partial<Task>; title?: string; className?: string; showRelated?: boolean; emptyText?: string
}) {
  const { update, remove, attempt } = useStore()
  const { userById, leadById, oppById } = useLookups()
  const [form, setForm] = useState<{ open: boolean; task?: Task }>({ open: false })
  const [confirm, setConfirm] = useState<Task | null>(null)
  const [showDone, setShowDone] = useState(false)
  const order = (t: Task) => `${t.status === 'Open' ? 0 : 1}${t.dueDate}${TASK_PRIORITIES.indexOf(t.priority)}`
  const list = [...tasks].filter((t) => showDone || t.status === 'Open').sort((a, b) => order(a).localeCompare(order(b)))
  const doneCount = tasks.filter((t) => t.status === 'Completed').length
  return (
    <Card className={className}>
      <CardHeader title={title} action={<button className="btn-soft" onClick={() => setForm({ open: true })}><Add size={14} color="currentColor" />Add Task</button>} />
      {list.length === 0 ? <Empty text={tasks.length ? 'All tasks are completed.' : emptyText ?? 'No tasks yet. Add the next follow-up.'} /> : (
        <ul className="divide-y divide-line">
          {list.map((t) => {
            const overdue = isOverdue(t)
            const owner = t.ownerId ? userById.get(t.ownerId) : undefined
            const rel = showRelated ? (t.opportunityId ? oppById.get(t.opportunityId) : undefined) : undefined
            const relLead = showRelated && !rel && t.leadId ? leadById.get(t.leadId) : undefined
            return (
              <li key={t.id} className={cx('-mx-2 flex items-start gap-3 rounded-lg px-2 py-3', overdue && 'bg-danger-light/50')}>
                <span className="mt-0.5"><Checkbox label={`Complete ${t.title}`} checked={t.status === 'Completed'} onChange={(v) => attempt(() => update('tasks', t.id, { status: v ? 'Completed' : 'Open' }, v ? 'Task completed' : 'Task reopened'))} /></span>
                <div className="min-w-0 flex-1">
                  <p className={cx('text-[13px] font-medium', t.status === 'Completed' && 'text-muted line-through')}>{t.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                    <Pill dot={false} className="px-2 py-0 text-[11px]">{t.priority}</Pill>
                    <span>{t.type}</span>·<DueLabel date={t.dueDate} done={t.status === 'Completed'} />{t.dueTime && <span>{t.dueTime}</span>}
                    {owner && <>· <span>{owner.name}</span></>}
                    {rel && <>· <Link className="hover:text-sky-accent" to={`/opportunities/${rel.id}`}>{rel.name}</Link></>}
                    {relLead && <>· <Link className="hover:text-sky-accent" to={`/leads/${relLead.id}`}>{relLead.title}</Link></>}
                  </p>
                </div>
                <IconAction label="Edit task" onClick={() => setForm({ open: true, task: t })}><Edit2 size={18} color={C.muted} /></IconAction>
                <IconAction label="Delete task" danger onClick={() => setConfirm(t)}><Trash size={18} color={C.muted} /></IconAction>
              </li>
            )
          })}
        </ul>
      )}
      {doneCount > 0 && <button className="link-accent mt-3" onClick={() => setShowDone((s) => !s)}>{showDone ? 'Hide' : 'Show'} {doneCount} completed</button>}
      <TaskForm open={form.open} task={form.task} defaults={defaults} onClose={() => setForm({ open: false })} />
      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} text={`Delete task “${confirm?.title}”?`} onConfirm={() => confirm && attempt(() => remove('tasks', confirm.id, 'Task'))} />
    </Card>
  )
}

/* ---------- next action ---------- */
export function NextActionCard({ action, date, source, playbook, onPlan, extra }: {
  action: string | null; date: string | null; source: string; playbook: string; onPlan: () => void; extra?: ReactNode
}) {
  return (
    <Card>
      <CardHeader title="Next action" action={<button onClick={onPlan} className="btn-soft"><Add size={14} color="currentColor" />Plan task</button>} />
      {action ? (
        <div className="flex items-stretch gap-4 rounded-lg bg-sky-light px-4 py-4">
          <span className="w-[3px] shrink-0 rounded bg-white" />
          <div className="min-w-0">
            <p className="text-[15px] font-medium leading-snug">{action}</p>
            <p className="mt-1 text-[12px] text-muted">Due <DueLabel date={date} />{source && ` · ${source}`}</p>
          </div>
        </div>
      ) : <div className="rounded-lg bg-danger-light px-4 py-4 text-[13px] text-danger">No next action is set.</div>}
      <p className="mt-4 text-[12px] leading-relaxed text-muted"><span className="font-medium text-ink">Playbook step:</span> {playbook}</p>
      <p className="meta mt-1">Playbook steps are rule-based.</p>
      {extra}
    </Card>
  )
}

/* ---------- rule-based insights ---------- */
export function InsightsCard({ insights, title = 'Needs attention' }: { insights: Insight[]; title?: string }) {
  return (
    <Card>
      <CardHeader title={title} action={<span title="Deterministic checks on CRM data — not AI"><Tag>Rule-based</Tag></span>} />
      {insights.length === 0 ? <p className="text-[12px] text-muted">Nothing flagged. Key information is captured and follow-ups are on track.</p> : (
        <ul className="space-y-2">
          {insights.map((i) => (
            <li key={i.text} className="flex gap-2 text-[12px] leading-snug">
              <Warning2 size={14} className="mt-0.5 shrink-0" color={i.level === 'danger' ? C.danger : i.level === 'warn' ? C.warn : C.skyAccent} variant="Bold" />
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ---------- qualification ---------- */
const LEVELS = [{ v: null, label: '?' }, { v: 0, label: 'None' }, { v: 1, label: 'Weak' }, { v: 2, label: 'Moderate' }, { v: 3, label: 'Strong' }] as const

export function QualificationCard({ lead }: { lead: Lead }) {
  const { db, update, attempt } = useStore()
  const criteria = db.settings.qualification
  const q = qualificationScore(lead.qualification, criteria)
  const suggested = suggestedTemperature(q.score)
  const setLevel = (key: string, v: number | null) => attempt(() => update('leads', lead.id, { qualification: { ...lead.qualification, [key]: v } }))
  return (
    <Card>
      <CardHeader title="Qualification" action={<Link to="/settings" className="link-muted">Framework</Link>} />
      <Gauge value={q.score} max={100} caption={`${q.answered}/${q.total} criteria assessed`} />
      <p className="mt-3 text-center text-[12px] text-muted">
        Score suggests <b className="text-ink">{suggested}</b>{lead.temperature && lead.temperature !== suggested && <> · recorded as <b className="text-ink">{lead.temperature}</b></>}
        {lead.temperature !== suggested && <button className="link-accent ml-2" onClick={() => attempt(() => update('leads', lead.id, { temperature: suggested }, 'Temperature'))}>Apply</button>}
      </p>
      <div className="mt-4 space-y-3">
        {criteria.map((c) => {
          const cur = lead.qualification?.[c.key] ?? null
          return (
            <div key={c.key}>
              <div className="flex items-baseline justify-between"><span className="text-[12px] font-medium" title={c.hint}>{c.label}</span><span className="text-[11px] text-faint">weight {c.weight}</span></div>
              <div className="mt-1 grid grid-cols-5 gap-1" role="radiogroup" aria-label={c.label}>
                {LEVELS.map((l) => (
                  <button key={String(l.v)} role="radio" aria-checked={cur === l.v} onClick={() => setLevel(c.key, l.v)} title={l.v === null ? 'Unknown' : l.label}
                    className={cx('rounded py-1 text-[11px] transition-colors', cur === l.v ? (l.v === null ? 'bg-canvas text-ink ring-1 ring-faint' : 'bg-lavender text-ink') : 'bg-canvas text-muted hover:text-ink')}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/* ---------- stage stepper ---------- */
export function StageStepper({ opp }: { opp: Opportunity }) {
  const { changeStage, toast } = useStore()
  const [lost, setLost] = useState(false)
  const cur = STAGES.indexOf(opp.stage)
  const go = async (s: Stage, extra?: { lostReason: string; lostNote: string }) => {
    try { await changeStage(opp.id, s, extra); toast(`Moved to ${s}`) } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not move', 'danger') }
  }
  return (
    <div>
      <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-5" aria-label="Pipeline stage">
        {STAGES.filter((s) => s !== 'Closed Lost').map((s, i) => {
          const done = opp.stage !== 'Closed Lost' && i <= cur
          return (
            <li key={s}>
              <button onClick={() => s !== opp.stage && go(s)} aria-current={s === opp.stage ? 'step' : undefined}
                className={cx('flex h-10 w-full items-center justify-center rounded-md px-2 text-center text-[11px] leading-tight transition-colors', s === opp.stage ? 'bg-sky font-semibold text-ink ring-2 ring-sky-accent ring-inset' : done ? 'bg-sky-light text-ink' : 'bg-canvas text-muted hover:bg-sky-light')}>
                {s}
              </button>
            </li>
          )
        })}
        <li>
          <button onClick={() => opp.stage !== 'Closed Lost' && setLost(true)} className={cx('flex h-10 w-full items-center justify-center rounded-md px-2 text-[11px] transition-colors', opp.stage === 'Closed Lost' ? 'bg-danger-light font-semibold text-danger ring-2 ring-danger ring-inset' : 'bg-danger-light/60 text-danger hover:bg-danger-light')}>Closed Lost</button>
        </li>
      </ol>
      {opp.stage === 'Closed Lost' && <p className="mt-2 text-[12px] text-danger">Lost: {opp.lostReason}{opp.lostNote ? ` — ${opp.lostNote}` : ''}</p>}
      <LostReasonModal open={lost} onClose={() => setLost(false)} onConfirm={async (r, n) => { await go('Closed Lost', { lostReason: r, lostNote: n }); setLost(false) }} />
    </div>
  )
}

/* ---------- AI assistant ---------- */
type AiKind = 'summary' | 'next_action' | 'meeting_brief' | 'email' | 'qualification'
interface AiResult<T = Record<string, unknown>> { kind: AiKind; result: T; model: string; generatedAt: string }

const AI_TABS: { key: AiKind; label: string }[] = [
  { key: 'summary', label: 'Summary' }, { key: 'next_action', label: 'Next best action' }, { key: 'meeting_brief', label: 'Meeting prep' },
  { key: 'email', label: 'Email draft' }, { key: 'qualification', label: 'Qualification' },
]

export function AiAssistant({ lead, opportunity }: { lead?: Lead; opportunity?: Opportunity }) {
  const { db, update, create, attempt, toast } = useStore()
  const [tab, setTab] = useState<AiKind>('summary')
  const [results, setResults] = useState<Partial<Record<AiKind, AiResult>>>({})
  const [busy, setBusy] = useState<AiKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [purpose, setPurpose] = useState('')
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null)
  const configured = db.meta.ai.configured
  const tabs = lead ? AI_TABS : AI_TABS.filter((t) => t.key !== 'qualification')
  const ref = { leadId: lead?.id ?? opportunity?.leadId ?? null, opportunityId: opportunity?.id ?? null, companyId: (opportunity ?? lead)?.companyId ?? null }

  const run = async (kind: AiKind) => {
    setBusy(kind); setError(null)
    try {
      const r = await post<AiResult>(`/ai/${kind}`, { leadId: lead?.id, opportunityId: opportunity?.id, purpose })
      setResults((s) => ({ ...s, [kind]: r }))
      if (kind === 'email') setDraft(r.result as { subject: string; body: string })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The AI request failed.')
    } finally { setBusy(null) }
  }
  const r = results[tab]
  const list = (xs: unknown) => (Array.isArray(xs) && xs.length ? <ul className="ml-4 list-disc space-y-1">{xs.map((x, i) => <li key={i}>{String(x)}</li>)}</ul> : <p className="text-faint">None identified.</p>)

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Magicpen size={18} color={C.lavenderInk} variant="Bold" />AI Assistant</span>}
        action={configured ? <span className="text-[11px] text-faint">{db.meta.ai.model}</span> : <Tag tone="sun">Not configured</Tag>} />
      <Tabs className="mb-4" tabs={tabs} value={tab} onChange={(t) => { setTab(t); setError(null) }} />
      {!configured && (
        <Notice tone="warn" className="mb-3">
          AI integration is pending. An administrator needs to set <code className="rounded bg-white px-1">ANTHROPIC_API_KEY</code> in the server’s <code className="rounded bg-white px-1">.env</code> and restart the API.
          Until then, use the rule-based “Needs attention” checks and playbook steps.
        </Notice>
      )}
      {tab === 'email' && (
        <label className="mb-3 block"><span className="mb-1 block text-[12px] text-muted">Purpose of the email</span>
          <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. follow up on the proposal sent last week" />
        </label>
      )}
      <button className="btn-primary w-full" disabled={!configured || busy !== null} onClick={() => run(tab)}>
        {busy === tab ? <><Spinner className="border-white/40 border-t-white" /> Generating…</> : r ? <><Refresh2 size={14} color="currentColor" /> Regenerate</> : <><Magicpen size={14} color="currentColor" /> Generate</>}
      </button>
      {error && <Notice tone="danger" className="mt-3">{error}</Notice>}

      {r && (
        <div className="mt-4 space-y-3 text-[12px] leading-relaxed">
          <p className="rounded bg-lavender-light px-2 py-1 text-[11px] text-lavender-ink">AI-generated suggestion · {r.model} · {new Date(r.generatedAt).toLocaleTimeString()} — verify before relying on it. Nothing has been saved.</p>
          {tab === 'summary' && <>
            <p>{String(r.result.summary)}</p>
            <div><p className="font-medium">Key facts</p>{list(r.result.keyFacts)}</div>
            <div><p className="font-medium">Open questions</p>{list(r.result.openQuestions)}</div>
          </>}
          {tab === 'meeting_brief' && <>
            <div><p className="font-medium">Company background</p><p>{String(r.result.background)}</p></div>
            <div><p className="font-medium">Known requirements</p>{list(r.result.knownRequirements)}</div>
            <div><p className="font-medium">Previous interactions</p>{list(r.result.previousInteractions)}</div>
            <div><p className="font-medium">Unresolved questions</p>{list(r.result.unresolvedQuestions)}</div>
            <div><p className="font-medium">Recommended discussion points</p>{list(r.result.discussionPoints)}</div>
          </>}
          {tab === 'next_action' && <>
            <p className="text-[14px] font-medium">{String(r.result.action)}</p>
            <p className="text-muted">{String(r.result.why)}</p>
            <p className="text-muted">{String(r.result.taskType)} · {String(r.result.priority)} priority · due in {String(r.result.dueInDays)} day(s)</p>
            <button className="btn-ghost btn-sm" onClick={() => {
              const due = new Date(); due.setDate(due.getDate() + Math.max(0, Number(r.result.dueInDays) || 0))
              void attempt(() => create('tasks', { ...ref, title: String(r.result.action), type: r.result.taskType, priority: r.result.priority, dueDate: due.toISOString().slice(0, 10) }, 'Task'))
            }}><Add size={14} color="currentColor" />Create this task</button>
          </>}
          {tab === 'email' && draft && <>
            <label className="block"><span className="text-muted">Subject</span><input className="input mt-1" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></label>
            <label className="block"><span className="text-muted">Body</span><textarea className="input mt-1 h-56 py-2" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`); toast('Copied to clipboard') } catch { toast('Copy failed — select the text manually', 'danger') } }}><Copy size={14} color="currentColor" />Copy</button>
              <button className="btn-ghost btn-sm" onClick={() => attempt(() => create('activities', { ...ref, type: 'email', title: `Email: ${draft.subject}`, body: draft.body }, 'Email logged'))}><MessageText1 size={14} color="currentColor" />Log as sent email</button>
            </div>
            <p className="text-[11px] text-faint">LeadHub does not send email. Copy the draft into your mail client, then log it here once sent.</p>
          </>}
          {tab === 'qualification' && lead && <QualSuggestion lead={lead} result={r.result as { criteria: { key: string; value: number | null; rationale: string }[]; overall: string }}
            onApply={(values) => attempt(() => update('leads', lead.id, { qualification: { ...lead.qualification, ...values } }, 'Qualification'))} />}
        </div>
      )}
    </Card>
  )
}

function QualSuggestion({ lead, result, onApply }: { lead: Lead; result: { criteria: { key: string; value: number | null; rationale: string }[]; overall: string }; onApply: (v: Record<string, number | null>) => void }) {
  const { db } = useStore()
  const label = (v: number | null | undefined) => (v === null || v === undefined ? 'Unknown' : ['None', 'Weak', 'Moderate', 'Strong'][v])
  const suggested = Object.fromEntries(result.criteria.filter((c) => c.value !== null).map((c) => [c.key, c.value]))
  const score = qualificationScore({ ...lead.qualification, ...suggested }, db.settings.qualification).score
  return (
    <>
      <p>{result.overall}</p>
      <table className="w-full text-left">
        <thead><tr className="text-[11px] text-muted"><th className="py-1">Criterion</th><th>Recorded</th><th>Suggested</th></tr></thead>
        <tbody>
          {result.criteria.map((c) => (
            <tr key={c.key} className="border-t border-line align-top">
              <td className="py-1.5 pr-2">{db.settings.qualification.find((x) => x.key === c.key)?.label ?? c.key}<p className="text-[11px] text-faint">{c.rationale}</p></td>
              <td className="py-1.5">{label(lead.qualification?.[c.key])}</td>
              <td className="py-1.5 font-medium">{label(c.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn-ghost btn-sm" disabled={!Object.keys(suggested).length} onClick={() => onApply(suggested)}>Apply suggested values (score would be {score})</button>
      <p className="text-[11px] text-faint">Applying updates the recorded qualification. Unknown suggestions are not applied.</p>
    </>
  )
}

/* ---------- related-record helpers ---------- */
export function PersonChip({ name, avatar, sub, to }: { name: string; avatar?: string | null; sub?: ReactNode; to?: string }) {
  const body = (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar src={avatar} name={name} size={36} />
      <span className="min-w-0"><span className="block truncate text-[13px]">{name}</span>{sub && <span className="block truncate text-[11px] text-muted">{sub}</span>}</span>
    </span>
  )
  return to ? <Link to={to} className="hover:text-sky-accent">{body}</Link> : body
}

/* ---------- Detail-page hero (template "Welcome, Mia Williams" card) ---------- */
export function Hero({ eyebrow, title, subtitle, media, onEdit, meta, badges, actions, danger }: {
  eyebrow: ReactNode; title: ReactNode; subtitle?: ReactNode; media: ReactNode; onEdit?: () => void
  meta?: ReactNode; badges?: ReactNode; actions?: ReactNode; danger?: ReactNode
}) {
  return (
    <section className="rounded-card bg-sky p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="shrink-0">{media}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-ink/60">{eyebrow}</p>
              <h1 className="mt-0.5 text-[22px] font-medium leading-tight">{title}</h1>
              {subtitle && <div className="mt-1 text-[13px]">{subtitle}</div>}
            </div>
            {onEdit && <button aria-label="Edit" title="Edit" onClick={onEdit} className="icon-btn hover:bg-white/60"><Edit2 size={18} color={C.ink} variant="Bold" /></button>}
          </div>
          {meta && <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-2 text-[12px] sm:grid-cols-2">{meta}</div>}
          {badges && <div className="mt-4 flex flex-wrap items-center gap-2">{badges}</div>}
        </div>
      </div>
      {(actions || danger) && (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/70 pt-4">
          {actions}
          {danger && <span className="ml-auto">{danger}</span>}
        </div>
      )}
    </section>
  )
}

/** One fact in the hero meta grid, with the template's bold icon */
export function HeroMeta({ icon: Icon, children }: { icon: typeof Call; children: ReactNode }) {
  return <span className="flex min-w-0 items-center gap-2"><Icon size={14} color={C.ink} variant="Bold" className="shrink-0" /><span className="min-w-0 truncate">{children}</span></span>
}

/** White chip on the hero card (status, owner, source…) */
export function HeroBadge({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-8 items-center gap-1 rounded-md bg-white/70 px-3 text-[12px]">{children}</span>
}
