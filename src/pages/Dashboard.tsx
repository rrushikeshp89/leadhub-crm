import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Chart, Timer1 } from 'iconsax-react'
import { INDUSTRIES, LOST_REASONS, OPEN_STAGES, SERVICE_CATEGORIES, type Opportunity } from '../../shared/model'
import { dayDiff, isDueToday, isOverdue, isOpen, isoDay, leadConversion, pipelineSummary, stageConversion, todayIso, weightedValue } from '../../shared/calc'
import { useLookups, useStore } from '../store/Store'
import { Avatar, Card, CardHeader, Dropdown, MoreButton } from '../components/ui'
import { AgendaList, ChartEmpty, Legend, MessagesCard, RecentActivity, StatCard, TipBox, useDayEvents, WeekStrip, WhiteStat } from '../components/widgets'
import { DueLabel } from '../components/crm'
import { useMoney } from '../lib/hooks'
import { addDays, isoDate, MONTHS_SHORT } from '../lib/format'
import { C, SERIES } from '../lib/theme'

const AXIS = { fontSize: 12, fill: C.faint }
const RANGES = ['This month', 'Last 30 days', 'This quarter', 'This year', 'All time'] as const
type Range = (typeof RANGES)[number]
const STAGE_SHORT: Record<string, string> = { 'New Lead': 'New', Contacted: 'Contacted', 'Discovery Scheduled': 'Disc. booked', 'Discovery Completed': 'Disc. done', 'Qualified Opportunity': 'Qualified', 'Solution Design': 'Solution', 'Proposal Sent': 'Proposal', Negotiation: 'Negotiation' }
const PALETTE = SERIES

function rangeBounds(r: Range): { from: string | null; prevFrom: string | null; prevTo: string | null } {
  const now = new Date()
  let from: Date | null
  if (r === 'This month') from = new Date(now.getFullYear(), now.getMonth(), 1)
  else if (r === 'Last 30 days') from = addDays(now, -29)
  else if (r === 'This quarter') from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  else if (r === 'This year') from = new Date(now.getFullYear(), 0, 1)
  else from = null
  if (!from) return { from: null, prevFrom: null, prevTo: null }
  const len = dayDiff(isoDay(from), isoDay(now)) + 1
  return { from: isoDay(from), prevFrom: isoDay(addDays(from, -len)), prevTo: isoDay(addDays(from, -1)) }
}
const inRange = (iso: string | null, from: string | null, to?: string | null) => !!iso && (!from || iso.slice(0, 10) >= from) && (!to || iso.slice(0, 10) <= to)
const pct = (cur: number, prev: number | null) => (prev === null || prev === 0 ? null : Math.round(((cur - prev) / prev) * 100))

