import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft2, ArrowRight2, InfoCircle } from 'iconsax-react'
import { useLookups, useStore } from '../store/Store'
import type { CalEvent } from '../../shared/model'
import { Avatar, Card, CardHeader, MoreButton, Trend } from './ui'
import { addDays, cx, DAYS_SHORT, isoDate, MONTHS, parseDate, time12, timeAgo } from '../lib/format'
import { C } from '../lib/theme'

/* ---------- Colored stat card (purple / yellow) ---------- */
export function StatCard({ value, label, trend, tone, menu, hint, full }: {
  value: string; label: string; trend?: number | null; tone: 'lavender' | 'sun' | 'sky'; menu?: { label: string; onClick: () => void }[]; hint?: string; full?: string
}) {
  const bg = { lavender: 'bg-lavender', sun: 'bg-sun', sky: 'bg-sky' }[tone]
  return (
    <div className={cx('rounded-card p-5', bg)} title={hint}>
      <div className="flex min-h-[22px] items-center justify-between">
        {trend !== null && trend !== undefined ? <Trend value={trend} /> : <span />}
        <MoreButton light items={menu} />
      </div>
      <p className="mt-5 truncate text-[28px] font-semibold leading-none tracking-tight" title={full ?? value}>{value}</p>
      <p className="mt-3 truncate text-[15px]">{label}{hint && <span className="sr-only">. {hint}</span>}</p>
    </div>
  )
}

/* ---------- White stat card ---------- */
export function WhiteStat({ label, value, trend, sub, to, tone }: { label: string; value: string; trend?: number | null; sub?: ReactNode; to?: string; tone?: 'danger' }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-muted">{label}</span>
        {trend !== null && trend !== undefined && <Trend value={trend} className="bg-transparent px-0" />}
      </div>
      <p className={cx('mt-2 text-[22px] font-semibold leading-none tracking-tight', tone === 'danger' && 'text-danger')}>{value}</p>
      {sub && <p className="mt-1.5 text-[11px] text-faint">{sub}</p>}
    </>
  )
  return to ? <Link to={to} className="card block p-5 transition-shadow hover:shadow-pop">{body}</Link> : <div className="card p-5">{body}</div>
}

