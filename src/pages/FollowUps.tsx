import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Add, Calendar } from 'iconsax-react'
import { TASK_PRIORITIES, TASK_TYPES, type Task } from '../../shared/model'
import { dayDiff, isDueToday, isOverdue, todayIso } from '../../shared/calc'
import { useLookups, useStore } from '../store/Store'
import { Card, Dropdown, Pagination, RoundAction, Tabs, Toolbar, usePaged } from '../components/ui'
import { TaskList } from '../components/crm'
import { WhiteStat } from '../components/widgets'
import { TaskForm } from '../components/forms'
import { addDays, cx, isoDate, MONTHS } from '../lib/format'
import { C } from '../lib/theme'

export default function FollowUps() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as 'board' | 'log') ?? 'board'
  const tabs = <Tabs value={tab} onChange={(t) => setParams(t === 'board' ? {} : { tab: t })} tabs={[{ key: 'board', label: 'Task board' }, { key: 'log', label: 'Contact log' }]} />
  return <div className="flex flex-col gap-6">{tab === 'board' ? <Board tabs={tabs} /> : <ContactLog tabs={tabs} />}</div>
}

function Board({ tabs }: { tabs: ReactNode }) {
  const { db, me } = useStore()
  // Admins usually oversee the team, reps their own list
  const [owner, setOwner] = useState<string>(me.role === 'admin' ? 'Everyone' : 'Mine')
  const [type, setType] = useState('All types')
  const [priority, setPriority] = useState('All priorities')
  const [add, setAdd] = useState(false)
  const today = todayIso()
  const tasks = useMemo(() => db.tasks.filter((t) =>
    (owner === 'Everyone' || (owner === 'Mine' ? t.ownerId === me.id : db.users.find((u) => u.id === t.ownerId)?.name === owner)) &&
    (type === 'All types' || t.type === type) && (priority === 'All priorities' || t.priority === priority)), [db.tasks, db.users, owner, type, priority, me.id])
  const open = tasks.filter((t) => t.status === 'Open')
  const groups: { key: string; title: string; tasks: Task[]; tone: string; empty: string }[] = [
    { key: 'overdue', title: 'Overdue', tasks: open.filter((t) => isOverdue(t, today)), tone: 'text-danger', empty: 'Nothing overdue.' },
    { key: 'today', title: 'Due today', tasks: open.filter((t) => isDueToday(t, today)), tone: 'text-warn', empty: 'Nothing due today.' },
    { key: 'week', title: 'Next 7 days', tasks: open.filter((t) => t.dueDate > today && dayDiff(today, t.dueDate) <= 7), tone: 'text-ink', empty: 'Nothing scheduled this week.' },
    { key: 'later', title: 'Later', tasks: open.filter((t) => dayDiff(today, t.dueDate) > 7), tone: 'text-muted', empty: 'Nothing scheduled later.' },
  ]
  const doneWeek = tasks.filter((t) => t.status === 'Completed' && t.completedAt && dayDiff(t.completedAt, today) <= 7).length
  return (
    <>
      <Card>
        <Toolbar title="Follow-ups & Tasks" className="mb-0">
          <Dropdown label="Owner" value={owner} options={['Mine', 'Everyone', ...db.users.filter((u) => u.id !== me.id).map((u) => u.name)]} onChange={setOwner} />
          <Dropdown label="Type" value={type} options={['All types', ...TASK_TYPES]} onChange={setType} />
          <Dropdown label="Priority" value={priority} options={['All priorities', ...TASK_PRIORITIES]} onChange={setPriority} />
          {tabs}
          <RoundAction label="New task" onClick={() => setAdd(true)}><Add size={18} color="currentColor" /></RoundAction>
        </Toolbar>
      </Card>
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {[...groups.slice(0, 3).map((g) => [g.title, g.tasks.length, g.tone] as const), ['Completed (7 days)', doneWeek, 'text-success'] as const].map(([l, n, tone]) => (
          <WhiteStat key={l} label={l} value={String(n)} tone={n && tone === 'text-danger' ? 'danger' : undefined} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {groups.map((g) => (
          <TaskList key={g.key} title={`${g.title} (${g.tasks.length})`} tasks={g.tasks} showRelated defaults={{}} emptyText={g.empty} />
        ))}
      </div>
      <TaskForm open={add} onClose={() => setAdd(false)} />
    </>
  )
}

/** Daily contact grid per lead, derived from logged interactions and follow-up tasks */
function ContactLog({ tabs }: { tabs: ReactNode }) {
  const { db } = useStore()
  const { companyById } = useLookups()
  const now = new Date()
  const windows = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const end = addDays(now, -14 * i)
    const start = addDays(end, -13)
    return { label: `${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)} – ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)}`, start }
  }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [win, setWin] = useState(windows[0].label)
  const [owner, setOwner] = useState('All owners')
  const start = windows.find((w) => w.label === win)!.start
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i))
  const todayIsoStr = isoDate(now)

  const touched = useMemo(() => {
    const s = new Set<string>()
    for (const a of db.activities) if (a.leadId && ['call', 'email', 'meeting'].includes(a.type)) s.add(`${a.leadId}|${isoDate(new Date(a.occurredAt))}`)
    return s
  }, [db.activities])
  const missed = useMemo(() => {
    const s = new Set<string>()
    for (const t of db.tasks) {
      if (!t.leadId || t.dueDate >= todayIsoStr) continue
      const doneOnTime = t.status === 'Completed' && t.completedAt && isoDate(new Date(t.completedAt)) <= t.dueDate
      if (!doneOnTime) s.add(`${t.leadId}|${t.dueDate}`)
    }
    return s
  }, [db.tasks, todayIsoStr])

  const leads = useMemo(() => db.leads.filter((l) => l.status !== 'Disqualified' && (owner === 'All owners' || db.users.find((u) => u.id === l.ownerId)?.name === owner)), [db.leads, db.users, owner])
  const { page, pages, setPage, slice } = usePaged(leads, db.settings.pageSize)

  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="card-title mr-auto">Follow-ups & Tasks</h1>
        <Dropdown label="Date range" value={win} options={windows.map((w) => w.label)} onChange={setWin} icon={<Calendar size={14} color="currentColor" />} />
        <Dropdown label="Owner" value={owner} options={['All owners', ...db.users.map((u) => u.name)]} onChange={(v) => { setOwner(v); setPage(1) }} />
        {tabs}
      </div>
      <div className="scroll-thin overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[900px]">
          <thead><tr className="bg-sky-light">
            <th className="th pl-4">Lead</th>
            {days.map((d) => <th key={d.toISOString()} className={cx('th text-center', isoDate(d) === todayIsoStr && 'text-sky-accent')}>{String(d.getDate()).padStart(2, '0')}</th>)}
          </tr></thead>
          <tbody>
            {slice.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="td max-w-[220px] pl-4"><Link to={`/leads/${l.id}`} className="block truncate hover:text-sky-accent">{l.title}</Link><span className="text-[11px] text-muted">{companyById.get(l.companyId)?.name}</span></td>
                {days.map((d) => {
                  const iso = isoDate(d)
                  const did = touched.has(`${l.id}|${iso}`)
                  const miss = !did && missed.has(`${l.id}|${iso}`)
                  return (
                    <td key={iso} className="td text-center" title={did ? 'Contacted' : miss ? 'Follow-up missed' : 'No contact'}>
                      {did ? <span className="mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-sky-accent"><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke={C.white} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                        : miss ? <span className="mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-danger"><svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1L1 7" stroke={C.white} strokeWidth="1.6" strokeLinecap="round" /></svg></span>
                          : <span className="text-muted">-</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-faint">✓ = a call, email or meeting was logged that day. ✗ = a follow-up task was due that day and not completed on time. Log interactions from a lead’s timeline.</p>
      <Pagination page={page} pages={pages} onPage={setPage} numbered />
    </Card>
  )
}
