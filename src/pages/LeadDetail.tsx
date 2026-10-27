import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Add, Building, Calendar, Call, Chart, DollarCircle, Link1, Sms, Star1, Trash } from 'iconsax-react'
import { LEAD_STATUSES, type LeadStatus } from '../../shared/model'
import { isOpen, qualificationScore, weightedValue } from '../../shared/calc'
import { useLookups, useStore } from '../store/Store'
import { Avatar, Card, CardHeader, ConfirmModal, Dropdown, Empty, Field, KV, Modal, Pill, Tabs, Unknown } from '../components/ui'
import { AgendaList, IconStat } from '../components/widgets'
import { AiAssistant, DueLabel, Hero, HeroBadge, HeroMeta, InsightsCard, NextActionCard, QualificationCard, TaskList, TempPill, Timeline } from '../components/crm'
import { ContactForm, EventForm, LeadForm, OpportunityForm, TaskForm } from '../components/forms'
import { leadInsights, LEAD_PLAYBOOK } from '../lib/insights'
import { useMoney } from '../lib/hooks'
import { fullDate, isoDate } from '../lib/format'

type Tab = 'overview' | 'opportunities' | 'proposals' | 'contacts'

export default function LeadDetail() {
  const { id } = useParams()
  const { db, update, remove, attempt } = useStore()
  const { companyById, contactById, userById } = useLookups()
  const money = useMoney()
  const navigate = useNavigate()
  const lead = db.leads.find((l) => l.id === id)
  const [tab, setTab] = useState<Tab>('overview')
  const [modal, setModal] = useState<null | 'edit' | 'opp' | 'meeting' | 'task' | 'contact' | 'delete' | 'disqualify'>(null)
  const [reason, setReason] = useState('')

  const related = useMemo(() => {
    if (!lead) return null
    const opportunities = db.opportunities.filter((o) => o.leadId === lead.id)
    const oppIds = new Set(opportunities.map((o) => o.id))
    return {
      opportunities,
      proposals: db.proposals.filter((p) => oppIds.has(p.opportunityId)),
      tasks: db.tasks.filter((t) => t.leadId === lead.id || (t.opportunityId && oppIds.has(t.opportunityId))),
      activities: db.activities.filter((a) => a.leadId === lead.id || (a.opportunityId && oppIds.has(a.opportunityId))),
      events: db.events.filter((e) => (e.leadId === lead.id || (e.opportunityId && oppIds.has(e.opportunityId))) && e.date >= isoDate(new Date())).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
      contacts: db.contacts.filter((c) => c.companyId === lead.companyId),
    }
  }, [lead, db.opportunities, db.proposals, db.tasks, db.activities, db.events, db.contacts])

  if (!lead || !related) {
    return <Card><Empty text="This lead does not exist or was deleted." /><div className="pb-6 text-center"><Link to="/leads" className="btn-primary">Back to leads</Link></div></Card>
  }
  const company = companyById.get(lead.companyId)
  const contact = contactById.get(lead.contactId)
  const owner = lead.ownerId ? userById.get(lead.ownerId) : undefined
  const q = qualificationScore(lead.qualification, db.settings.qualification)
  const nextTask = related.tasks.filter((t) => t.status === 'Open').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const insights = leadInsights(lead, db)
  const playbook = LEAD_PLAYBOOK[lead.status]

  const setStatus = (s: LeadStatus) => {
    if (s === 'Disqualified') { setReason(''); setModal('disqualify'); return }
    void attempt(() => update('leads', lead.id, { status: s }, `Status set to ${s}`))
  }


  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        {/* Header (the template's "Welcome" card) */}
        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Hero
            eyebrow={<>{lead.code} · Lead</>}
            title={lead.title}
            subtitle={<>{contact?.name}{contact?.title && <span className="text-ink/70"> · {contact.title}</span>}{contact?.isDecisionMaker && <span className="ml-2 rounded-md bg-white/70 px-2 py-0.5 text-[11px]">Decision maker</span>}</>}
            media={<Avatar src={contact?.avatar} name={contact?.name ?? '?'} size={104} className="rounded-full border-4 border-white" />}
            onEdit={() => setModal('edit')}
            meta={<>
              <HeroMeta icon={Building}><Link to={`/companies/${lead.companyId}`} className="hover:underline">{company?.name}</Link>{company?.industry && <span className="text-ink/60"> · {company.industry}</span>}</HeroMeta>
              <HeroMeta icon={Calendar}>Created {fullDate(lead.createdAt.slice(0, 10))}</HeroMeta>
              <HeroMeta icon={Sms}>{contact?.email ? <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a> : <Unknown text="No email" />}</HeroMeta>
              <HeroMeta icon={Call}>{contact?.phone ?? <Unknown text="No phone" />}{lead.preferredContact && <span className="text-ink/60"> · prefers {lead.preferredContact}</span>}</HeroMeta>
              {contact?.linkedin && <HeroMeta icon={Link1}><a href={contact.linkedin} target="_blank" rel="noreferrer" className="hover:underline">LinkedIn profile</a></HeroMeta>}
            </>}
            badges={<>
              <Dropdown variant="white" label="Lead status" value={lead.status} options={LEAD_STATUSES} onChange={setStatus} />
              <HeroBadge>Temp: <TempPill t={lead.temperature} /></HeroBadge>
              <HeroBadge>Owner: {owner?.name ?? 'Unassigned'}</HeroBadge>
              <HeroBadge>Source: {lead.source ?? 'Unknown'}</HeroBadge>
            </>}
            actions={<>
              <button className="btn-white btn-sm" onClick={() => setModal('meeting')}><Calendar size={14} color="currentColor" />Schedule meeting</button>
              <button className="btn-white btn-sm" onClick={() => setModal('task')}><Add size={14} color="currentColor" />Follow-up task</button>
              <button className="btn-white btn-sm" onClick={() => setModal('opp')}><DollarCircle size={14} color="currentColor" />New opportunity</button>
            </>}
            danger={<button className="btn-quiet-danger btn-sm" onClick={() => setModal('delete')}><Trash size={14} color="currentColor" />Delete</button>}
          />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <IconStat icon={Star1} tone="sky" value={q.answered ? `${q.score}/100` : '—'} label={`Qualification (${q.answered}/${q.total})`} />
            <IconStat icon={DollarCircle} tone="lavender" value={lead.estimatedValue !== null ? money(lead.estimatedValue) : 'Unknown'} label="Estimated deal value" />
            <IconStat icon={Chart} tone="sun" value={lead.probability !== null ? `${lead.probability}%` : 'Unknown'} label="Probability of conversion" />
            <IconStat icon={Calendar} tone="pink" value={<DueLabel date={lead.nextFollowUp} />} label="Next follow-up" />
          </div>
        </div>

        {/* Details */}
        <Card>
          <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[
            { key: 'overview', label: 'Requirements' }, { key: 'opportunities', label: 'Opportunities', count: related.opportunities.length },
            { key: 'proposals', label: 'Proposals', count: related.proposals.length }, { key: 'contacts', label: 'Company contacts', count: related.contacts.length },
          ]} />
          {tab === 'overview' && (
            <div className="space-y-6">
              <div>
                <p className="section-title mb-2">Primary business problem</p>
                <p className="text-[13px] leading-relaxed">{lead.businessProblem ?? <Unknown text="Not captured yet" />}</p>
              </div>
              <div>
                <p className="section-title mb-2">Solution interest</p>
                {lead.services.length ? <div className="flex flex-wrap gap-2">{lead.services.map((s) => <span key={s} className="rounded-full bg-lavender-light px-3 py-1 text-[12px]">{s}</span>)}</div> : <Unknown text="No services selected" />}
              </div>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <KV label="Desired solution" value={lead.desiredSolution} className="sm:col-span-2 lg:col-span-3" />
                <KV label="Project type" value={lead.projectType} />
                <KV label="Engagement model" value={lead.engagementModel} />
                <KV label="Project timeline" value={lead.timeline} />
                <KV label="Estimated budget (prospect)" value={lead.estimatedBudget !== null ? money(lead.estimatedBudget) : null} />
                <KV label="Budget readiness" value={lead.budgetReadiness} />
                <KV label="Expected decision date" value={lead.expectedDecisionDate ? fullDate(lead.expectedDecisionDate) : null} />
                <KV label="Current tech stack" value={lead.techStack} />
                <KV label="Existing systems & tools" value={lead.existingSystems} />
                <KV label="Technical complexity" value={lead.technicalComplexity} />
                <KV label="Key decision makers" value={lead.decisionMakers} className="sm:col-span-2" />
                <KV label="Company size" value={company?.size} />
                <KV label="Additional requirements" value={lead.additionalRequirements} className="sm:col-span-2 lg:col-span-3" />
                {lead.status === 'Disqualified' && <KV label="Disqualification reason" value={lead.disqualifyReason} className="sm:col-span-2 lg:col-span-3" />}
              </dl>
              <button className="link-accent" onClick={() => setModal('edit')}>Edit requirements</button>
            </div>
          )}
          {tab === 'opportunities' && (
            <div>
              <div className="mb-3 flex justify-end"><button className="btn-soft" onClick={() => setModal('opp')}><Add size={14} color="currentColor" />New opportunity</button></div>
              {related.opportunities.length === 0 ? <Empty text="No opportunities yet. Create one once there is a credible need." /> : (
                <ul className="divide-y divide-line">
                  {related.opportunities.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                      <Link to={`/opportunities/${o.id}`} className="min-w-0 flex-1 hover:text-sky-accent">
                        <p className="truncate text-[14px] font-medium">{o.name}</p>
                        <p className="text-[11px] text-muted">{o.code} · {o.services.join(', ')}</p>
                      </Link>
                      <Pill>{o.stage}</Pill>
                      <span className="w-36 text-right text-[12px]">{money(o.value)}<span className="block text-[11px] text-muted">{isOpen(o.stage) ? `weighted ${money(weightedValue(o))}` : o.stage === 'Closed Won' ? 'won' : 'lost'}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {tab === 'proposals' && (
            related.proposals.length === 0 ? <Empty text="No proposals yet. Create one from an opportunity in Solution Design." /> : (
              <ul className="divide-y divide-line">
                {related.proposals.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Link to={`/proposals?id=${p.id}`} className="min-w-0 flex-1 hover:text-sky-accent"><p className="truncate text-[14px] font-medium">{p.title}</p><p className="text-[11px] text-muted">{p.code} · updated {fullDate(p.updatedAt.slice(0, 10))}</p></Link>
                    <Pill>{p.status}</Pill>
                    <span className="w-32 text-right text-[12px]">{money(p.price)}</span>
                  </li>
                ))}
              </ul>
            )
          )}
          {tab === 'contacts' && (
            <div>
              <div className="mb-3 flex justify-end"><button className="btn-soft" onClick={() => setModal('contact')}><Add size={14} color="currentColor" />Add contact</button></div>
              <ul className="divide-y divide-line">
                {related.contacts.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-3">
                    <Avatar src={c.avatar} name={c.name} size={36} />
                    <div className="min-w-0 flex-1"><p className="text-[13px]">{c.name}{c.id === lead.contactId && <span className="ml-2 rounded bg-sky-light px-1.5 text-[11px]">Primary</span>}</p><p className="text-[11px] text-muted">{c.title ?? 'Title unknown'}{c.email ? ` · ${c.email}` : ''}</p></div>
                    {c.isDecisionMaker && <span className="text-[11px] text-muted">Decision maker</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <TaskList tasks={related.tasks} defaults={{ leadId: lead.id, companyId: lead.companyId }} showRelated />
        <Timeline activities={related.activities} defaults={{ leadId: lead.id, companyId: lead.companyId, contactId: lead.contactId }} />
      </div>

      {/* Side column */}
      <div className="flex min-w-0 flex-col gap-6">
        <NextActionCard
          action={nextTask?.title ?? (lead.nextFollowUp ? `Follow up with ${contact?.name ?? 'the contact'}` : null)}
          date={nextTask?.dueDate ?? lead.nextFollowUp}
          source={nextTask ? `${nextTask.type} · ${nextTask.priority} priority` : 'Lead follow-up date'}
          playbook={playbook}
          onPlan={() => setModal('task')}
        />
        <InsightsCard insights={insights} />
        <AiAssistant lead={lead} />
        <QualificationCard lead={lead} />
        <Card>
          <CardHeader title="Upcoming meetings" action={<button className="btn-soft" onClick={() => setModal('meeting')}><Add size={14} color="currentColor" />Schedule</button>} />
          <AgendaList variant="timeline" events={related.events.slice(0, 5)} empty="No meetings booked with this lead." />
        </Card>
      </div>

      {modal === 'edit' && <LeadForm open onClose={() => setModal(null)} lead={lead} />}
      <OpportunityForm open={modal === 'opp'} onClose={() => setModal(null)} lead={lead} onSaved={(o) => navigate(`/opportunities/${o.id}`)} />
      <EventForm open={modal === 'meeting'} onClose={() => setModal(null)} defaults={{ leadId: lead.id, companyId: lead.companyId, title: `Discovery — ${company?.name ?? lead.title}`, kind: lead.status === 'New Lead' || lead.status === 'Contacted' ? 'Discovery Meeting' : 'Technical Discussion' }} />
      <TaskForm open={modal === 'task'} onClose={() => setModal(null)} defaults={{ leadId: lead.id, companyId: lead.companyId, title: playbook }} />
      <ContactForm open={modal === 'contact'} onClose={() => setModal(null)} companyId={lead.companyId} />
      <ConfirmModal open={modal === 'delete'} onClose={() => setModal(null)} text="Delete this lead? Its tasks and activity history are deleted too. Opportunities stay with the company."
        onConfirm={async () => { const ok = await attempt(() => remove('leads', lead.id, 'Lead')); if (ok !== undefined) navigate('/leads') }} />
      <Modal open={modal === 'disqualify'} onClose={() => setModal(null)} title="Disqualify lead" width={460}
        footer={<><button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn-danger" onClick={async () => { const r = await attempt(() => update('leads', lead.id, { status: 'Disqualified', disqualifyReason: reason }, 'Lead disqualified')); if (r) setModal(null) }}>Disqualify</button></>}>
        <Field label="Reason (recommended)"><textarea className="input h-20 py-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. No budget this year; revisit in Q2" /></Field>
      </Modal>
    </div>
  )
}
