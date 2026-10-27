import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Add, Edit2, Setting4, Trash } from 'iconsax-react'
import { INDUSTRIES, SERVICE_CATEGORIES, STAGES, type Opportunity } from '../../shared/model'
import { isOpen, weightedValue } from '../../shared/calc'
import { useLookups, useStore } from '../store/Store'
import { Card, Cell, Cols, ConfirmModal, Dropdown, Empty, IconAction, Pagination, Pill, RoundAction, SearchInput, usePaged } from '../components/ui'
import { DueLabel } from '../components/crm'
import { OpportunityForm } from '../components/forms'
import { OPP_VIEWS } from '../lib/views'
import { useMoney } from '../lib/hooks'
import { timeAgo } from '../lib/format'
import { C } from '../lib/theme'

const SORTS = ['Deal value', 'Weighted value', 'Expected close', 'Next action date', 'Last activity', 'Newest'] as const

export default function Opportunities() {
  const { db, me, remove, attempt } = useStore()
  const { companyById, userById } = useLookups()
  const money = useMoney()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') ?? 'open'
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState('All owners')
  const [service, setService] = useState('All services')
  const [industry, setIndustry] = useState('All industries')
  const [stage, setStage] = useState('All stages')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('Deal value')
  const [showFilters, setShowFilters] = useState(false)
  const [form, setForm] = useState<{ open: boolean; opp?: Opportunity }>({ open: false })
  const [confirm, setConfirm] = useState<Opportunity | null>(null)

  const lastActivity = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of db.activities) if (a.opportunityId && (m.get(a.opportunityId) ?? '') < a.occurredAt) m.set(a.opportunityId, a.occurredAt)
    return m
  }, [db.activities])
  const latestProposal = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of [...db.proposals].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) m.set(p.opportunityId, p.status)
    return m
  }, [db.proposals])

  const rows = useMemo(() => {
    const preset = OPP_VIEWS.find((v) => v.key === view) ?? OPP_VIEWS[0]
    const s = q.toLowerCase()
    const list = db.opportunities.filter((o) => {
      const c = companyById.get(o.companyId)
      return preset.test(o, me, db.proposals) &&
        (!s || [o.name, o.code, c?.name].some((v) => v?.toLowerCase().includes(s))) &&
        (owner === 'All owners' || userById.get(o.ownerId ?? '')?.name === owner) &&
        (service === 'All services' || o.services.includes(service)) &&
        (industry === 'All industries' || c?.industry === industry) &&
        (stage === 'All stages' || o.stage === stage)
    })
    const cmp: Record<(typeof SORTS)[number], (a: Opportunity, b: Opportunity) => number> = {
      'Deal value': (a, b) => b.value - a.value,
      'Weighted value': (a, b) => weightedValue(b) - weightedValue(a),
      'Expected close': (a, b) => (a.expectedCloseDate ?? '9999').localeCompare(b.expectedCloseDate ?? '9999'),
      'Next action date': (a, b) => (a.nextActionDate ?? '9999').localeCompare(b.nextActionDate ?? '9999'),
      'Last activity': (a, b) => (lastActivity.get(b.id) ?? '').localeCompare(lastActivity.get(a.id) ?? ''),
      Newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    }
    return list.sort(cmp[sort])
  }, [db.opportunities, db.proposals, view, q, owner, service, industry, stage, sort, me, companyById, userById, lastActivity])
  const { page, pages, setPage, slice } = usePaged(rows, db.settings.pageSize)
  const totals = rows.reduce((a, o) => ({ value: a.value + o.value, weighted: a.weighted + (isOpen(o.stage) ? weightedValue(o) : 0) }), { value: 0, weighted: 0 })

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="card-title mr-auto">Opportunities</h1>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search opportunity or company" className="w-60" pill />
        <Dropdown label="Sort" value={sort} options={SORTS} onChange={setSort} />
        <RoundAction label="Filters" active={showFilters} onClick={() => setShowFilters((s) => !s)}><Setting4 size={16} color="currentColor" /></RoundAction>
        <RoundAction label="New opportunity" onClick={() => setForm({ open: true })}><Add size={18} color="currentColor" /></RoundAction>
      </div>
      <div className="scroll-thin mb-4 flex gap-2 overflow-x-auto pb-1">
        {OPP_VIEWS.map((v) => (
          <button key={v.key} onClick={() => { setParams(v.key === 'open' ? {} : { view: v.key }); setPage(1) }}
            className={view === v.key ? 'chip-on' : 'chip-off'}>
            {v.label} <span className="text-faint">{db.opportunities.filter((o) => v.test(o, me, db.proposals)).length}</span>
          </button>
        ))}
      </div>
      {showFilters && (
        <div className="panel mb-4 flex flex-wrap items-center gap-3">
          <Dropdown label="Owner" value={owner} options={['All owners', ...db.users.map((u) => u.name)]} onChange={(v) => { setOwner(v); setPage(1) }} />
          <Dropdown label="Stage" value={stage} options={['All stages', ...STAGES]} onChange={(v) => { setStage(v); setPage(1) }} />
          <Dropdown label="Service" value={service} options={['All services', ...SERVICE_CATEGORIES]} onChange={(v) => { setService(v); setPage(1) }} />
          <Dropdown label="Industry" value={industry} options={['All industries', ...INDUSTRIES]} onChange={(v) => { setIndustry(v); setPage(1) }} />
        </div>
      )}
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[960px] table-fixed">
            <Cols w={[20, 14, 16, 11, 9, 14, 10, 6]} />
          <thead><tr className="bg-sky-light">
            {['Opportunity', 'Company', 'Stage', 'Est. value', 'Weighted', 'Next action', 'Owner'].map((h, i) => <th key={h} className={`th ${i === 0 ? 'rounded-l-lg pl-4' : ''}`}>{h}</th>)}
            <th className="th rounded-r-lg">Action</th>
          </tr></thead>
          <tbody>
            {slice.map((o) => {
              const open = isOpen(o.stage)
              const last = lastActivity.get(o.id)
              return (
                <tr key={o.id} onClick={() => navigate(`/opportunities/${o.id}`)} className="cursor-pointer border-b border-line transition-colors hover:bg-canvas">
                  <td className="td pl-4"><Cell primary={<span className="font-medium">{o.name}</span>} secondary={`${o.services[0] ?? ''}${o.services.length > 1 ? ` +${o.services.length - 1}` : ''} · ${last ? `active ${timeAgo(last)}` : 'no activity'}`} /></td>
                  <td className="td" onClick={(e) => e.stopPropagation()}><Cell primary={<Link to={`/companies/${o.companyId}`} className="hover:text-sky-accent">{companyById.get(o.companyId)?.name}</Link>} secondary={latestProposal.get(o.id) ? `Proposal: ${latestProposal.get(o.id)}` : 'No proposal'} /></td>
                  <td className="td"><Cell primary={<Pill>{o.stage}</Pill>} secondary={open ? <span className="pl-1">Close <DueLabel date={o.expectedCloseDate} /></span> : <span className="pl-1">Closed {o.closedAt?.slice(0, 10)}</span>} /></td>
                  <td className="td"><Cell primary={money(o.value)} secondary={`${o.probability}% probability`} /></td>
                  <td className="td">{open ? money(weightedValue(o)) : <span className="text-muted">—</span>}</td>
                  <td className="td">{open ? <Cell primary={o.nextAction ?? <span className="italic text-danger">None</span>} secondary={<DueLabel date={o.nextActionDate} />} /> : <span className="text-muted">—</span>}</td>
                  <td className="td"><Cell primary={o.ownerId ? userById.get(o.ownerId)?.name : 'Unassigned'} /></td>
                  <td className="td" onClick={(e) => e.stopPropagation()}><div className="flex gap-1">
                    <IconAction label={`Edit ${o.name}`} onClick={() => setForm({ open: true, opp: o })}><Edit2 size={18} color={C.muted} /></IconAction>
                    <IconAction label={`Delete ${o.name}`} onClick={() => setConfirm(o)} danger><Trash size={18} color={C.muted} /></IconAction>
                  </div></td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr>
              <td className="td pl-4 font-medium" colSpan={3}>{rows.length} opportunities</td>
              <td className="td font-medium">{money(totals.value)}</td>
              <td className="td font-medium">{money(totals.weighted)}</td>
              <td colSpan={3} className="td truncate text-[11px] text-faint">Weighted = estimated value × probability (open opportunities only)</td>
            </tr></tfoot>
          )}
        </table>
        {slice.length === 0 && <Empty text={db.opportunities.length ? 'No opportunities in this view.' : 'No opportunities yet. Create one from a qualified lead.'} />}
      </div>
      <Pagination page={page} pages={pages} onPage={setPage} />
      <OpportunityForm open={form.open} opportunity={form.opp} onClose={() => setForm({ open: false })} onSaved={(o) => !form.opp && navigate(`/opportunities/${o.id}`)} />
      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} text={`Delete “${confirm?.name}”? Its proposals, tasks and history are deleted too.`} onConfirm={() => confirm && attempt(() => remove('opportunities', confirm.id, confirm.name))} />
    </Card>
  )
}
