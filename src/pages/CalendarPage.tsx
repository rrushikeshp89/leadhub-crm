import { useMemo, useState } from 'react'
import { Add, People } from 'iconsax-react'
import { useLookups, useStore } from '../store/Store'
import type { CalEvent } from '../../shared/model'
import { Card, CardHeader, Dropdown, MoreButton } from '../components/ui'
import { NavArrow } from '../components/widgets'
import { EventForm } from '../components/forms'
import { addDays, cx, DAYS_SHORT, isoDate, MONTHS, parseDate, time12 } from '../lib/format'
import { C } from '../lib/theme'

type View = 'Month' | 'Week' | 'Day'
const KIND_TONE: Record<CalEvent['kind'], { chip: string; bar: string; card: string }> = {
  'Discovery Meeting': { chip: 'bg-lavender-light', bar: 'bg-lavender', card: 'bg-lavender-light' },
  'Technical Discussion': { chip: 'bg-sky-light', bar: 'bg-sky-accent', card: 'bg-sky-light' },
  Demo: { chip: 'bg-sky-light', bar: 'bg-sky-accent', card: 'bg-sky-light' },
  Call: { chip: 'bg-sun-light', bar: 'bg-sun', card: 'bg-sun-light' },
  'Proposal Review': { chip: 'bg-warn-light', bar: 'bg-warn', card: 'bg-warn-light' },
  'Contract Discussion': { chip: 'bg-pink-light', bar: 'bg-pink', card: 'bg-pink-light' },
  Internal: { chip: 'bg-canvas', bar: 'bg-faint', card: 'bg-canvas' },
}

function Chip({ e, onClick }: { e: CalEvent; onClick: () => void }) {
  const t = KIND_TONE[e.kind]
  return (
    <button onClick={(ev) => { ev.stopPropagation(); onClick() }} title={`${e.title} · ${time12(e.start)}`}
      className={cx('flex w-full items-center gap-1.5 overflow-hidden rounded-sm py-1 pr-1 text-left text-[11px]', t.chip)}>
      <span className={cx('h-4 w-[3px] shrink-0 rounded', t.bar)} />
      <span className="truncate">{e.title}</span>
    </button>
  )
}