/* ---------- Week strip calendar ---------- */
export function WeekStrip({ selected, onSelect, marked }: { selected: string; onSelect: (d: string) => void; marked?: Set<string> }) {
  const [anchor, setAnchor] = useState(() => parseDate(selected))
  const start = addDays(anchor, -anchor.getDay())
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const mid = days[3]
  return (
    <div>
      <div className="flex items-center justify-between">
        <NavArrow dir="left" onClick={() => setAnchor(addDays(anchor, -7))} />
        <h3 className="text-[20px] font-medium">{MONTHS[mid.getMonth()]} {mid.getFullYear()}</h3>
        <NavArrow dir="right" onClick={() => setAnchor(addDays(anchor, 7))} />
      </div>
      <div className="mt-6 grid grid-cols-7 gap-1 text-center">
        {days.map((d) => {
          const iso = isoDate(d)
          const active = iso === selected
          return (
            <button key={iso} onClick={() => onSelect(iso)} className={cx('relative rounded-lg py-2.5 transition-colors', active ? 'bg-sky-light' : 'hover:bg-canvas')}>
              <span className="block text-[13px] text-faint">{DAYS_SHORT[d.getDay()]}</span>
              <span className="mt-2 block text-[20px] font-medium">{d.getDate()}</span>
              {marked?.has(iso) && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-accent" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function NavArrow({ dir, onClick, filled }: { dir: 'left' | 'right'; onClick: () => void; filled?: boolean }) {
  const Icon = dir === 'left' ? ArrowLeft2 : ArrowRight2
  return (
    <button aria-label={dir === 'left' ? 'Previous' : 'Next'} onClick={onClick}
      className={cx('flex h-6 w-6 items-center justify-center rounded-md transition-colors', filled ? 'bg-lavender text-white hover:bg-lavender-hover' : 'border border-muted text-muted hover:bg-canvas')}>
      <Icon size={12} color="currentColor" />
    </button>
  )
}

/* ---------- Month calendar ---------- */
export function MonthCalendar({ selected, onSelect, compact, marked }: { selected: string; onSelect: (d: string) => void; compact?: boolean; marked?: Set<string> }) {
  const [view, setView] = useState(() => { const d = parseDate(selected); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const start = addDays(view, -view.getDay())
  const cells = Array.from({ length: 35 }, (_, i) => addDays(start, i))
  const today = isoDate(new Date())
  return (
    <div>
      <div className="flex items-center justify-between">
        <NavArrow dir="left" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} />
        <h3 className={cx('font-medium', compact ? 'text-[15px]' : 'text-[20px]')}>{MONTHS[view.getMonth()]} {view.getFullYear()}</h3>
        <NavArrow dir="right" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} />
      </div>
      <div className={cx('grid grid-cols-7 text-center', compact ? 'mt-4 gap-y-1' : 'mt-6 gap-y-2')}>
        {DAYS_SHORT.map((d) => <span key={d} className={cx('text-faint', compact ? 'text-[11px]' : 'text-[13px]')}>{d}</span>)}
        {cells.map((d) => {
          const iso = isoDate(d)
          const other = d.getMonth() !== view.getMonth()
          return (
            <button key={iso} onClick={() => onSelect(iso)}
              className={cx('relative mx-auto flex items-center justify-center rounded-md transition-colors',
                compact ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-[15px]',
                iso === selected ? 'bg-sky' : iso === today ? 'bg-sky-light' : 'hover:bg-canvas',
                other ? 'text-faint' : 'text-ink')}>
              {String(d.getDate()).padStart(2, '0')}
              {marked?.has(iso) && <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-accent" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Agenda ---------- */
const AGENDA_TONES = ['bg-lavender-light', 'bg-sun-light', 'bg-sky-light']
const AGENDA_BORDER = ['border-sky', 'border-lavender', 'border-sun']
export function AgendaList({ events, variant = 'block', empty }: { events: CalEvent[]; variant?: 'block' | 'topline' | 'timeline'; empty?: string }) {
  const { companyById } = useLookups()
  const sub = (e: CalEvent) => [e.kind, e.companyId ? companyById.get(e.companyId)?.name : null].filter(Boolean).join(' · ')
  const href = (e: CalEvent) => (e.opportunityId ? `/opportunities/${e.opportunityId}` : e.leadId ? `/leads/${e.leadId}` : '/calendar')
  if (!events.length) return <p className="py-6 text-center text-[13px] text-muted">{empty ?? 'No meetings scheduled for this day.'}</p>
  if (variant === 'topline') {
    return (
      <div className="flex flex-col gap-3">
        {events.map((e, i) => (
          <Link to={href(e)} key={e.id} className={cx('block rounded-lg border border-line border-t-[3px] p-3.5 transition-colors hover:bg-canvas', AGENDA_BORDER[i % 3])}>
            <div className="flex justify-between gap-2 text-[12px] text-muted"><span className="truncate">{sub(e)}</span><span className="whitespace-nowrap">{time12(e.start, true)} - {time12(e.end, true)}</span></div>
            <p className="mt-2 text-[14px]">{e.title}</p>
          </Link>
        ))}
      </div>
    )
  }
  if (variant === 'timeline') {
    return (
      <div className="flex flex-col gap-4">
        {events.map((e, i) => {
          const d = parseDate(e.date)
          return (
            <Link to={href(e)} key={e.id} className={cx('block border-l-2 pl-3 hover:text-sky-accent', ['border-lavender', 'border-sun', 'border-sky'][i % 3])}>
              <p className="text-[11px] text-faint">{DAYS_SHORT[d.getDay()]} - {MONTHS[d.getMonth()]} {d.getDate()}, {d.getFullYear()} · {time12(e.start)}</p>
              <p className="mt-1 text-[12px]">{e.title}</p>
              <span className="mt-1 inline-block rounded bg-canvas px-1.5 py-0.5 text-[11px] text-muted">{e.kind}</span>
            </Link>
          )
        })}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {events.map((e, i) => (
        <Link to={href(e)} key={e.id} className={cx('flex items-center gap-4 rounded-lg px-4 py-4 transition-opacity hover:opacity-80', AGENDA_TONES[i % 3])}>
          <span className="w-[72px] shrink-0 text-[14px] font-medium">{time12(e.start)}</span>
          <span className="h-11 w-[3px] shrink-0 rounded bg-white" />
          <span className="min-w-0">
            <span className="block truncate text-[12px] text-ink/80">{sub(e)}</span>
            <span className="mt-0.5 block truncate text-[15px] font-medium">{e.title}</span>
          </span>
        </Link>
      ))}
    </div>
  )
}

export function useDayEvents(date: string, filter?: (e: CalEvent) => boolean) {
  const { db } = useStore()
  return useMemo(() => db.events.filter((e) => e.date === date && (!filter || filter(e))).sort((a, b) => a.start.localeCompare(b.start)), [db.events, date, filter])
}

/* ---------- Messages list card ---------- */
export function MessagesCard({ limit = 5, small }: { limit?: number; small?: boolean }) {
  const { db } = useStore()
  const { userById } = useLookups()
  const convs = useMemo(() => db.conversations.map((c) => ({ c, last: db.messages.filter((m) => m.conversationId === c.id).at(-1) }))
    .sort((a, b) => (b.last?.createdAt ?? b.c.createdAt).localeCompare(a.last?.createdAt ?? a.c.createdAt)).slice(0, limit), [db.conversations, db.messages, limit])
  return (
    <Card>
      <CardHeader title="Messages" action={<Link to="/messages" className="link-muted">View All</Link>} />
      {convs.length === 0 && <p className="text-[12px] text-muted">No conversations yet.</p>}
      <div className={cx('flex flex-col', small ? 'gap-4' : 'gap-5')}>
        {convs.map(({ c, last }) => {
          const author = last?.userId ? userById.get(last.userId) : undefined
          return (
            <Link key={c.id} to={`/messages?c=${c.id}`} className="-mx-2 flex gap-3 rounded-lg p-2 transition-colors hover:bg-canvas">
              <Avatar src={author?.avatar} name={c.name} size={small ? 36 : 48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cx('truncate font-medium', small ? 'text-[13px]' : 'text-[15px]')}>{c.name}</span>
                  <span className="whitespace-nowrap text-[11px] text-muted">{last ? timeAgo(last.createdAt) : ''}</span>
                </div>
                <p className={cx('line-clamp-2 text-muted', small ? 'text-[11px]' : 'text-[13px]')}>{last ? `${last.author.split(' ')[0]}: ${last.body}` : 'No messages yet'}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}

/* ---------- Recent activity feed ---------- */
export function RecentActivity({ limit = 5, className, ownerId }: { limit?: number; className?: string; ownerId?: string }) {
  const { db } = useStore()
  const { userById, leadById, oppById } = useLookups()
  const items = useMemo(() => [...db.activities].filter((a) => !ownerId || a.userId === ownerId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit), [db.activities, limit, ownerId])
  const todayIso = isoDate(new Date())
  const groups: { label: string; items: typeof items }[] = []
  items.forEach((a) => {
    const label = isoDate(new Date(a.occurredAt)) === todayIso ? 'Today' : 'Earlier'
    const g = groups.find((x) => x.label === label)
    if (g) g.items.push(a)
    else groups.push({ label, items: [a] })
  })
  return (
    <Card className={className}>
      <CardHeader title="Recent Activity" action={<Link to="/tasks" className="link-muted">View All</Link>} />
      {!items.length && <p className="text-[12px] text-muted">No activity yet.</p>}
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-3 text-[14px] font-medium">{g.label}</p>
          <ol className="relative mb-3 flex flex-col gap-5">
            {g.items.map((a, i) => {
              const u = a.userId ? userById.get(a.userId) : undefined
              const to = a.opportunityId && oppById.has(a.opportunityId) ? `/opportunities/${a.opportunityId}` : a.leadId && leadById.has(a.leadId) ? `/leads/${a.leadId}` : undefined
              return (
                <li key={a.id} className="relative flex gap-3">
                  {i < g.items.length - 1 && <span className="absolute left-[12px] top-8 h-[calc(100%-8px)] border-l border-dashed border-faint/60" />}
                  <Avatar src={u?.avatar} name={u?.name ?? 'System'} size={26} />
                  <div className="min-w-0">
                    <p className="text-[12px] leading-snug text-muted">
                      <span className="font-medium text-ink">{u?.name ?? 'Automatic'}</span> · {to ? <Link to={to} className="text-ink hover:text-sky-accent">{a.title}</Link> : a.title}
                    </p>
                    <p className="mt-1 text-[11px] text-faint">{timeAgo(a.occurredAt)}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </Card>
  )
}

/* ---------- Concentric rings ---------- */
export function Rings({ a, b, center }: { a: number; b: number; center?: ReactNode }) {
  const ring = (r: number, frac: number, color: string, w: number, rot: number) => {
    const c = 2 * Math.PI * r
    return (
      <>
        <circle cx="120" cy="120" r={r} fill="none" stroke={C.canvas} strokeWidth={w} />
        {frac > 0 && <circle cx="120" cy="120" r={r} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} transform={`rotate(${rot} 120 120)`} />}
      </>
    )
  }
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[230px]">
      <svg viewBox="0 0 240 240" className="h-full w-full">
        {ring(106, a, C.sky, 22, 90)}
        {ring(74, b, C.sun, 22, -90)}
        <circle cx="120" cy="120" r="52" fill={C.white} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{center}</div>
    </div>
  )
}

/* ---------- Simple donut ---------- */
export function Donut({ value, label }: { value: number; label: string }) {
  const r = 70, c = 2 * Math.PI * r
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[200px]">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle cx="100" cy="100" r={r} fill="none" stroke={C.sun} strokeWidth="44" />
        <circle cx="100" cy="100" r={r} fill="none" stroke={C.lavender} strokeWidth="44" strokeDasharray={`${c * value} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center"><span className="text-[28px] font-semibold">{label}</span></div>
    </div>
  )
}

/* ---------- Semicircle gauge ---------- */
export function Gauge({ value, max, caption }: { value: number; max: number; caption: string }) {
  const frac = Math.min(1, value / max)
  const r = 80, c = Math.PI * r
  return (
    <div className="relative mx-auto w-full max-w-[220px]">
      <svg viewBox="0 0 200 110" className="w-full" aria-hidden>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={C.sun} strokeWidth="36" />
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={C.lavender} strokeWidth="36" strokeDasharray={`${c * frac} ${c}`} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="text-[28px] font-semibold leading-none">{value}</p>
        <p className="mt-1 text-[11px] text-muted">{caption}</p>
      </div>
    </div>
  )
}

export function TipBox({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-white px-3 py-2 text-[11px] shadow-pop">{children}</div>
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-5">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2 text-[12px]"><span className="h-3 w-3 rounded-full" style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  )
}

/** Empty state for charts — says why there is nothing to plot */
export function ChartEmpty({ text }: { text: string }) {
  return <div className="flex h-full min-h-[160px] items-center justify-center rounded-lg bg-canvas px-6 text-center text-[12px] text-muted">{text}</div>
}

/** Template student-dashboard stat: tinted icon tile + value + label */
const ICON_TILE = {
  sky: ['bg-sky-light', C.skyAccent], lavender: ['bg-lavender-light', C.lavenderInk], sun: ['bg-sun-light', C.sunIcon], pink: ['bg-pink-light', C.pink],
} as const
export function IconStat({ icon: Icon, tone, value, label }: { icon: typeof InfoCircle; tone: keyof typeof ICON_TILE; value: ReactNode; label: string }) {
  const [bg, color] = ICON_TILE[tone]
  return (
    <div className="card flex items-start gap-3 p-5">
      <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', bg)}><Icon size={18} color={color} variant="Bold" /></span>
      <div className="min-w-0"><p className="truncate text-[20px] font-medium leading-tight">{value}</p><p className="label mt-1">{label}</p></div>
    </div>
  )
}
