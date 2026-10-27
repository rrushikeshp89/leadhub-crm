import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Activity, Add, Briefcase, Calendar, Chart, DocumentText, DollarCircle, Flag, Profile, Trash, UserOctagon } from 'iconsax-react'
import { PROPOSAL_STATUSES, type Proposal } from '../../shared/model'
import { isOpen, weightedValue } from '../../shared/calc'
import { useLookups, useStore } from '../store/Store'
import { Card, CardHeader, ConfirmModal, Dropdown, Empty, KV, Pill, Unknown } from '../components/ui'
import { AiAssistant, DueLabel, InsightsCard, NextActionCard, Hero, HeroBadge, HeroMeta, StageStepper, TaskList, Timeline } from '../components/crm'
import { EventForm, OpportunityForm, ProposalForm, TaskForm } from '../components/forms'
import { opportunityInsights, PLAYBOOK } from '../lib/insights'
import { IconStat } from '../components/widgets'
import { useMoney } from '../lib/hooks'
import { fullDate, timeAgo } from '../lib/format'
import { C } from '../lib/theme'

export default function OpportunityDetail() {
  const { id } = useParams()
  const { db, update, remove, attempt } = useStore()
  const { companyById, contactById, userById, leadById } = useLookups()
  const money = useMoney()
  const navigate = useNavigate()
  const opp = db.opportunities.find((o) => o.id === id)
  const [modal, setModal] = useState<null | 'edit' | 'task' | 'meeting' | 'proposal' | 'delete'>(null)
  const [editProposal, setEditProposal] = useState<Proposal | null>(null)
  const [nextAction, setNextAction] = useState<{ text: string; date: string } | null>(null)

  const r = useMemo(() => opp && ({
    proposals: db.proposals.filter((p) => p.opportunityId === opp.id),
    tasks: db.tasks.filter((t) => t.opportunityId === opp.id),
    activities: db.activities.filter((a) => a.opportunityId === opp.id),
    history: db.stageHistory.filter((h) => h.opportunityId === opp.id).sort((a, b) => b.changedAt.localeCompare(a.changedAt)),
  }), [opp, db.proposals, db.tasks, db.activities, db.stageHistory])

  if (!opp || !r) return <Card><Empty text="This opportunity does not exist or was deleted." /><div className="pb-6 text-center"><Link to="/opportunities" className="btn-primary">Back to opportunities</Link></div></Card>
  const company = companyById.get(opp.companyId)
  const contact = opp.contactId ? contactById.get(opp.contactId) : undefined
  const owner = opp.ownerId ? userById.get(opp.ownerId) : undefined
  const lead = opp.leadId ? leadById.get(opp.leadId) : undefined
  const open = isOpen(opp.stage)
  const nextTask = r.tasks.filter((t) => t.status === 'Open').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const insights = opportunityInsights(opp, db)

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Hero
            eyebrow={<>{opp.code} · Opportunity</>}
            title={opp.name}
            subtitle={<Link to={`/companies/${opp.companyId}`} className="hover:underline">{company?.name}{company?.industry && <span className="text-ink/60"> · {company.industry}</span>}</Link>}
            media={<span className="flex h-[104px] w-[104px] items-center justify-center rounded-full border-4 border-white bg-white"><Briefcase size={40} color={C.skyAccent} variant="Bold" /></span>}
            onEdit={() => setModal('edit')}
            meta={<>
              <HeroMeta icon={Profile}>{contact ? <>{contact.name}{contact.title && <span className="text-ink/60"> · {contact.title}</span>}</> : <Unknown text="No primary contact" />}</HeroMeta>
              <HeroMeta icon={UserOctagon}>Owner: {owner?.name ?? 'Unassigned'}</HeroMeta>
              <HeroMeta icon={Flag}>{lead ? <Link to={`/leads/${lead.id}`} className="hover:underline">Lead: {lead.title}</Link> : <Unknown text="No source lead" />}</HeroMeta>
              <HeroMeta icon={Calendar}>Created {fullDate(opp.createdAt.slice(0, 10))}</HeroMeta>
            </>}
            badges={opp.services.map((sv) => <HeroBadge key={sv}>{sv}</HeroBadge>)}
            actions={<>
              <button className="btn-white btn-sm" onClick={() => setModal('meeting')}><Calendar size={14} color="currentColor" />Schedule meeting</button>
              <button className="btn-white btn-sm" onClick={() => setModal('task')}><Add size={14} color="currentColor" />Task</button>
              <button className="btn-white btn-sm" onClick={() => setModal('proposal')}><DocumentText size={14} color="currentColor" />Proposal</button>
            </>}
            danger={<button className="btn-quiet-danger btn-sm" onClick={() => setModal('delete')}><Trash size={14} color="currentColor" />Delete</button>}
          />
  
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <IconStat icon={DollarCircle} tone="lavender" value={money(opp.value)} label={open ? 'Estimated value (not confirmed)' : opp.stage === 'Closed Won' ? 'Won value (confirmed)' : 'Value (lost)'} />
            <IconStat icon={Chart} tone="sky" value={`${opp.probability}%`} label={`Probability (stage default ${db.settings.stageProbabilities[opp.stage]}%)`} />
            <IconStat icon={Activity} tone="sun" value={open ? money(weightedValue(opp)) : '—'} label="Weighted value" />
            <IconStat icon={Calendar} tone="pink" value={opp.expectedCloseDate ? fullDate(opp.expectedCloseDate) : 'Not set'} label="Expected close" />
          </div>
        </div>
        <Card>
          <CardHeader title="Stage" action={<span className="text-[11px] text-faint">Click a stage to move</span>} />
          <StageStepper opp={opp} />
        </Card>

        <Card>
          <CardHeader title="Problem & proposed solution" action={<button className="link-muted" onClick={() => setModal('edit')}>Edit</button>} />
          <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <KV label="Problem statement" value={opp.problemStatement} className="sm:col-span-2" />
            <KV label="Proposed solution" value={opp.proposedSolution} className="sm:col-span-2" />
            <KV label="Competitors" value={opp.competitors} />
            <KV label="Delivery timeline" value={opp.deliveryTimeline} />
            {opp.stage === 'Closed Lost' && <KV label="Lost reason" value={[opp.lostReason, opp.lostNote].filter(Boolean).join(' — ')} className="sm:col-span-2" />}
          </dl>
        </Card>

        <Card>
          <CardHeader title={`Proposals (${r.proposals.length})`} action={<button className="btn-soft" onClick={() => setModal('proposal')}><Add size={14} color="currentColor" />New proposal</button>} />
          {r.proposals.length === 0 ? <Empty text={open ? 'No proposal yet. Create one when the solution is defined.' : 'No proposals were recorded.'} /> : (
            <ul className="divide-y divide-line">
              {r.proposals.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                  <button onClick={() => setEditProposal(p)} className="min-w-0 flex-1 text-left hover:text-sky-accent">
                    <p className="truncate text-[14px] font-medium">{p.title}</p>
                    <p className="text-[11px] text-muted">{p.code} · {money(p.price)} · {p.deliveryTimeline ?? 'timeline not set'} · {p.sentAt ? `sent ${timeAgo(p.sentAt)}` : `updated ${timeAgo(p.updatedAt)}`}</p>
                  </button>
                  <Dropdown size="sm" className="w-36" label="Proposal status" value={p.status} options={PROPOSAL_STATUSES} display={<Pill dot={false} className="px-2 py-0">{p.status}</Pill>} onChange={(s) => attempt(() => update('proposals', p.id, { status: s }, `Proposal ${s}`))} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <TaskList tasks={r.tasks} defaults={{ opportunityId: opp.id, leadId: opp.leadId, companyId: opp.companyId }} />
        <Timeline activities={r.activities} defaults={{ opportunityId: opp.id, leadId: opp.leadId, companyId: opp.companyId, contactId: opp.contactId }} />
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <NextActionCard
          action={opp.nextAction ?? nextTask?.title ?? null}
          date={opp.nextAction ? opp.nextActionDate : nextTask?.dueDate ?? null}
          source={opp.nextAction ? 'Opportunity next action' : nextTask ? `${nextTask.type} task` : ''}
          playbook={PLAYBOOK[opp.stage]}
          onPlan={() => setModal('task')}
          extra={open && (nextAction ? (
            <div className="mt-3 space-y-2">
              <input className="input bg-white" aria-label="Next action" value={nextAction.text} onChange={(e) => setNextAction({ ...nextAction, text: e.target.value })} placeholder="Next action" />
              <input className="input bg-white" type="date" aria-label="Next action date" value={nextAction.date} onChange={(e) => setNextAction({ ...nextAction, date: e.target.value })} />
              <div className="flex gap-2">
                <button className="btn-soft" onClick={async () => { const ok = await attempt(() => update('opportunities', opp.id, { nextAction: nextAction.text, nextActionDate: nextAction.date }, 'Next action')); if (ok) setNextAction(null) }}>Save</button>
                <button className="btn-ghost btn-sm" onClick={() => setNextAction(null)}>Cancel</button>
              </div>
            </div>
          ) : <button className="link-accent mt-2" onClick={() => setNextAction({ text: opp.nextAction ?? '', date: opp.nextActionDate ?? '' })}>Edit next action</button>)}
        />
        <InsightsCard insights={insights} />
        <AiAssistant opportunity={opp} />
        <Card>
          <CardHeader title="Stage history" />
          <ol className="space-y-3">
            {r.history.map((h) => (
              <li key={h.id} className="flex justify-between gap-3 text-[12px]">
                <span>{h.fromStage ? <>{h.fromStage} → <b>{h.toStage}</b></> : <>Created in <b>{h.toStage}</b></>}<span className="block text-[11px] text-faint">{h.userId ? userById.get(h.userId)?.name : 'System'}</span></span>
                <span className="whitespace-nowrap text-[11px] text-muted">{fullDate(h.changedAt.slice(0, 10))}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] text-muted">Next action due: <DueLabel date={opp.nextActionDate} /></p>
        </Card>
        {opp.stage === 'Closed Won' && (
          <Card><CardHeader title="Won" /><p className="text-[12px] text-muted">This is confirmed revenue. Create invoices for delivery milestones under <Link className="text-sky-accent" to="/invoices">Invoices</Link>.</p><Pill className="mt-2">Closed Won</Pill></Card>
        )}
      </div>

      <OpportunityForm open={modal === 'edit'} opportunity={opp} onClose={() => setModal(null)} />
      <TaskForm open={modal === 'task'} onClose={() => setModal(null)} defaults={{ opportunityId: opp.id, leadId: opp.leadId, companyId: opp.companyId, title: PLAYBOOK[opp.stage] }} />
      <EventForm open={modal === 'meeting'} onClose={() => setModal(null)} defaults={{ opportunityId: opp.id, leadId: opp.leadId, companyId: opp.companyId, title: `${opp.name} — ${company?.name ?? ''}`, kind: 'Technical Discussion' }} />
      <ProposalForm open={modal === 'proposal' || !!editProposal} proposal={editProposal ?? undefined} opportunityId={opp.id} onClose={() => { setModal(null); setEditProposal(null) }} />
      <ConfirmModal open={modal === 'delete'} onClose={() => setModal(null)} text={`Delete “${opp.name}”? Its proposals, tasks and history are deleted too.`}
        onConfirm={async () => { const ok = await attempt(() => remove('opportunities', opp.id, opp.name)); if (ok !== undefined) navigate('/opportunities') }} />
    </div>
  )
}
