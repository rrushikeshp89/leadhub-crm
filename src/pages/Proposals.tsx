import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Add, Edit2, Trash, Warning2 } from 'iconsax-react'
import { PROPOSAL_STATUSES, type Proposal } from '../../shared/model'
import { dayDiff, isOpen, stageIndex, todayIso } from '../../shared/calc'
import { useLookups, useStore } from '../store/Store'
import { Card, CardHeader, Cell, Cols, ConfirmModal, Dropdown, Empty, IconAction, Pagination, Pill, RoundAction, SearchInput, usePaged } from '../components/ui'
import { ProposalForm } from '../components/forms'
import { WhiteStat } from '../components/widgets'
import { useMoney } from '../lib/hooks'
import { cx, fullDate, longDate, timeAgo } from '../lib/format'
import { C } from '../lib/theme'

const CLOSED = ['Accepted', 'Rejected', 'Expired']

export default function Proposals() {
  const { db, update, remove, attempt } = useStore()
  const { companyById, oppById } = useLookups()
  const money = useMoney()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [form, setForm] = useState<{ open: boolean; proposal?: Proposal; opportunityId?: string }>({ open: false })
  const [confirm, setConfirm] = useState<Proposal | null>(null)
  const today = todayIso()

  useEffect(() => {
    const id = params.get('id')
    const p = id && db.proposals.find((x) => x.id === id)
    if (p) { setForm({ open: true, proposal: p }); setParams({}, { replace: true }) }
  }, [params, db.proposals, setParams])

  const attention = useMemo(() => {
    const out: { key: string; level: 'danger' | 'warn' | 'info'; text: string; action: () => void; actionLabel: string; to?: string }[] = []
    for (const o of db.opportunities) {
      if (!isOpen(o.stage) || stageIndex(o.stage) < stageIndex('Qualified Opportunity')) continue
      if (!db.proposals.some((p) => p.opportunityId === o.id)) {
        out.push({ key: `prep-${o.id}`, level: o.stage === 'Solution Design' ? 'warn' : 'info', text: `${o.name} (${companyById.get(o.companyId)?.name}) is in ${o.stage} with no proposal`, actionLabel: 'Create proposal', action: () => setForm({ open: true, opportunityId: o.id }), to: `/opportunities/${o.id}` })
      }
    }
    for (const p of db.proposals) {
      const opp = db.opportunities.find((o) => o.id === p.opportunityId)
      if (!opp || !isOpen(opp.stage)) continue
      if (p.status === 'Sent' && p.sentAt && dayDiff(p.sentAt, today) >= 7) {
        out.push({ key: `fu-${p.id}`, level: 'warn', text: `“${p.title}” was sent ${dayDiff(p.sentAt, today)} days ago — awaiting response`, actionLabel: 'Open opportunity', action: () => {}, to: `/opportunities/${p.opportunityId}` })
      }
      if (!CLOSED.includes(p.status) && p.validUntil && p.validUntil < today) {
        out.push({ key: `exp-${p.id}`, level: 'danger', text: `“${p.title}” passed its validity date (${fullDate(p.validUntil)})`, actionLabel: 'Mark expired', action: () => attempt(() => update('proposals', p.id, { status: 'Expired' }, 'Proposal expired')) })
      } else if (!CLOSED.includes(p.status) && p.validUntil && dayDiff(today, p.validUntil) <= 7) {
        out.push({ key: `soon-${p.id}`, level: 'info', text: `“${p.title}” expires ${fullDate(p.validUntil)}`, actionLabel: 'Edit', action: () => setForm({ open: true, proposal: p }) })
      }
    }
    return out
  }, [db.opportunities, db.proposals, companyById, today, attempt, update])

  const rows = useMemo(() => {
    const s = q.toLowerCase()
    return db.proposals.filter((p) => (!s || [p.title, p.code, companyById.get(p.companyId)?.name].some((v) => v?.toLowerCase().includes(s))) && (status === 'All statuses' || p.status === status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [db.proposals, q, status, companyById])
  const { page, pages, setPage, slice } = usePaged(rows, db.settings.pageSize)
  const sum = (f: (p: Proposal) => boolean) => db.proposals.filter(f).reduce((a, p) => a + p.price, 0)
  const decided = db.proposals.filter((p) => p.status === 'Accepted' || p.status === 'Rejected')

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {[
          ['In preparation', String(db.proposals.filter((p) => p.status === 'Draft' || p.status === 'In Review').length), money(sum((p) => p.status === 'Draft' || p.status === 'In Review'))],
          ['Awaiting response', String(db.proposals.filter((p) => p.status === 'Sent' || p.status === 'Negotiation').length), money(sum((p) => p.status === 'Sent' || p.status === 'Negotiation'))],
          ['Accepted', String(db.proposals.filter((p) => p.status === 'Accepted').length), money(sum((p) => p.status === 'Accepted'))],
          ['Acceptance rate', decided.length ? `${Math.round((decided.filter((p) => p.status === 'Accepted').length / decided.length) * 100)}%` : '—', `${decided.length} decided`],
        ].map(([l, v, s]) => <WhiteStat key={l} label={l} value={v} sub={s} />)}
      </div>

      <Card>
        <CardHeader title="Needs attention" action={<span className="rounded bg-canvas px-2 py-0.5 text-[11px] text-muted">Rule-based</span>} />
        {attention.length === 0 ? <p className="text-[12px] text-muted">No proposals need preparation or follow-up right now.</p> : (
          <ul className="divide-y divide-line">
            {attention.map((a) => (
              <li key={a.key} className="flex flex-wrap items-center gap-3 py-2.5 text-[13px]">
                <Warning2 size={16} variant="Bold" color={a.level === 'danger' ? C.danger : a.level === 'warn' ? C.warn : C.skyAccent} />
                <span className="min-w-0 flex-1">{a.text}</span>
                {a.to && <Link to={a.to} className="text-[12px] text-muted hover:text-ink">View</Link>}
                {a.actionLabel !== 'Open opportunity' && <button className="link-accent" onClick={a.action}>{a.actionLabel}</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <h1 className="card-title mr-auto">All Proposals</h1>
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search proposal or company" className="w-60" pill />
          <Dropdown label="Status" value={status} options={['All statuses', ...PROPOSAL_STATUSES]} onChange={(v) => { setStatus(v); setPage(1) }} />
          <RoundAction label="New proposal" onClick={() => setForm({ open: true })}><Add size={18} color="currentColor" /></RoundAction>
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[960px] table-fixed">
            <Cols w={[22, 13, 18, 11, 12, 9, 9, 6]} />
            <thead><tr className="bg-sky-light">
              {['Proposal', 'Company', 'Opportunity', 'Est. price', 'Status', 'Created', 'Last updated'].map((h, i) => <th key={h} className={`th ${i === 0 ? 'rounded-l-lg pl-4' : ''}`}>{h}</th>)}
              <th className="th rounded-r-lg">Action</th>
            </tr></thead>
            <tbody>
              {slice.map((p) => {
                const o = oppById.get(p.opportunityId)
                const stale = p.status === 'Sent' && p.sentAt && dayDiff(p.sentAt, today) >= 7
                return (
                  <tr key={p.id} className="border-b border-line hover:bg-canvas">
                    <td className="td pl-4"><Cell primary={<span className="font-medium">{p.title}</span>} secondary={`${p.code} · ${p.services.join(', ')}`} /></td>
                    <td className="td"><Cell primary={<Link className="hover:text-sky-accent" to={`/companies/${p.companyId}`}>{companyById.get(p.companyId)?.name}</Link>} /></td>
                    <td className="td"><Cell primary={<Link className="hover:text-sky-accent" to={`/opportunities/${p.opportunityId}`}>{o?.name}</Link>} secondary={o?.stage} /></td>
                    <td className="td"><Cell primary={money(p.price)} secondary={p.deliveryTimeline ?? 'Timeline not set'} /></td>
                    <td className="td"><Dropdown size="sm" className="w-32" label="Proposal status" value={p.status} options={PROPOSAL_STATUSES} display={<Pill dot={false} className="px-2 py-0">{p.status}</Pill>} onChange={(s) => attempt(() => update('proposals', p.id, { status: s }, `Proposal ${s}`))} /></td>
                    <td className="td">{longDate(p.createdAt.slice(0, 10))}</td>
                    <td className="td"><Cell primary={<span className={cx(stale && 'font-medium text-warn')}>{timeAgo(p.updatedAt)}</span>} secondary={p.sentAt ? `sent ${longDate(p.sentAt.slice(0, 10))}` : undefined} /></td>
                    <td className="td"><div className="flex gap-1">
                      <IconAction label={`Edit ${p.title}`} onClick={() => setForm({ open: true, proposal: p })}><Edit2 size={18} color={C.muted} /></IconAction>
                      <IconAction label={`Delete ${p.title}`} onClick={() => setConfirm(p)} danger><Trash size={18} color={C.muted} /></IconAction>
                    </div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {slice.length === 0 && <Empty text={db.proposals.length ? 'No proposals match.' : 'No proposals yet. Create one from an opportunity.'} />}
        </div>
        <Pagination page={page} pages={pages} onPage={setPage} />
        <p className="mt-3 text-[11px] text-faint">LeadHub tracks proposal status and dates; documents are prepared and sent outside the CRM. “Viewed” tracking is not available.</p>
      </Card>

      <ProposalForm open={form.open} proposal={form.proposal} opportunityId={form.opportunityId} onClose={() => setForm({ open: false })} />
      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} text={`Delete proposal “${confirm?.title}”?`} onConfirm={() => confirm && attempt(() => remove('proposals', confirm.id, 'Proposal'))} />
    </div>
  )
}
