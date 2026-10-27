import { useMemo, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Add } from 'iconsax-react'
import { SERVICE_CATEGORIES, STAGES, type Opportunity, type Stage } from '../../shared/model'
import { isOpen, pipelineSummary, stageConversion, weightedValue } from '../../shared/calc'
import { ApiError } from '../lib/api'
import { useLookups, useStore } from '../store/Store'
import { Avatar, Card, CardHeader, Checkbox, Dropdown, RoundAction, SearchInput } from '../components/ui'
import { WhiteStat } from '../components/widgets'
import { DueLabel } from '../components/crm'
import { LostReasonModal, OpportunityForm } from '../components/forms'
import { useMoney } from '../lib/hooks'
import { cx } from '../lib/format'

const COLUMN_TONE: Partial<Record<Stage, string>> = { 'Closed Won': 'bg-success-light', 'Closed Lost': 'bg-danger-light/60' }

export default function Pipeline() {
  const { db, me, changeStage, toast } = useStore()
  const { companyById, userById } = useLookups()
  const money = useMoney()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState('All owners')
  const [service, setService] = useState('All services')
  const [showClosed, setShowClosed] = useState(true)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<Stage | null>(null)
  const [pendingLost, setPendingLost] = useState<Opportunity | null>(null)
  const [newOpp, setNewOpp] = useState(false)

  const opps = useMemo(() => db.opportunities.filter((o) => {
    const s = q.toLowerCase()
    return (!s || [o.name, o.code, companyById.get(o.companyId)?.name].some((v) => v?.toLowerCase().includes(s))) &&
      (owner === 'All owners' || (owner === 'Mine' ? o.ownerId === me.id : userById.get(o.ownerId ?? '')?.name === owner)) &&
      (service === 'All services' || o.services.includes(service))
  }), [db.opportunities, q, owner, service, me.id, companyById, userById])
  const summary = pipelineSummary(opps)
  const conversion = stageConversion(opps, db.stageHistory)
  const stages = showClosed ? STAGES : STAGES.filter((s) => isOpen(s))

  const move = async (o: Opportunity, stage: Stage, extra?: { lostReason: string; lostNote: string }) => {
    if (o.stage === stage) return
    if (stage === 'Closed Lost' && !extra) { setPendingLost(o); return }
    try { await changeStage(o.id, stage, extra); toast(`${o.name} → ${stage}`) } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not move the opportunity', 'danger') }
  }
  const onDrop = (e: DragEvent, stage: Stage) => {
    e.preventDefault()
    setOver(null)
    const id = e.dataTransfer.getData('text/plain') || dragging
    const o = db.opportunities.find((x) => x.id === id)
    setDragging(null)
    if (o) void move(o, stage)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {[
          ['Open pipeline', money(summary.openValue), `${summary.openCount} open opportunities`],
          ['Weighted pipeline', money(summary.weightedValue), 'Σ value × probability'],
          ['Closed won (actual)', money(summary.wonValue), `${summary.wonCount} won · win rate ${summary.winRate === null ? '—' : `${Math.round(summary.winRate * 100)}%`}`],
          ['Qualified opportunities', String(summary.qualifiedCount), 'Qualified → Negotiation'],
        ].map(([l, v, s]) => <WhiteStat key={l} label={l} value={v} sub={s} />)}
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="card-title mr-auto">Pipeline Board</h1>
          <SearchInput value={q} onChange={setQ} placeholder="Search opportunity or company" className="w-60" pill />
          <Dropdown label="Owner" value={owner} options={['All owners', 'Mine', ...db.users.map((u) => u.name)]} onChange={setOwner} />
          <Dropdown label="Service" value={service} options={['All services', ...SERVICE_CATEGORIES]} onChange={setService} />
          <span className="flex items-center gap-2 text-[12px] text-muted"><Checkbox label="Show closed stages" checked={showClosed} onChange={setShowClosed} />Show closed</span>
          <RoundAction label="New opportunity" onClick={() => setNewOpp(true)}><Add size={18} color="currentColor" /></RoundAction>
        </div>
        <p className="mb-3 text-[11px] text-faint">Drag a card to another column to change its stage, or use the stage menu on the card. Values are estimates until Closed Won.</p>

        <div className="scroll-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
          {stages.map((stage) => {
            const cards = opps.filter((o) => o.stage === stage).sort((a, b) => b.value - a.value)
            const total = cards.reduce((a, o) => a + o.value, 0)
            const weighted = cards.reduce((a, o) => a + weightedValue(o), 0)
            return (
              <section key={stage} aria-label={stage}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(stage) }}
                onDragLeave={() => setOver((s) => (s === stage ? null : s))}
                onDrop={(e) => onDrop(e, stage)}
                className={cx('flex w-[264px] shrink-0 flex-col rounded-xl p-2 transition-colors', COLUMN_TONE[stage] ?? 'bg-canvas', over === stage && 'ring-2 ring-sky-accent')}>
                <header className="mb-2 px-2 pt-1">
                  <div className="flex items-center justify-between"><h2 className="text-[13px] font-semibold">{stage}</h2><span className="rounded-full bg-white px-2 text-[11px] text-muted">{cards.length}</span></div>
                  <p className="mt-0.5 text-[11px] text-muted">{money(total)}{isOpen(stage) && <span className="text-faint"> · wtd {money(weighted)}</span>}</p>
                </header>
                <div className="flex min-h-[120px] flex-col gap-2">
                  {cards.map((o) => {
                    const company = companyById.get(o.companyId)
                    const ownerU = o.ownerId ? userById.get(o.ownerId) : undefined
                    return (
                      <article key={o.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', o.id); e.dataTransfer.effectAllowed = 'move'; setDragging(o.id) }} onDragEnd={() => setDragging(null)}
                        className={cx('cursor-grab rounded-lg bg-white p-3 shadow-[0_1px_2px_rgba(36,36,36,.06)] transition-opacity active:cursor-grabbing', dragging === o.id && 'opacity-40')}>
                        <p className="truncate text-[11px] text-muted">{company?.name}</p>
                        <button onClick={() => navigate(`/opportunities/${o.id}`)} className="mt-0.5 block text-left text-[13px] font-medium leading-snug hover:text-sky-accent">{o.name}</button>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {o.services.slice(0, 2).map((s) => <span key={s} className="rounded bg-lavender-light px-1.5 py-0.5 text-[11px]">{s}</span>)}
                          {o.services.length > 2 && <span className="text-[11px] text-muted">+{o.services.length - 2}</span>}
                        </div>
                        <div className="mt-2 flex items-baseline justify-between">
                          <span className="text-[14px] font-semibold">{money(o.value)}</span>
                          <span className="text-[11px] text-muted">{o.probability}% · {money(weightedValue(o), true)}</span>
                        </div>
                        {o.stage === 'Closed Lost' && o.lostReason && <p className="mt-1 text-[11px] text-danger">{o.lostReason}</p>}
                        <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2 text-[11px]">
                          <span className="flex min-w-0 items-center gap-1.5"><Avatar src={ownerU?.avatar} name={ownerU?.name ?? '?'} size={18} /><span className="truncate">{ownerU?.name.split(' ')[0] ?? 'Unassigned'}</span></span>
                          {isOpen(o.stage) && <span title={o.nextAction ?? 'No next action'}><DueLabel date={o.nextActionDate} /></span>}
                        </div>
                        <Dropdown size="sm" className="mt-2" label={`Move ${o.name} to stage`} value={o.stage} options={STAGES} display={<>Move · {o.stage}</>} onChange={(s) => void move(o, s)} />
                      </article>
                    )
                  })}
                  {cards.length === 0 && <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[11px] text-faint">Drop here</p>}
                </div>
              </section>
            )
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Stage-to-stage conversion" action={<span className="text-[11px] text-faint">Share of opportunities that reached a stage and moved on to the next</span>} />
        {opps.length === 0 ? <p className="text-[12px] text-muted">No opportunities yet.</p> : (
          <div className="scroll-thin flex gap-2 overflow-x-auto pb-1">
            {conversion.map((c, i) => (
              <div key={c.stage} className="min-w-[110px] flex-1">
                <div className="rounded-lg bg-canvas p-3">
                  <p className="truncate text-[11px] text-muted" title={c.stage}>{c.stage}</p>
                  <p className="text-[18px] font-semibold">{c.reached}</p>
                  <div className="mt-1 h-1.5 rounded bg-white"><div className="h-full rounded bg-sky-accent" style={{ width: `${conversion[0].reached ? (c.reached / conversion[0].reached) * 100 : 0}%` }} /></div>
                </div>
                {i < conversion.length - 1 && <p className="mt-1 text-center text-[11px] text-muted">{c.toNext === null ? '—' : `${Math.round(c.toNext * 100)}% →`}</p>}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-faint">Lost opportunities count up to the furthest stage they reached. See <Link className="text-sky-accent" to="/">Dashboard</Link> for lost-reason analysis.</p>
      </Card>

      <LostReasonModal open={!!pendingLost} onClose={() => setPendingLost(null)} onConfirm={async (reason, note) => { if (pendingLost) await move(pendingLost, 'Closed Lost', { lostReason: reason, lostNote: note }); setPendingLost(null) }} />
      <OpportunityForm open={newOpp} onClose={() => setNewOpp(false)} />
    </div>
  )
}
