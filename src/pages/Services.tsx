import { useMemo, useState } from 'react'
import { Add, Box, Edit2, Trash } from 'iconsax-react'
import { SERVICE_GROUPS, type Service } from '../../shared/model'
import { isOpen } from '../../shared/calc'
import { useStore } from '../store/Store'
import { Card, Cell, Cols, ConfirmModal, Dropdown, Empty, IconAction, Notice, Pill, RoundAction, SearchInput } from '../components/ui'
import { ServiceForm } from '../components/forms'
import { useMoney } from '../lib/hooks'
import { C } from '../lib/theme'

const GROUP_COLOR: Record<string, string> = { 'Custom Software Development': C.skyAccent, 'AI Solutions': C.lavenderInk, 'Consulting & Digital Transformation': C.sun }

export default function Services() {
  const { db, me, remove, attempt } = useStore()
  const money = useMoney()
  const isAdmin = me.role === 'admin'
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('All groups')
  const [form, setForm] = useState<{ open: boolean; service?: Service }>({ open: false })
  const [confirm, setConfirm] = useState<Service | null>(null)

  const demand = useMemo(() => {
    const m = new Map<string, { leads: number; open: number; pipeline: number; won: number }>()
    const get = (k: string) => m.get(k) ?? m.set(k, { leads: 0, open: 0, pipeline: 0, won: 0 }).get(k)!
    db.leads.forEach((l) => l.status !== 'Disqualified' && l.services.forEach((s) => get(s).leads++))
    db.opportunities.forEach((o) => o.services.forEach((s) => {
      const d = get(s)
      if (isOpen(o.stage)) { d.open++; d.pipeline += o.value }
      if (o.stage === 'Closed Won') d.won++
    }))
    return m
  }, [db.leads, db.opportunities])

  const rows = db.services.filter((s) => (!q || [s.name, s.category, s.description].some((v) => v?.toLowerCase().includes(q.toLowerCase()))) && (group === 'All groups' || s.group === group))

  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="card-title mr-auto">Service Catalog</h1>
        <SearchInput value={q} onChange={setQ} placeholder="Search services" className="w-60" pill />
        <Dropdown label="Group" value={group} options={['All groups', ...SERVICE_GROUPS]} onChange={setGroup} />
        {isAdmin && <RoundAction label="Add service" onClick={() => setForm({ open: true })}><Add size={18} color="currentColor" /></RoundAction>}
      </div>
      <Notice className="mb-4">Demand figures count leads and opportunities tagged with each service’s interest category (one opportunity can count toward several categories). Starting prices and durations are set by your team; blank means not set.</Notice>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[960px] table-fixed">
            <Cols w={[30, 20, 12, 9, 13, 9, 7]} />
          <thead><tr className="bg-sky-light">
            {['Service', 'Group', 'Starting price', 'Interested leads', 'Open pipeline', 'Status'].map((h, i) => <th key={h} className={`th ${i === 0 ? 'rounded-l-lg pl-4' : ''}`}>{h}</th>)}
            <th className="th rounded-r-lg">Action</th>
          </tr></thead>
          <tbody>
            {rows.map((s) => {
              const d = demand.get(s.category) ?? { leads: 0, open: 0, pipeline: 0, won: 0 }
              return (
                <tr key={s.id} className="border-b border-line hover:bg-canvas">
                  <td className="td pl-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: GROUP_COLOR[s.group] }}><Box size={16} color={C.white} variant="Bold" /></span><Cell primary={s.name} secondary={`${s.code} · ${s.description ?? ''}`} /></div></td>
                  <td className="td"><Cell primary={s.group} secondary={s.category} /></td>
                  <td className="td"><Cell primary={s.startingPrice !== null ? money(s.startingPrice) : <span className="italic text-faint">Not set</span>} secondary={s.typicalDuration ?? 'Duration not set'} /></td>
                  <td className="td">{d.leads}</td>
                  <td className="td"><Cell primary={money(d.pipeline)} secondary={`${d.open} open opportunit${d.open === 1 ? 'y' : 'ies'}`} /></td>
                  <td className="td"><Pill dot={false}>{s.active ? 'Active' : 'Inactive'}</Pill></td>
                  <td className="td">{isAdmin && <div className="flex gap-1">
                    <IconAction label={`Edit ${s.name}`} onClick={() => setForm({ open: true, service: s })}><Edit2 size={18} color={C.muted} /></IconAction>
                    <IconAction label={`Delete ${s.name}`} onClick={() => setConfirm(s)} danger><Trash size={18} color={C.muted} /></IconAction>
                  </div>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text="No services found." />}
      </div>
      <ServiceForm open={form.open} service={form.service} onClose={() => setForm({ open: false })} />
      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} text={`Delete ${confirm?.name} from the catalog?`} onConfirm={() => confirm && attempt(() => remove('services', confirm.id, confirm.name))} />
    </Card>
  )
}
