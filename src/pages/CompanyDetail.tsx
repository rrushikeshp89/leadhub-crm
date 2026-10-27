import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Activity, Add, Building, Chart, Edit2, Global, Location, MedalStar, People, Receipt2, Trash } from 'iconsax-react'
import { isOpen, pipelineSummary, weightedValue } from '../../shared/calc'
import type { Contact } from '../../shared/model'
import { useLookups, useStore } from '../store/Store'
import { Avatar, Card, CardHeader, ConfirmModal, Empty, Pill, Unknown, IconAction } from '../components/ui'
import { Hero, HeroBadge, HeroMeta, TaskList, Timeline } from '../components/crm'
import { CompanyForm, ContactForm, LeadIntakeForm, OpportunityForm } from '../components/forms'
import { IconStat } from '../components/widgets'
import { useMoney } from '../lib/hooks'
import { fullDate } from '../lib/format'
import { C } from '../lib/theme'

export default function CompanyDetail() {
  const { id } = useParams()
  const { db, update, remove, attempt } = useStore()
  const { userById, contactById } = useLookups()
  const money = useMoney()
  const navigate = useNavigate()
  const company = db.companies.find((c) => c.id === id)
  const [modal, setModal] = useState<null | 'edit' | 'lead' | 'opp' | 'contact' | 'delete'>(null)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [notes, setNotes] = useState(company?.notes ?? '')
  useEffect(() => { setNotes(company?.notes ?? '') }, [company?.notes])

  const r = useMemo(() => company && ({
    contacts: db.contacts.filter((c) => c.companyId === company.id),
    leads: db.leads.filter((l) => l.companyId === company.id),
    opps: db.opportunities.filter((o) => o.companyId === company.id),
    tasks: db.tasks.filter((t) => t.companyId === company.id),
    activities: db.activities.filter((a) => a.companyId === company.id),
    invoices: db.invoices.filter((i) => i.companyId === company.id),
  }), [company, db.contacts, db.leads, db.opportunities, db.tasks, db.activities, db.invoices])

  if (!company || !r) return <Card><Empty text="This company does not exist or was deleted." /><div className="pb-6 text-center"><Link to="/companies" className="btn-primary">Back to companies</Link></div></Card>
  const s = pipelineSummary(r.opps)
  const activeLeads = r.leads.filter((l) => l.status !== 'Disqualified')
  const openOpps = r.opps.filter((o) => isOpen(o.stage))
  const closed = r.opps.filter((o) => !isOpen(o.stage)).sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))
  const invoiced = r.invoices.reduce((a, i) => a + i.subtotal + i.tax - i.discount, 0)

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Hero
            eyebrow={<>{company.code} · Company</>}
            title={company.name}
            subtitle={<span className="text-ink/80">{company.description ?? <Unknown text="No company profile yet" />}</span>}
            media={<span className="flex h-[104px] w-[104px] items-center justify-center rounded-full border-4 border-white bg-white"><Building size={40} color={C.skyAccent} variant="Bold" /></span>}
            onEdit={() => setModal('edit')}
            meta={<>
              <HeroMeta icon={Building}>{company.industry ?? 'Industry unknown'}</HeroMeta>
              <HeroMeta icon={People}>{company.size ? `${company.size} employees` : 'Size unknown'}</HeroMeta>
              <HeroMeta icon={Location}>{company.location ?? 'Location unknown'}</HeroMeta>
              <HeroMeta icon={Global}>{company.website ? <a href={company.website} target="_blank" rel="noreferrer" className="hover:underline">{company.website.replace(/^https?:\/\//, '')}</a> : 'No website'}</HeroMeta>
            </>}
            badges={<HeroBadge>Owner: {company.ownerId ? userById.get(company.ownerId)?.name : 'Unassigned'}</HeroBadge>}
            actions={<>
              <button className="btn-white btn-sm" onClick={() => setModal('lead')}><Add size={14} color="currentColor" />New lead</button>
              <button className="btn-white btn-sm" onClick={() => setModal('opp')}><Add size={14} color="currentColor" />New opportunity</button>
              <button className="btn-white btn-sm" onClick={() => setModal('contact')}><Add size={14} color="currentColor" />Add contact</button>
            </>}
            danger={<button className="btn-quiet-danger btn-sm" onClick={() => setModal('delete')}><Trash size={14} color="currentColor" />Delete</button>}
          />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <IconStat icon={Chart} tone="sky" value={money(s.openValue)} label={`Potential pipeline · ${s.openCount} open`} />
            <IconStat icon={Activity} tone="lavender" value={money(s.weightedValue)} label="Weighted pipeline" />
            <IconStat icon={MedalStar} tone="sun" value={money(s.wonValue)} label={`Closed-won revenue · ${s.wonCount} deal${s.wonCount === 1 ? '' : 's'}`} />
            <IconStat icon={Receipt2} tone="pink" value={money(invoiced)} label={`Invoiced · ${r.invoices.length}`} />
          </div>
        </div>

        <Card>
          <CardHeader title={`Open opportunities (${openOpps.length})`} action={<button className="btn-soft" onClick={() => setModal('opp')}><Add size={14} color="currentColor" />New</button>} />
          {openOpps.length === 0 ? <Empty text="No open opportunities." /> : (
            <ul className="divide-y divide-line">
              {openOpps.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Link to={`/opportunities/${o.id}`} className="min-w-0 flex-1 hover:text-sky-accent"><p className="truncate text-[14px] font-medium">{o.name}</p><p className="text-[11px] text-muted">{o.services.join(', ')} · {o.contactId ? contactById.get(o.contactId)?.name : 'No contact'}</p></Link>
                  <Pill>{o.stage}</Pill>
                  <span className="w-40 text-right text-[12px]">{money(o.value)}<span className="block text-[11px] text-muted">weighted {money(weightedValue(o))} · {o.probability}%</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={`Active leads (${activeLeads.length})`} action={<button className="btn-soft" onClick={() => setModal('lead')}><Add size={14} color="currentColor" />New</button>} />
          {activeLeads.length === 0 ? <Empty text="No active leads." /> : (
            <ul className="divide-y divide-line">
              {activeLeads.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Link to={`/leads/${l.id}`} className="min-w-0 flex-1 hover:text-sky-accent"><p className="truncate text-[14px] font-medium">{l.title}</p><p className="text-[11px] text-muted">{contactById.get(l.contactId)?.name} · {l.services.join(', ') || 'No services yet'}</p></Link>
                  <Pill>{l.status}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={`Previous deals (${closed.length})`} />
          {closed.length === 0 ? <p className="text-[12px] text-muted">No closed deals yet.</p> : (
            <ul className="divide-y divide-line">
              {closed.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Link to={`/opportunities/${o.id}`} className="min-w-0 flex-1 hover:text-sky-accent"><p className="truncate text-[13px] font-medium">{o.name}</p><p className="text-[11px] text-muted">Closed {o.closedAt ? fullDate(o.closedAt.slice(0, 10)) : '—'}{o.lostReason ? ` · ${o.lostReason}` : ''}</p></Link>
                  <Pill>{o.stage}</Pill>
                  <span className="w-32 text-right text-[12px]">{money(o.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Timeline title="Interaction history" activities={r.activities} defaults={{ companyId: company.id }} />
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader title={`Contacts (${r.contacts.length})`} action={<button className="btn-soft" onClick={() => setModal('contact')}><Add size={14} color="currentColor" />Add</button>} />
          {r.contacts.length === 0 ? <Empty text="No contacts yet." /> : (
            <ul className="space-y-4">
              {r.contacts.map((c) => (
                <li key={c.id} className="flex items-start gap-3">
                  <Avatar src={c.avatar} name={c.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{c.name}{c.isDecisionMaker && <span className="ml-2 rounded bg-sky-light px-1.5 text-[11px] font-normal">Decision maker</span>}</p>
                    <p className="text-[11px] text-muted">{c.title ?? 'Title unknown'}</p>
                    <p className="truncate text-[11px] text-muted">{c.email ?? 'No email'}{c.phone ? ` · ${c.phone}` : ''}</p>
                    <p className="text-[11px] text-faint">{r.leads.filter((l) => l.contactId === c.id).map((l) => l.title).join(' · ') || 'No leads'}</p>
                  </div>
                  <IconAction label={`Edit ${c.name}`} onClick={() => setEditContact(c)}><Edit2 size={18} color={C.muted} /></IconAction>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Notes" />
          <textarea aria-label="Company notes" className="input h-36 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Account notes, history, context…" />
          <div className="mt-2 flex justify-end"><button className="btn-soft" disabled={(company.notes ?? '') === notes} onClick={() => attempt(() => update('companies', company.id, { notes }, 'Notes'))}>Save notes</button></div>
        </Card>
        <TaskList tasks={r.tasks} defaults={{ companyId: company.id }} showRelated />
      </div>

      <CompanyForm open={modal === 'edit'} company={company} onClose={() => setModal(null)} />
      <LeadIntakeForm open={modal === 'lead'} companyId={company.id} onClose={() => setModal(null)} onCreated={(l) => navigate(`/leads/${l.id}`)} />
      <OpportunityForm open={modal === 'opp'} companyId={company.id} onClose={() => setModal(null)} onSaved={(o) => navigate(`/opportunities/${o.id}`)} />
      <ContactForm open={modal === 'contact' || !!editContact} contact={editContact ?? undefined} companyId={company.id} onClose={() => { setModal(null); setEditContact(null) }} />
      <ConfirmModal open={modal === 'delete'} onClose={() => setModal(null)} text={`Delete ${company.name}? This only works when it has no leads, opportunities or invoices.`}
        onConfirm={async () => { const ok = await attempt(() => remove('companies', company.id, company.name)); if (ok !== undefined) navigate('/companies') }} />
    </div>
  )
}
