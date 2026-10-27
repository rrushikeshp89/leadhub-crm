import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Call, Sms } from 'iconsax-react'
import { OPEN_STAGES } from '../../shared/model'
import { isDueToday, isOverdue, leadConversion, pipelineSummary, todayIso, weightedValue } from '../../shared/calc'
import { useLookups, useStore } from '../store/Store'
import { Card, CardHeader, Dropdown, Pagination, Pill, usePaged } from '../components/ui'
import { AgendaList, ChartEmpty, Donut, Legend, MessagesCard, MonthCalendar, RecentActivity, TipBox, WhiteStat } from '../components/widgets'
import { DueLabel, TaskList } from '../components/crm'
import { useMoney } from '../lib/hooks'
import { MONTHS_SHORT } from '../lib/format'
import { C } from '../lib/theme'

const AXIS = { fontSize: 12, fill: C.faint }

function BannerArt() {
  return (
    <svg viewBox="0 0 320 170" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="bA" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={C.white} /><stop offset="1" stopColor="#DDF4FD" /></linearGradient>
        <linearGradient id="bB" x1="0" x2="1"><stop offset="0" stopColor="#7FD8F5" /><stop offset="1" stopColor="#2AA8D8" /></linearGradient>
      </defs>
      <rect x="92" y="18" width="120" height="150" rx="18" fill="url(#bB)" />
      <rect x="102" y="30" width="100" height="126" rx="12" fill="url(#bA)" />
      <rect x="116" y="110" width="14" height="32" rx="4" fill={C.lavender} />
      <rect x="138" y="90" width="14" height="52" rx="4" fill={C.sun} />
      <rect x="160" y="70" width="14" height="72" rx="4" fill={C.skyAccent} />
      <rect x="182" y="52" width="10" height="90" rx="4" fill={C.pink} />
      <path d="M116 80 L145 64 L165 72 L190 44" stroke={C.ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="262" cy="70" r="40" fill={C.white} opacity=".9" />
      <circle cx="262" cy="70" r="28" fill={C.pink} opacity=".85" />
      <circle cx="262" cy="70" r="16" fill={C.white} />
      <circle cx="262" cy="70" r="7" fill={C.pink} />
      <path d="M262 70 L300 30" stroke={C.ink} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export default function RepDashboard() {
  const { db, me } = useStore()
  const { companyById, contactById } = useLookups()
  const money = useMoney()
  const [day, setDay] = useState(todayIso())
  const [months, setMonths] = useState<'Last 6 months' | 'Last 12 months'>('Last 6 months')
  const today = todayIso()

  const mine = useMemo(() => ({
    leads: db.leads.filter((l) => l.ownerId === me.id),
    opps: db.opportunities.filter((o) => o.ownerId === me.id),
    tasks: db.tasks.filter((t) => t.ownerId === me.id),
    events: db.events.filter((e) => e.ownerId === me.id),
    acts: db.activities.filter((a) => a.userId === me.id && ['call', 'email', 'meeting'].includes(a.type)),
  }), [db, me.id])
  const s = pipelineSummary(mine.opps)
  const thisMonth = today.slice(0, 7)
  const wonMonth = mine.opps.filter((o) => o.stage === 'Closed Won' && o.closedAt?.slice(0, 7) === thisMonth).reduce((a, o) => a + o.value, 0)
  const overdue = mine.tasks.filter((t) => isOverdue(t)).length
  const dueToday = mine.tasks.filter((t) => isDueToday(t)).length
  const activeLeads = mine.leads.filter((l) => l.status !== 'Disqualified')
  const conv = leadConversion(mine.leads, mine.opps)

  const byStage = OPEN_STAGES.map((st) => {
    const xs = mine.opps.filter((o) => o.stage === st)
    return { stage: st.replace('Discovery ', 'Disc. ').replace('Qualified Opportunity', 'Qualified').replace('Solution Design', 'Solution').replace('Proposal Sent', 'Proposal'), full: st, value: xs.reduce((a, o) => a + o.value, 0), weighted: xs.reduce((a, o) => a + weightedValue(o), 0), n: xs.length }
  })
  const activity = useMemo(() => {
    const n = months === 'Last 6 months' ? 6 : 12
    const now = new Date()
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return { m: MONTHS_SHORT[d.getMonth()], v: mine.acts.filter((a) => a.occurredAt.slice(0, 7) === key).length }
    })
  }, [mine.acts, months])
  const followUps = useMemo(() => activeLeads.filter((l) => l.nextFollowUp).sort((a, b) => a.nextFollowUp!.localeCompare(b.nextFollowUp!)), [activeLeads])
  const { page, pages, setPage, slice } = usePaged(followUps, 5)
  const dayEvents = mine.events.filter((e) => e.date === day).sort((a, b) => a.start.localeCompare(b.start))
  const marked = new Set(mine.events.map((e) => e.date))

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.12fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
        <div className="banner-hero relative flex min-h-[170px] overflow-hidden rounded-card px-7 py-6 text-white">
          <div className="relative z-10 max-w-[62%]">
            <p className="text-[13px] font-medium opacity-90">Good day, {me.name.split(' ')[0]}</p>
            <p className="mt-1 text-[22px] font-semibold leading-snug">
              {overdue || dueToday ? <>You have {dueToday} follow-up{dueToday === 1 ? '' : 's'} due today{overdue ? ` and ${overdue} overdue` : ''}.</> : 'You’re all caught up on follow-ups.'}
            </p>
            <p className="mt-1 text-[13px] opacity-90">Your weighted pipeline is {money(s.weightedValue)} across {s.openCount} open opportunit{s.openCount === 1 ? 'y' : 'ies'}.</p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-medium tracking-wide">
              <span className="flex items-center gap-2"><Sms size={14} color={C.white} variant="Bold" />{me.email}</span>
              {me.phone && <span className="flex items-center gap-2"><Call size={14} color={C.white} variant="Bold" />{me.phone}</span>}
            </div>
          </div>
          <div className="absolute bottom-0 right-2 top-2 hidden w-[40%] sm:block"><BannerArt /></div>
        </div>

        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <WhiteStat label="My active leads" value={String(activeLeads.length)} to="/leads?view=mine" />
          <WhiteStat label="My open pipeline" value={money(s.openValue)} sub={`${s.openCount} opportunities`} to="/opportunities?view=mine" />
          <WhiteStat label="My weighted pipeline" value={money(s.weightedValue)} sub="value × probability" />
          <WhiteStat label="Won this month" value={money(wonMonth)} sub="confirmed revenue" />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)]">
          <Card className="flex flex-col">
            <CardHeader title="Lead conversion" />
            {mine.leads.length === 0 ? <ChartEmpty text="You don’t own any leads yet." /> : <>
              <div className="flex flex-1 items-center"><Donut value={conv ?? 0} label={`${Math.round((conv ?? 0) * 100)}%`} /></div>
              <div className="mt-4 flex justify-center"><Legend items={[{ color: C.lavender, label: 'Became an opportunity' }, { color: C.sun, label: 'Not yet' }]} /></div>
              <p className="mt-2 text-center text-[11px] text-faint">{mine.leads.length} leads owned</p>
            </>}
          </Card>
          <Card>
            <CardHeader title="My pipeline by stage" />
            {s.openCount === 0 ? <ChartEmpty text="No open opportunities assigned to you." /> : (
              <div className="h-[260px]">
                <ResponsiveContainer>
                  <BarChart data={byStage} barGap={4} margin={{ left: 4, top: 10 }}>
                    <CartesianGrid vertical={false} stroke={C.line} strokeDasharray="3 3" />
                    <XAxis dataKey="stage" axisLine={false} tickLine={false} tick={{ ...AXIS, fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={46} />
                    <YAxis axisLine={false} tickLine={false} tick={AXIS} tickFormatter={(v) => money(Number(v), true)} width={64} />
                    <Tooltip cursor={false} content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const p = payload[0].payload as (typeof byStage)[number]
                      return <TipBox><p className="font-semibold">{p.full}</p><p>{p.n} open · {money(p.value)}</p><p>Weighted {money(p.weighted)}</p></TipBox>
                    }} />
                    <Bar dataKey="value" fill={C.sky} radius={[3, 3, 0, 0]} barSize={12} />
                    <Bar dataKey="weighted" fill={C.lavender} radius={[3, 3, 0, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-2 flex justify-center"><Legend items={[{ color: C.sky, label: 'Estimated value' }, { color: C.lavender, label: 'Weighted value' }]} /></div>
          </Card>
        </div>
      </div>

      <Card>
        <MonthCalendar selected={day} onSelect={setDay} marked={marked} />
        <CardHeader className="mb-4 mt-7" title="My agenda" action={<Link to="/calendar" className="link-muted">Calendar</Link>} />
        <AgendaList variant="topline" events={dayEvents} />
      </Card>

      <TaskList title="My tasks" tasks={mine.tasks} defaults={{ ownerId: me.id }} showRelated />

      <Card className="xl:col-span-2">
        <div className="mb-3 flex items-center justify-between"><h2 className="card-title">My sales activity</h2><Dropdown label="Period" value={months} options={['Last 6 months', 'Last 12 months'] as const} onChange={setMonths} /></div>
        {activity.every((a) => !a.v) ? <ChartEmpty text="No calls, emails or meetings logged by you in this period." /> : (
          <div className="h-[260px]">
            <ResponsiveContainer>
              <AreaChart data={activity} margin={{ left: -14, right: 8, top: 10 }}>
                <defs><linearGradient id="act" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.sun} stopOpacity={0.4} /><stop offset="100%" stopColor={C.sun} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke={C.line} strokeDasharray="3 3" />
                <XAxis dataKey="m" axisLine={false} tickLine={false} tick={AXIS} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={AXIS} allowDecimals={false} />
                <Tooltip cursor={{ stroke: C.sky, strokeWidth: 3 }} content={({ active, payload, label }) => active && payload?.length ? <TipBox><p className="text-muted">{label}</p><p>Calls, emails & meetings: <b>{payload[0].value}</b></p></TipBox> : null} />
                <Area type="monotone" dataKey="v" stroke={C.sun} strokeWidth={3} fill="url(#act)" activeDot={{ r: 7, fill: C.sun, stroke: '#fff', strokeWidth: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader title="My lead follow-ups" action={<Link to="/leads?view=mine" className="link-muted">All my leads</Link>} />
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr className="bg-sky-light">{['Lead', 'Company', 'Status', 'Next follow-up', 'Contact'].map((h, i, a) => <th key={h} className={`th ${i === 0 ? 'rounded-l-lg pl-4' : ''} ${i === a.length - 1 ? 'rounded-r-lg' : ''}`}>{h}</th>)}</tr></thead>
            <tbody>
              {slice.map((l) => (
                <tr key={l.id} className="border-b border-line">
                  <td className="td max-w-[240px] pl-4"><Link to={`/leads/${l.id}`} className="block truncate hover:text-sky-accent">{l.title}</Link></td>
                  <td className="td">{companyById.get(l.companyId)?.name}</td>
                  <td className="td"><Pill>{l.status}</Pill></td>
                  <td className="td text-[12px]"><DueLabel date={l.nextFollowUp} /></td>
                  <td className="td text-[12px]">{contactById.get(l.contactId)?.name}<span className="block text-[11px] text-muted">{l.preferredContact ?? contactById.get(l.contactId)?.preferredContact ?? ''}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {slice.length === 0 && <p className="py-6 text-center text-[12px] text-muted">No follow-up dates set on your leads.</p>}
        </div>
        <Pagination page={page} pages={pages} onPage={setPage} />
      </Card>

      <div className="flex flex-col gap-6">
        <MessagesCard limit={3} small />
        <RecentActivity limit={4} ownerId={me.id} />
      </div>
    </div>
  )
}
