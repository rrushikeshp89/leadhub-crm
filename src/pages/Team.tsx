import { useMemo, useState } from 'react'
import { Add, Edit2, Trash } from 'iconsax-react'
import type { User } from '../../shared/model'
import { isOverdue, pipelineSummary } from '../../shared/calc'
import { useStore } from '../store/Store'
import { Avatar, Card, Cell, Cols, ConfirmModal, Empty, IconAction, Notice, Pill, RoundAction, SearchInput } from '../components/ui'
import { UserForm } from '../components/forms'
import { useMoney } from '../lib/hooks'
import { C } from '../lib/theme'

export default function Team() {
  const { db, me, remove, attempt } = useStore()
  const money = useMoney()
  const isAdmin = me.role === 'admin'
  const [q, setQ] = useState('')
  const [form, setForm] = useState<{ open: boolean; user?: User }>({ open: false })
  const [confirm, setConfirm] = useState<User | null>(null)

  const rows = useMemo(() => db.users.filter((u) => !q || [u.name, u.email, u.title, u.territory].some((v) => v?.toLowerCase().includes(q.toLowerCase()))).map((u) => {
    const opps = db.opportunities.filter((o) => o.ownerId === u.id)
    return { u, s: pipelineSummary(opps), leads: db.leads.filter((l) => l.ownerId === u.id && l.status !== 'Disqualified').length, overdue: db.tasks.filter((t) => t.ownerId === u.id && isOverdue(t)).length }
  }), [db.users, db.opportunities, db.leads, db.tasks, q])

  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="card-title mr-auto">Sales Team</h1>
        <SearchInput value={q} onChange={setQ} placeholder="Search name, title, territory" className="w-64" pill />
        {isAdmin && <RoundAction label="Add team member" onClick={() => setForm({ open: true })}><Add size={18} color="currentColor" /></RoundAction>}
      </div>
      {!isAdmin && <Notice className="mb-4">Only admins can add, edit or remove team members.</Notice>}
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[960px] table-fixed">
            <Cols w={[22, 18, 8, 16, 10, 7, 7, 7, 5]} />
          <thead><tr className="bg-sky-light">
            {['Team member', 'Role', 'Active leads', 'Open pipeline', 'Closed won', 'Win rate', 'Overdue tasks', 'Sign-in'].map((h, i) => <th key={h} className={`th ${i === 0 ? 'rounded-l-lg pl-4' : ''}`}>{h}</th>)}
            <th className="th rounded-r-lg">Action</th>
          </tr></thead>
          <tbody>
            {rows.map(({ u, s, leads, overdue }) => (
              <tr key={u.id} className="border-b border-line hover:bg-canvas">
                <td className="td pl-4"><div className="flex items-center gap-3"><Avatar src={u.avatar} name={u.name} size={36} /><Cell primary={<>{u.name}{u.id === me.id && <span className="ml-1 text-[11px] text-muted">(you)</span>}</>} secondary={u.email} /></div></td>
                <td className="td"><Cell primary={u.role === 'admin' ? 'Admin' : 'Sales rep'} secondary={[u.title, u.territory].filter(Boolean).join(' · ')} /></td>
                <td className="td">{leads}</td>
                <td className="td"><Cell primary={money(s.openValue)} secondary={`weighted ${money(s.weightedValue)} · ${s.openCount} open`} /></td>
                <td className="td">{money(s.wonValue)}</td>
                <td className="td">{s.winRate === null ? '—' : `${Math.round(s.winRate * 100)}%`}</td>
                <td className={`td ${overdue ? 'font-medium text-danger' : ''}`}>{overdue}</td>
                <td className="td">{u.canLogin ? <Pill tone="green" dot={false}>Active</Pill> : <Pill tone="gray" dot={false}>No password</Pill>}</td>
                <td className="td">{isAdmin && <div className="flex gap-1">
                  <IconAction label={`Edit ${u.name}`} onClick={() => setForm({ open: true, user: u })}><Edit2 size={18} color={C.muted} /></IconAction>
                  {u.id !== me.id && <IconAction label={`Remove ${u.name}`} onClick={() => setConfirm(u)} danger><Trash size={18} color={C.muted} /></IconAction>}
                </div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text="No team members match." />}
      </div>
      <UserForm open={form.open} user={form.user} onClose={() => setForm({ open: false })} />
      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} text={`Remove ${confirm?.name}? Their leads, opportunities and tasks become unassigned.`} onConfirm={() => confirm && attempt(() => remove('users', confirm.id, confirm.name))} />
    </Card>
  )
}
