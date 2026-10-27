import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Add, Edit2, Setting4, Trash } from 'iconsax-react'
import { INDUSTRIES, LEAD_SOURCES, LEAD_STATUSES, SERVICE_CATEGORIES, TEMPERATURES, type Lead } from '../../shared/model'
import { qualificationScore } from '../../shared/calc'
import { useLookups, useStore } from '../store/Store'
import { Avatar, Card, Cell, Checkbox, Cols, ConfirmModal, Dropdown, Empty, IconAction, Pagination, Pill, RoundAction, SearchInput, usePaged } from '../components/ui'
import { DueLabel, TempPill } from '../components/crm'
import { LeadForm, LeadIntakeForm } from '../components/forms'
import { LEAD_VIEWS, useSavedViews } from '../lib/views'
import { useMoney } from '../lib/hooks'
import { cx, timeAgo } from '../lib/format'
import { C } from '../lib/theme'

interface Filters { status: string; owner: string; source: string; industry: string; service: string; temperature: string }
const ALL: Filters = { status: 'All statuses', owner: 'All owners', source: 'All sources', industry: 'All industries', service: 'All services', temperature: 'Any temperature' }
const SORTS = ['Newest', 'Deal value', 'Last activity', 'Next follow-up', 'Qualification score'] as const

export default function Leads() {
  const { db, me, remove, attempt } = useStore()
  const { companyById, contactById, userById } = useLookups()
  const money = useMoney()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') ?? 'active'
  const [q, setQ] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [f, setF] = useState<Filters>(ALL)
  const [sort, setSort] = useState<(typeof SORTS)[number]>('Newest')
  const [selected, setSelected] = useState<string[]>([])
  const [intake, setIntake] = useState(false)
  const [editing, setEditing] = useState<Lead | null>(null)
  const [confirm, setConfirm] = useState<string[] | null>(null)
  const saved = useSavedViews<Filters & { sort: string; q: string }>('leadhub.leadViews')

  const lastActivity = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of db.activities) if (a.leadId && a.type !== 'system' && (m.get(a.leadId) ?? '') < a.occurredAt) m.set(a.leadId, a.occurredAt)
    return m
  }, [db.activities])
  const ownerName = (id: string | null) => (id ? userById.get(id)?.name ?? '—' : 'Unassigned')

  const rows = useMemo(() => {
    const preset = LEAD_VIEWS.find((v) => v.key === view) ?? LEAD_VIEWS[0]
    const s = q.trim().toLowerCase()
    const list = db.leads.filter((l) => {
      const company = companyById.get(l.companyId)
      const contact = contactById.get(l.contactId)
      return preset.test(l, me) &&
        (!s || [l.title, l.code, company?.name, contact?.name, contact?.email].some((v) => v?.toLowerCase().includes(s))) &&
        (f.status === ALL.status || l.status === f.status) &&
        (f.owner === ALL.owner || ownerName(l.ownerId) === f.owner) &&
        (f.source === ALL.source || l.source === f.source) &&
        (f.industry === ALL.industry || company?.industry === f.industry) &&
        (f.service === ALL.service || l.services.includes(f.service)) &&
        (f.temperature === ALL.temperature || l.temperature === f.temperature)
    })
    const val = (l: Lead) => l.estimatedValue ?? l.estimatedBudget ?? -1
    const cmp: Record<(typeof SORTS)[number], (a: Lead, b: Lead) => number> = {
      Newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      'Deal value': (a, b) => val(b) - val(a),
      'Last activity': (a, b) => (lastActivity.get(b.id) ?? '').localeCompare(lastActivity.get(a.id) ?? ''),
      'Next follow-up': (a, b) => (a.nextFollowUp ?? '9999').localeCompare(b.nextFollowUp ?? '9999'),
      'Qualification score': (a, b) => qualificationScore(b.qualification, db.settings.qualification).score - qualificationScore(a.qualification, db.settings.qualification).score,
    }
    return list.sort(cmp[sort])
  }, [db.leads, db.settings.qualification, view, q, f, sort, me, companyById, contactById, lastActivity]) // eslint-disable-line react-hooks/exhaustive-deps
  const { page, pages, setPage, slice } = usePaged(rows, db.settings.pageSize)
  const allOnPage = slice.length > 0 && slice.every((l) => selected.includes(l.id))
  const filtered = JSON.stringify(f) !== JSON.stringify(ALL)
  const setFilter = <K extends keyof Filters>(k: K, v: string) => { setF((x) => ({ ...x, [k]: v })); setPage(1) }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="card-title mr-auto">All Leads</h1>
        {selected.length > 0 && (
          <button className="btn-danger btn-sm" onClick={() => setConfirm(selected)}><Trash size={14} color="currentColor" /> Delete {selected.length}</button>
        )}
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search lead, company, contact" className="w-60" pill />
        <Dropdown label="Sort" value={sort} options={SORTS} onChange={setSort} />
        <RoundAction label="Filters" active={showFilters || filtered} onClick={() => setShowFilters((s) => !s)}><Setting4 size={16} color="currentColor" /></RoundAction>
        <RoundAction label="Add lead" onClick={() => setIntake(true)}><Add size={18} color="currentColor" /></RoundAction>
      </div>

      <div className="scroll-thin mb-4 flex gap-2 overflow-x-auto pb-1">
        {LEAD_VIEWS.map((v) => (
          <button key={v.key} onClick={() => { setParams(v.key === 'active' ? {} : { view: v.key }); setPage(1) }}
            className={view === v.key ? 'chip-on' : 'chip-off'}>
            {v.label} <span className="text-faint">{db.leads.filter((l) => v.test(l, me)).length}</span>
          </button>
        ))}
        {saved.views.map((sv) => (
          <span key={sv.name} className="flex items-center rounded-full bg-lavender-light text-[12px]">
            <button className="py-1.5 pl-3 pr-1" onClick={() => { const { sort: s, q: qq, ...rest } = sv.filters; setF(rest); setSort(s as (typeof SORTS)[number]); setQ(qq); setShowFilters(true) }}>{sv.name}</button>
            <button aria-label={`Remove view ${sv.name}`} className="px-2 text-muted hover:text-danger" onClick={() => saved.drop(sv.name)}>×</button>
          </span>
        ))}
      </div>

      {showFilters && (
        <div className="panel mb-4 flex flex-wrap items-center gap-3">
          <Dropdown label="Status" value={f.status} options={[ALL.status, ...LEAD_STATUSES]} onChange={(v) => setFilter('status', v)} />
          <Dropdown label="Owner" value={f.owner} options={[ALL.owner, 'Unassigned', ...db.users.map((u) => u.name)]} onChange={(v) => setFilter('owner', v)} />
          <Dropdown label="Source" value={f.source} options={[ALL.source, ...LEAD_SOURCES]} onChange={(v) => setFilter('source', v)} />
          <Dropdown label="Industry" value={f.industry} options={[ALL.industry, ...INDUSTRIES]} onChange={(v) => setFilter('industry', v)} />
          <Dropdown label="Service" value={f.service} options={[ALL.service, ...SERVICE_CATEGORIES]} onChange={(v) => setFilter('service', v)} />
          <Dropdown label="Temperature" value={f.temperature} options={[ALL.temperature, ...TEMPERATURES]} onChange={(v) => setFilter('temperature', v)} />
          {filtered && <button className="link-accent" onClick={() => setF(ALL)}>Clear</button>}
          <button className="link-accent ml-auto" onClick={() => { const name = prompt('Name this view'); if (name?.trim()) saved.save(name.trim(), { ...f, sort, q }) }}>Save as view</button>
        </div>
      )}

      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[960px] table-fixed">
            <Cols w={[4, 20, 14, 15, 8, 10, 11, 12, 6]} />
          <thead>
            <tr className="bg-sky-light">
              <th className="th w-10 rounded-l-lg pl-4"><Checkbox label="Select all" checked={allOnPage} onChange={(v) => setSelected((s) => v ? [...new Set([...s, ...slice.map((l) => l.id)])] : s.filter((id) => !slice.some((l) => l.id === id)))} /></th>
              <th className="th">Lead</th><th className="th">Company</th><th className="th">Status</th><th className="th">Temperature</th>
              <th className="th">Est. value</th><th className="th">Owner</th><th className="th">Next follow-up</th>
              <th className="th rounded-r-lg">Action</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((l) => {
              const sel = selected.includes(l.id)
              const company = companyById.get(l.companyId)
              const contact = contactById.get(l.contactId)
              const score = qualificationScore(l.qualification, db.settings.qualification)
              const last = lastActivity.get(l.id)
              return (
                <tr key={l.id} onClick={() => navigate(`/leads/${l.id}`)} className={cx('cursor-pointer border-b border-line transition-colors', sel ? 'bg-lavender-light' : 'hover:bg-canvas')}>
                  <td className="td pl-4"><Checkbox label={`Select ${l.title}`} checked={sel} onChange={() => setSelected((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]))} /></td>
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <Avatar src={contact?.avatar} name={contact?.name ?? '?'} size={36} />
                      <Cell primary={l.title} secondary={`${contact?.name ?? ''}${contact?.title ? ` · ${contact.title}` : ''}`} />
                    </div>
                  </td>
                  <td className="td" onClick={(e) => e.stopPropagation()}><Cell primary={<Link to={`/companies/${l.companyId}`} className="hover:text-sky-accent">{company?.name}</Link>} secondary={company?.industry ?? 'Industry unknown'} /></td>
                  <td className="td"><Pill>{l.status}</Pill></td>
                  <td className="td"><Cell primary={<TempPill t={l.temperature} />} secondary={score.answered ? `Score ${score.score}` : 'Not scored'} /></td>
                  <td className="td"><Cell primary={l.estimatedValue !== null ? money(l.estimatedValue) : l.estimatedBudget !== null ? money(l.estimatedBudget) : <span className="italic text-faint">Unknown</span>} secondary={l.estimatedValue === null && l.estimatedBudget !== null ? 'prospect budget' : undefined} /></td>
                  <td className="td"><Cell primary={ownerName(l.ownerId)} secondary={l.source ?? 'Source unknown'} /></td>
                  <td className="td"><Cell primary={<DueLabel date={l.nextFollowUp} />} secondary={last ? `active ${timeAgo(last)}` : 'no activity yet'} /></td>
                  <td className="td" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <IconAction label={`Edit ${l.title}`} onClick={() => setEditing(l)}><Edit2 size={18} color={C.muted} /></IconAction>
                      <IconAction label={`Delete ${l.title}`} onClick={() => setConfirm([l.id])} danger><Trash size={18} color={C.muted} /></IconAction>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {slice.length === 0 && <Empty text={db.leads.length ? 'No leads match this view or filters.' : 'No leads yet. Add your first lead or share the inquiry form.'} />}
      </div>
      <Pagination page={page} pages={pages} onPage={setPage} />

      <LeadIntakeForm open={intake} onClose={() => setIntake(false)} onCreated={(l) => navigate(`/leads/${l.id}`)} />
      {editing && <LeadForm open onClose={() => setEditing(null)} lead={editing} />}
      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} text={`Delete ${confirm?.length === 1 ? 'this lead' : `${confirm?.length} leads`}? Its tasks and activity history are deleted too; opportunities stay with the company.`}
        onConfirm={async () => {
          if (!confirm) return
          for (const id of confirm) await attempt(() => remove('leads', id))
          setSelected((s) => s.filter((x) => !confirm.includes(x)))
        }} />
    </Card>
  )
}