export default function Dashboard() {
  const { db } = useStore()
  const { companyById, userById } = useLookups()
  const money = useMoney()
  const navigate = useNavigate()
  const [range, setRange] = useState<Range>('This quarter')
  const [owner, setOwner] = useState('All owners')
  const [industry, setIndustry] = useState('All industries')
  const [service, setService] = useState('All services')
  const [day, setDay] = useState(todayIso())
  const events = useDayEvents(day)
  const today = todayIso()
  const { from, prevFrom, prevTo } = rangeBounds(range)

  const f = useMemo(() => {
    const ownerOk = (id: string | null) => owner === 'All owners' || userById.get(id ?? '')?.name === owner
    const industryOk = (companyId: string) => industry === 'All industries' || companyById.get(companyId)?.industry === industry
    const leads = db.leads.filter((l) => ownerOk(l.ownerId) && industryOk(l.companyId) && (service === 'All services' || l.services.includes(service)))
    const opps = db.opportunities.filter((o) => ownerOk(o.ownerId) && industryOk(o.companyId) && (service === 'All services' || o.services.includes(service)))
    const tasks = db.tasks.filter((t) => ownerOk(t.ownerId))
    const events = db.events.filter((e) => ownerOk(e.ownerId))
    return { leads, opps, tasks, events }
  }, [db.leads, db.opportunities, db.tasks, db.events, owner, industry, service, companyById, userById])

  const m = useMemo(() => {
    const snapshot = pipelineSummary(f.opps)
    const closedIn = f.opps.filter((o) => !isOpen(o.stage) && inRange(o.closedAt, from))
    const closedPrev = prevFrom ? f.opps.filter((o) => !isOpen(o.stage) && inRange(o.closedAt, prevFrom, prevTo)) : null
    const period = pipelineSummary(closedIn)
    const prev = closedPrev ? pipelineSummary(closedPrev) : null
    const newLeads = f.leads.filter((l) => inRange(l.createdAt, from))
    const newLeadsPrev = prevFrom ? f.leads.filter((l) => inRange(l.createdAt, prevFrom, prevTo)).length : null
    const in7 = isoDate(addDays(new Date(), 7))
    return {
      snapshot, period, prev, newLeads, newLeadsPrev,
      activeLeads: f.leads.filter((l) => l.status !== 'Disqualified').length,
      conversion: leadConversion(newLeads, f.opps),
      overdue: f.tasks.filter((t) => isOverdue(t, today)).length,
      dueToday: f.tasks.filter((t) => isDueToday(t, today)).length,
      meetings: f.events.filter((e) => e.date >= today && e.date <= in7 && e.kind !== 'Internal').length,
    }
  }, [f, from, prevFrom, prevTo, today])

  // Lead acquisition by source (leads created in the period)
  const sources = useMemo(() => {
    const c = new Map<string, number>()
    m.newLeads.forEach((l) => c.set(l.source ?? 'Unknown', (c.get(l.source ?? 'Unknown') ?? 0) + 1))
    return [...c.entries()].map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n)
  }, [m.newLeads])

  // Open opportunities by stage
  const byStage = useMemo(() => OPEN_STAGES.map((s) => {
    const xs = f.opps.filter((o) => o.stage === s)
    return { stage: s, short: STAGE_SHORT[s], n: xs.length, value: xs.reduce((a, o) => a + o.value, 0), weighted: xs.reduce((a, o) => a + weightedValue(o), 0) }
  }), [f.opps])

  // Pipeline by primary service (avoids double counting multi-service opportunities)
  const byService = useMemo(() => {
    const c = new Map<string, { value: number; weighted: number }>()
    f.opps.filter((o) => isOpen(o.stage)).forEach((o) => {
      const k = o.services[0] ?? 'Unspecified'
      const cur = c.get(k) ?? { value: 0, weighted: 0 }
      c.set(k, { value: cur.value + o.value, weighted: cur.weighted + weightedValue(o) })
    })
    return [...c.entries()].map(([service, v]) => ({ service, ...v })).sort((a, b) => b.value - a.value)
  }, [f.opps])

  // Monthly trend: opportunity value created vs closed-won value, last 6 (or 12) months
  const trend = useMemo(() => {
    const months = range === 'This year' || range === 'All time' ? 12 : 6
    const now = new Date()
    return Array.from({ length: months }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const created = f.opps.filter((o) => o.createdAt.slice(0, 7) === key)
      const won = f.opps.filter((o) => o.stage === 'Closed Won' && o.closedAt?.slice(0, 7) === key)
      return { m: `${MONTHS_SHORT[d.getMonth()]}${months === 12 ? ` ${String(d.getFullYear()).slice(2)}` : ''}`, created: created.reduce((a, o) => a + o.value, 0), won: won.reduce((a, o) => a + o.value, 0), nCreated: created.length, nWon: won.length }
    })
  }, [f.opps, range])

  // Lost analysis (closed lost in period)
  const lost = useMemo(() => {
    const xs = f.opps.filter((o) => o.stage === 'Closed Lost' && inRange(o.closedAt, from))
    return LOST_REASONS.map((r) => ({ reason: r, n: xs.filter((o) => o.lostReason === r).length, value: xs.filter((o) => o.lostReason === r).reduce((a, o) => a + o.value, 0) })).filter((x) => x.n)
  }, [f.opps, from])

  // Performance by owner
  const perf = useMemo(() => db.users.map((u) => {
    const mine = f.opps.filter((o) => o.ownerId === u.id)
    const open = pipelineSummary(mine)
    const closed = pipelineSummary(mine.filter((o) => !isOpen(o.stage) && inRange(o.closedAt, from)))
    return { u, open: open.openValue, weighted: open.weightedValue, won: closed.wonValue, winRate: closed.winRate, deals: open.openCount, overdue: f.tasks.filter((t) => t.ownerId === u.id && isOverdue(t, today)).length }
  }).filter((r) => r.deals || r.won || r.overdue).sort((a, b) => b.weighted - a.weighted), [db.users, f.opps, f.tasks, from, today])

  const funnel = useMemo(() => stageConversion(f.opps, db.stageHistory), [f.opps, db.stageHistory])
  const due = useMemo(() => f.tasks.filter((t) => t.status === 'Open' && t.dueDate <= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6), [f.tasks, today])
  const marked = useMemo(() => new Set(db.events.map((e) => e.date)), [db.events])
  const pctLabel = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)
  const linkFor = (o?: Opportunity) => (o ? `/opportunities/${o.id}` : '/opportunities')
  const go = (to: string) => [{ label: 'View details', onClick: () => navigate(to) }]
  const periodLabel = range === 'All time' ? 'all time' : range.toLowerCase()

  return (
    <div className="flex flex-col gap-6">
      <div className="-mb-2 flex flex-wrap items-center gap-3">
        <h1 className="card-title mr-auto">Sales performance</h1>
        <Dropdown variant="white" label="Date range" value={range} options={RANGES} onChange={setRange} />
        <Dropdown variant="white" label="Owner" value={owner} options={['All owners', ...db.users.map((u) => u.name)]} onChange={setOwner} />
        <Dropdown variant="white" label="Industry" value={industry} options={['All industries', ...INDUSTRIES]} onChange={setIndustry} />
        <Dropdown variant="white" label="Service" value={service} options={['All services', ...SERVICE_CATEGORIES]} onChange={setService} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2.07fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            <StatCard tone="lavender" value={money(m.snapshot.openValue, true)} full={money(m.snapshot.openValue)} label="Open pipeline" hint="Sum of estimated values of all open opportunities — not confirmed revenue" menu={go('/opportunities')} />
            <StatCard tone="sun" value={money(m.snapshot.weightedValue, true)} full={money(m.snapshot.weightedValue)} label="Weighted pipeline" hint="Σ estimated value × probability of closing, open opportunities" menu={go('/pipeline')} />
            <StatCard tone="lavender" value={money(m.period.wonValue, true)} full={money(m.period.wonValue)} label="Closed won" trend={pct(m.period.wonValue, m.prev?.wonValue ?? null)} hint="Confirmed revenue: opportunities marked Closed Won in the period" menu={go('/opportunities?view=won')} />
            <StatCard tone="sun" value={pctLabel(m.period.winRate)} label="Win rate" hint="Won ÷ (won + lost) among opportunities closed in the period" menu={go('/opportunities?view=closed')} />
          </div>

          <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
            <WhiteStat label="Active leads" value={String(m.activeLeads)} to="/leads" sub="not disqualified" />
            <WhiteStat label="New leads" value={String(m.newLeads.length)} trend={pct(m.newLeads.length, m.newLeadsPrev)} to="/leads?view=new" />
            <WhiteStat label="Qualified opportunities" value={String(m.snapshot.qualifiedCount)} to="/opportunities?view=qualified" sub="Qualified → Negotiation" />
            <WhiteStat label="Lead → opportunity" value={pctLabel(m.conversion)} sub={`of ${m.newLeads.length} new leads`} />
            <WhiteStat label="Overdue follow-ups" value={String(m.overdue)} tone={m.overdue ? 'danger' : undefined} to="/follow-ups" sub={`${m.dueToday} due today`} />
            <WhiteStat label="Meetings next 7 days" value={String(m.meetings)} to="/calendar" sub="client-facing" />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Lead sources" action={<span className="text-[11px] text-faint">{periodLabel}</span>} />
              {sources.length === 0 ? <ChartEmpty text="No new leads in this period." /> : (
                <div style={{ height: Math.max(180, sources.length * 34) }}>
                  <ResponsiveContainer>
                    <BarChart data={sources} layout="vertical" margin={{ left: 0, right: 24 }}>
                      <XAxis type="number" hide allowDecimals={false} />
                      <YAxis type="category" dataKey="source" width={120} axisLine={false} tickLine={false} tick={{ ...AXIS, fill: C.ink }} />
                      <Tooltip cursor={{ fill: C.canvas }} content={({ active, payload }) => active && payload?.length ? <TipBox><b>{payload[0].value}</b> new lead(s)</TipBox> : null} />
                      <Bar dataKey="n" radius={[0, 8, 8, 0]} barSize={16} label={{ position: 'right', fontSize: 11, fill: C.muted }}>
                        {sources.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Opportunities by stage" action={<Link to="/pipeline" className="link-muted">Board</Link>} />
              <Legend items={[{ color: C.sun, label: 'Count' }]} />
              {f.opps.filter((o) => isOpen(o.stage)).length === 0 ? <div className="mt-4"><ChartEmpty text="No open opportunities." /></div> : (
                <div className="mt-3 h-[250px]">
                  <ResponsiveContainer>
                    <BarChart data={byStage} margin={{ left: -24, right: 4, top: 10 }}>
                      <CartesianGrid vertical={false} stroke={C.line} strokeDasharray="3 3" />
                      <XAxis dataKey="short" axisLine={false} tickLine={false} tick={{ ...AXIS, fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={46} />
                      <YAxis axisLine={false} tickLine={false} tick={AXIS} allowDecimals={false} />
                      <Tooltip cursor={false} content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const p = payload[0].payload as (typeof byStage)[number]
                        return <TipBox><p className="font-semibold">{p.stage}</p><p>{p.n} opportunit{p.n === 1 ? 'y' : 'ies'}</p><p>Value {money(p.value)}</p><p>Weighted {money(p.weighted)}</p></TipBox>
                      }} />
                      <Bar dataKey="n" fill={C.sun} radius={[10, 10, 10, 10]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.32fr)]">
            <Card>
              <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-2">
                <h2 className="card-title">Deal creation & closure</h2>
                <Legend items={[{ color: C.lavender, label: 'Opportunity value created' }, { color: C.sky, label: 'Closed-won value' }]} />
                <span className="ml-auto"><MoreButton items={go('/opportunities?view=all')} /></span>
              </div>
              {trend.every((t) => !t.created && !t.won) ? <ChartEmpty text="No opportunities were created or won in these months." /> : (
                <div className="h-[250px]">
                  <ResponsiveContainer>
                    <LineChart data={trend} margin={{ left: 8, right: 8, top: 10 }}>
                      <CartesianGrid vertical={false} stroke={C.line} strokeDasharray="3 3" />
                      <XAxis dataKey="m" axisLine={false} tickLine={false} tick={AXIS} dy={8} />
                      <YAxis axisLine={false} tickLine={false} tick={AXIS} tickFormatter={(v) => money(Number(v), true)} width={70} />
                      <Tooltip cursor={{ stroke: C.lavenderLight, strokeWidth: 40 }} content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const p = payload[0].payload as (typeof trend)[number]
                        return <TipBox><p className="mb-1 border-b border-line pb-1 text-muted">{label}</p><p>Created: <b>{money(p.created)}</b> ({p.nCreated})</p><p>Won: <b>{money(p.won)}</b> ({p.nWon})</p></TipBox>
                      }} />
                      <Line type="monotone" dataKey="created" stroke={C.lavender} strokeWidth={4} dot={false} activeDot={{ r: 6, fill: C.lavender, stroke: '#fff', strokeWidth: 2 }} />
                      <Line type="monotone" dataKey="won" stroke={C.sky} strokeWidth={4} dot={false} activeDot={{ r: 6, fill: C.sky, stroke: '#fff', strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-1">
              <Card className="flex flex-col justify-center">
                <Chart size={32} color={C.sky} variant="Bold" />
                <p className="mt-3 truncate text-[20px] font-semibold">{money(m.period.avgDealSize)}</p>
                <p className="text-[13px] text-muted">Avg. won deal size</p>
                <p className="mt-1 text-[11px] text-faint">{m.period.wonCount} won · {periodLabel}</p>
              </Card>
              <Card className="flex flex-col justify-center">
                <Timer1 size={32} color={C.sun} variant="Bold" />
                <p className="mt-3 text-[20px] font-semibold">{m.period.avgCycleDays === null ? '—' : `${m.period.avgCycleDays} days`}</p>
                <p className="text-[13px] text-muted">Avg. sales cycle</p>
                <p className="mt-1 text-[11px] text-faint">created → closed won</p>
              </Card>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <WeekStrip selected={day} onSelect={setDay} marked={marked} />
            <CardHeader className="mb-4 mt-7" title="Agenda" action={<MoreButton items={go('/calendar')} />} />
            <AgendaList events={events.slice(0, 3)} />
          </Card>
          <Card>
            <CardHeader title="Follow-ups due" action={<Link to="/follow-ups" className="link-muted">View All</Link>} />
            {due.length === 0 ? <p className="text-[12px] text-muted">Nothing overdue or due today.</p> : (
              <ul className="space-y-3">
                {due.map((t) => {
                  const o = t.opportunityId ? db.opportunities.find((x) => x.id === t.opportunityId) : undefined
                  const l = !o && t.leadId ? db.leads.find((x) => x.id === t.leadId) : undefined
                  return (
                    <li key={t.id}>
                      <Link to={o ? linkFor(o) : l ? `/leads/${l.id}` : '/follow-ups'} className="-mx-2 block rounded-lg p-2 hover:bg-canvas">
                        <p className="text-[13px] font-medium">{t.title}</p>
                        <p className="text-[11px] text-muted"><DueLabel date={t.dueDate} /> · {t.priority} · {userById.get(t.ownerId ?? '')?.name ?? 'Unassigned'}</p>
                        {(o || l) && <p className="truncate text-[11px] text-faint">{o?.name ?? l?.title} · {companyById.get((o ?? l)!.companyId)?.name}</p>}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
          <MessagesCard limit={3} small />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Pipeline by service" action={<span className="text-[11px] text-faint">primary service</span>} />
          {byService.length === 0 ? <ChartEmpty text="No open pipeline." /> : (
            <ul className="space-y-3">
              {byService.map((s, i) => (
                <li key={s.service}>
                  <div className="flex justify-between gap-2 text-[12px]"><span className="truncate">{s.service}</span><span className="whitespace-nowrap font-medium">{money(s.value, true)}</span></div>
                  <div className="mt-1 h-2 rounded bg-canvas"><div className="h-full rounded" style={{ width: `${(s.value / byService[0].value) * 100}%`, background: PALETTE[i % PALETTE.length] }} /></div>
                  <p className="mt-0.5 text-[11px] text-faint">weighted {money(s.weighted, true)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Sales performance by owner" action={<Link to="/team" className="link-muted">Team</Link>} />
          {perf.length === 0 ? <ChartEmpty text="No owner activity for these filters." /> : (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead><tr className="bg-sky-light">{['Owner', 'Open', 'Pipeline', 'Weighted', 'Won', 'Win rate', 'Overdue'].map((h, i, arr) => <th key={h} className={`th py-3 ${i === 0 ? 'rounded-l-lg pl-4' : ''} ${i === arr.length - 1 ? 'rounded-r-lg' : ''}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {perf.map((r) => (
                    <tr key={r.u.id} className="border-b border-line last:border-0">
                      <td className="td py-3 pl-4"><div className="flex items-center gap-2"><Avatar src={r.u.avatar} name={r.u.name} size={28} /><span className="truncate">{r.u.name}</span></div></td>
                      <td className="td py-3">{r.deals}</td><td className="td py-3">{money(r.open, true)}</td><td className="td py-3">{money(r.weighted, true)}</td>
                      <td className="td py-3">{money(r.won, true)}</td><td className="td py-3">{pctLabel(r.winRate)}</td><td className={`td py-3 ${r.overdue ? 'font-medium text-danger' : ''}`}>{r.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Lost opportunities" action={<span className="text-[11px] text-faint">{periodLabel}</span>} />
          {lost.length === 0 ? <ChartEmpty text="No opportunities lost in this period." /> : (
            <ul className="space-y-3">
              {lost.sort((a, b) => b.n - a.n).map((x) => (
                <li key={x.reason}>
                  <div className="flex justify-between text-[12px]"><span>{x.reason}</span><span className="font-medium">{x.n}</span></div>
                  <div className="mt-1 h-2 rounded bg-canvas"><div className="h-full rounded bg-danger/60" style={{ width: `${(x.n / Math.max(...lost.map((y) => y.n))) * 100}%` }} /></div>
                  <p className="mt-0.5 text-[11px] text-faint">{money(x.value)} estimated value</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Conversion funnel" action={<span className="text-[11px] text-faint">opportunities reaching each stage</span>} />
          {f.opps.length === 0 ? <ChartEmpty text="No opportunities yet." /> : (
            <div className="space-y-2">
              {funnel.map((c) => (
                <div key={c.stage} className="flex items-center gap-3 text-[12px]">
                  <span className="w-40 shrink-0 truncate text-muted">{c.stage}</span>
                  <div className="h-6 flex-1 rounded bg-canvas">
                    <div className="flex h-full items-center rounded bg-lavender px-2 text-[11px] font-medium" style={{ width: `${funnel[0].reached ? Math.max(4, (c.reached / funnel[0].reached) * 100) : 0}%` }}>{c.reached}</div>
                  </div>
                  <span className="w-16 text-right text-[11px] text-muted">{c.toNext === null ? '' : `${Math.round(c.toNext * 100)}% →`}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <RecentActivity limit={5} />
      </div>
    </div>
  )
}