export default function CalendarPage() {
  const { db, me } = useStore()
  const { companyById } = useLookups()
  const [who, setWho] = useState('Everyone')
  const [view, setView] = useState<View>('Month')
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState(isoDate(new Date()))
  const [form, setForm] = useState<{ open: boolean; event?: CalEvent; date?: string }>({ open: false })

  const events = useMemo(() => db.events.filter((e) => who === 'Everyone' || (who === 'Mine' ? e.ownerId === me.id : db.users.find((u) => u.id === e.ownerId)?.name === who)), [db.events, db.users, who, me.id])
  const byDate = useMemo(() => {
    const m = new Map<string, CalEvent[]>()
    events.forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e].sort((a, b) => a.start.localeCompare(b.start))))
    return m
  }, [events])

  const todayIso = isoDate(new Date())
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = addDays(first, -first.getDay())
  const weeks = Math.ceil((first.getDay() + new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()) / 7)
  const weekStart = addDays(cursor, -cursor.getDay())

  const shift = (dir: number) => {
    if (view === 'Month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1))
    else setCursor(addDays(cursor, dir * (view === 'Week' ? 7 : 1)))
  }
  const title = view === 'Day'
    ? `${MONTHS[cursor.getMonth()]} ${cursor.getDate()}, ${cursor.getFullYear()}`
    : `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`

  const monthEvents = events.filter((e) => { const d = parseDate(e.date); return d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear() })
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6)
  const dayEvents = byDate.get(selected) ?? []
  const sel = parseDate(selected)
  const edit = (e: CalEvent) => setForm({ open: true, event: e })

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
      <Card>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg bg-canvas p-1">
            {(['Month', 'Week', 'Day'] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cx('rounded-md px-3 py-1.5 text-[12px] transition-colors', view === v ? 'bg-lavender text-ink' : 'text-ink hover:bg-white')}>{v}</button>
            ))}
          </div>
          <h1 className="flex-1 text-center text-[18px] font-medium">{title}</h1>
          <Dropdown label="Whose calendar" value={who} options={['Everyone', 'Mine', ...db.users.filter((u) => u.id !== me.id).map((u) => u.name)]} onChange={setWho} />
          <button className="text-[12px] text-muted hover:text-ink" onClick={() => { setCursor(new Date()); setSelected(todayIso) }}>Today</button>
          <NavArrow dir="left" filled onClick={() => shift(-1)} />
          <NavArrow dir="right" filled onClick={() => shift(1)} />
          <button aria-label="Add event" onClick={() => setForm({ open: true, date: selected })} className="flex h-7 w-7 items-center justify-center rounded-full bg-sun hover:bg-sun-hover"><Add size={16} color={C.ink} /></button>
        </div>

        {view === 'Month' && (
          <div className="scroll-thin overflow-x-auto">
            <div className="min-w-[700px] overflow-hidden rounded-lg border border-line">
              <div className="grid grid-cols-7 bg-sky-light">
                {DAYS_SHORT.map((d) => <div key={d} className="border-r border-line px-3 py-3 text-[12px] uppercase last:border-0">{d}</div>)}
              </div>
              {Array.from({ length: weeks }, (_, w) => (
                <div key={w} className="grid grid-cols-7 border-t border-line">
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = addDays(gridStart, w * 7 + i)
                    const iso = isoDate(d)
                    const evs = byDate.get(iso) ?? []
                    const other = d.getMonth() !== cursor.getMonth()
                    return (
                      <div key={iso} role="button" tabIndex={0} onClick={() => setSelected(iso)} onDoubleClick={() => setForm({ open: true, date: iso })}
                        onKeyDown={(e) => e.key === 'Enter' && setSelected(iso)}
                        className={cx('flex h-[100px] flex-col border-r border-line p-2 text-left transition-colors last:border-0', iso === selected ? 'bg-sky-light/60' : 'hover:bg-canvas')}>
                        <div className="mb-auto flex items-center justify-between">
                          <span className={cx('text-[11px]', other ? 'text-faint' : 'text-ink', iso === todayIso && 'flex h-5 w-5 items-center justify-center rounded-full bg-sky-accent text-white')}>{String(d.getDate()).padStart(2, '0')}</span>
                          {evs.length > 2 && <span className="text-[11px] text-muted">{evs.length - 2} more</span>}
                        </div>
                        <div className="flex flex-col gap-1">{evs.slice(0, 2).map((e) => <Chip key={e.id} e={e} onClick={() => edit(e)} />)}</div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'Week' && (
          <div className="scroll-thin overflow-x-auto">
            <div className="grid min-w-[700px] grid-cols-7 overflow-hidden rounded-lg border border-line">
              {Array.from({ length: 7 }, (_, i) => {
                const d = addDays(weekStart, i)
                const iso = isoDate(d)
                return (
                  <div key={iso} className="min-h-[420px] border-r border-line last:border-0" onDoubleClick={() => setForm({ open: true, date: iso })}>
                    <button onClick={() => setSelected(iso)} className={cx('w-full px-3 py-3 text-left text-[12px]', iso === selected ? 'bg-sky' : 'bg-sky-light')}>
                      {DAYS_SHORT[d.getDay()].toUpperCase()} <span className="font-semibold">{d.getDate()}</span>
                    </button>
                    <div className="flex flex-col gap-1.5 p-2">
                      {(byDate.get(iso) ?? []).map((e) => (
                        <div key={e.id}><p className="mb-0.5 text-[11px] text-muted">{time12(e.start)}</p><Chip e={e} onClick={() => edit(e)} /></div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {view === 'Day' && (
          <div className="rounded-lg border border-line">
            {Array.from({ length: 11 }, (_, h) => h + 8).map((h) => {
              const iso = isoDate(cursor)
              const evs = (byDate.get(iso) ?? []).filter((e) => Number(e.start.slice(0, 2)) === h)
              return (
                <div key={h} className="flex min-h-[56px] border-b border-line last:border-0" onDoubleClick={() => setForm({ open: true, date: iso })}>
                  <span className="w-20 shrink-0 border-r border-line px-3 py-2 text-[11px] text-muted">{time12(`${h}:00`)}</span>
                  <div className="flex flex-1 flex-col gap-1 p-2">{evs.map((e) => <Chip key={e.id} e={e} onClick={() => edit(e)} />)}</div>
                </div>
              )
            })}
          </div>
        )}
        <p className="mt-3 text-[11px] text-faint">Tip: double-click a day to add an event, click an event to edit it.</p>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Agenda" action={<MoreButton items={[{ label: 'New event', onClick: () => setForm({ open: true, date: selected }) }]} />} />
          <div className="flex flex-col gap-2">
            {monthEvents.length === 0 && <p className="text-[12px] text-muted">No events this month.</p>}
            {monthEvents.map((e) => <Chip key={e.id} e={e} onClick={() => edit(e)} />)}
          </div>
        </Card>
        <Card>
          <CardHeader title={`${MONTHS[sel.getMonth()].slice(0, 3)}, ${sel.getDate()} ${sel.getFullYear()}`} action={<MoreButton items={[{ label: 'Add to this day', onClick: () => setForm({ open: true, date: selected }) }]} />} />
          <div className="flex flex-col gap-3">
            {dayEvents.length === 0 && <p className="text-[12px] text-muted">Nothing scheduled. Double-click a day to add one.</p>}
            {dayEvents.map((e) => (
              <button key={e.id} onClick={() => edit(e)} className={cx('rounded-lg p-3 text-left transition-opacity hover:opacity-80', KIND_TONE[e.kind].card)}>
                <div className="flex items-center justify-between"><People size={14} color={C.ink} variant="Bold" /><span className="text-[11px] text-muted">{time12(e.start)}</span></div>
                <p className="mt-1 text-[13px]">{e.title}</p>
                <p className="text-[11px] text-muted">{[e.kind, e.companyId ? companyById.get(e.companyId)?.name : null, e.location].filter(Boolean).join(' · ')}</p>
              </button>
            ))}
          </div>
        </Card>
      </div>
      <EventForm open={form.open} event={form.event} defaults={form.date ? { date: form.date } : undefined} onClose={() => setForm({ open: false })} />
    </div>
  )
}
