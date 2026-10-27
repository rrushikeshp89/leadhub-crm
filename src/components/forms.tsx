import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BUDGET_READINESS, COMPANY_SIZES, COMPLEXITY, CONTACT_METHODS, ENGAGEMENT_MODELS, EVENT_KINDS, INDUSTRIES, INVOICE_STATUSES,
  LEAD_SOURCES, LEAD_STATUSES, LOGGABLE_ACTIVITY_TYPES, LOST_REASONS, PROJECT_TYPES, PROPOSAL_STATUSES, ROLES, SERVICE_CATEGORIES,
  SERVICE_GROUPS, STAGES, TASK_PRIORITIES, TASK_TYPES, TEMPERATURES,
  type CalEvent, type Campaign, type Company, type Contact, type Invoice, type Lead, type Opportunity, type Proposal, type Service,
  type Stage, type Task, type User,
} from '../../shared/model'
import { todayIso } from '../../shared/calc'
import { ApiError, post } from '../lib/api'
import { useStore } from '../store/Store'
import { Chips, Field, Modal, Notice, SelectInput } from './ui'
import { cx } from '../lib/format'

/* ================= form plumbing ================= */

type Errors = Record<string, string>

function useForm<T extends Record<string, unknown>>(open: boolean, initial: () => T) {
  const [v, setV] = useState<T>(initial)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setV(initial()); setErrors({}); setFormError(null) } }, [open])
  const set = <K extends keyof T>(k: K, val: T[K]) => {
    setV((d) => ({ ...d, [k]: val }))
    setErrors((e) => { if (!e[k as string]) return e; const n = { ...e }; delete n[k as string]; return n })
  }
  /** Runs the request; maps server validation errors back onto fields. Returns true on success. */
  const submit = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErrors({}); setFormError(null)
    try { await fn(); return true } catch (e) {
      if (e instanceof ApiError) { setErrors(e.fields); setFormError(e.message) } else setFormError('Something went wrong')
      return false
    } finally { setBusy(false) }
  }
  return { v, set, setV, errors, setErrors, formError, setFormError, busy, submit }
}

function FormModal({ open, onClose, title, onSubmit, children, busy, formError, width = 680, submitLabel = 'Save', extraFooter }: {
  open: boolean; onClose: () => void; title: string; onSubmit: () => void; children: ReactNode; busy?: boolean; formError?: string | null; width?: number; submitLabel?: string; extraFooter?: ReactNode
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={width}
      footer={<>{extraFooter}<button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn-primary" disabled={busy} onClick={onSubmit}>{busy ? 'Saving…' : submitLabel}</button></>}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
        {formError && <Notice tone="danger" className="mb-4">{formError}</Notice>}
        {children}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

const Grid = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx('grid grid-cols-1 gap-4 sm:grid-cols-2', className)}>{children}</div>
const Section = ({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) => (
  <fieldset className="mb-6 last:mb-0">
    <legend className="mb-3 text-[13px] font-semibold text-ink">{title}{hint && <span className="ml-2 font-normal text-faint">{hint}</span>}</legend>
    {children}
  </fieldset>
)
const Text = ({ value, onChange, ...p }: { value: unknown; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) =>
  <input {...p} className="input" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
const Area = ({ value, onChange, rows = 3, placeholder }: { value: unknown; onChange: (v: string) => void; rows?: number; placeholder?: string }) =>
  <textarea className="input h-auto py-2" rows={rows} placeholder={placeholder} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
const Num = ({ value, onChange, placeholder, min = 0, max }: { value: unknown; onChange: (v: number | null) => void; placeholder?: string; min?: number; max?: number }) =>
  <input type="number" inputMode="decimal" min={min} max={max} className="input" placeholder={placeholder} value={value === null || value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />

function useOwnerOptions() {
  const { db } = useStore()
  return db.users.map((u) => ({ value: u.id, label: u.name }))
}

/* ================= Lead intake (create) ================= */

interface Dupes { companies: Company[]; contacts: Contact[]; leads: Lead[] }

export function LeadIntakeForm({ open, onClose, companyId: presetCompany, onCreated }: { open: boolean; onClose: () => void; companyId?: string; onCreated?: (lead: Lead) => void }) {
  const { db, me, refresh, toast } = useStore()
  const owners = useOwnerOptions()
  const f = useForm(open, () => ({
    companyMode: presetCompany ? 'existing' : 'new', companyId: presetCompany ?? '',
    companyName: '', website: '', industry: null as string | null, size: null as string | null, location: '',
    contactMode: 'new', contactId: '', name: '', email: '', phone: '', jobTitle: '', linkedin: '', isDecisionMaker: false, preferredContact: null as string | null,
    title: '', businessProblem: '', services: [] as string[], desiredSolution: '', projectType: null as string | null, timeline: '',
    estimatedBudget: null as number | null, budgetReadiness: null as string | null, source: null as string | null, temperature: null as string | null,
    ownerId: me.id, nextFollowUp: '', status: 'New Lead',
  }))
  const v = f.v
  const [dupes, setDupes] = useState<Dupes | null>(null)
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  useEffect(() => { if (open) { setDupes(null); setAllowDuplicate(false) } }, [open])

  const companyContacts = db.contacts.filter((c) => c.companyId === v.companyId)
  const check = async () => {
    if (v.companyMode !== 'new' && v.contactMode !== 'new') return
    const q = { companyName: v.companyMode === 'new' ? v.companyName : null, website: v.companyMode === 'new' ? v.website : null, email: v.contactMode === 'new' ? v.email : null }
    if (!q.companyName && !q.email && !q.website) return setDupes(null)
    try {
      const d = await post<Dupes>('/duplicates', q)
      setDupes(d.companies.length || d.contacts.length || d.leads.length ? d : null)
    } catch { /* duplicate check is advisory */ }
  }

  const save = async () => {
    const ok = await f.submit(async () => {
      const body = {
        company: v.companyMode === 'existing' ? { id: v.companyId } : { name: v.companyName, website: v.website, industry: v.industry, size: v.size, location: v.location },
        contact: v.contactMode === 'existing' ? { id: v.contactId } : { name: v.name, email: v.email, phone: v.phone, title: v.jobTitle, linkedin: v.linkedin, isDecisionMaker: v.isDecisionMaker, preferredContact: v.preferredContact },
        lead: {
          title: v.title, businessProblem: v.businessProblem, services: v.services, desiredSolution: v.desiredSolution, projectType: v.projectType,
          timeline: v.timeline, estimatedBudget: v.estimatedBudget, budgetReadiness: v.budgetReadiness, source: v.source, temperature: v.temperature,
          ownerId: v.ownerId, nextFollowUp: v.nextFollowUp, preferredContact: v.preferredContact, status: v.status,
        },
        allowDuplicate,
      }
      try {
        const r = await post<{ lead: Lead }>('/intake', body)
        await refresh()
        toast(`Lead “${r.lead.title}” added`)
        onCreated?.(r.lead)
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && e.details) {
          setDupes(e.details as unknown as Dupes)
          throw new ApiError(409, 'This looks like an existing record. Use the existing company/contact, or confirm to create anyway.')
        }
        // Prefix nested field errors (company.name → companyName) so they land on the right inputs
        if (e instanceof ApiError && e.details) {
          const map: Record<string, string> = { 'company.name': 'companyName', 'company.website': 'website', 'contact.name': 'name', 'contact.email': 'email', 'contact.linkedin': 'linkedin', 'lead.title': 'title', 'lead.estimatedBudget': 'estimatedBudget', 'lead.nextFollowUp': 'nextFollowUp', 'company.id': 'companyId', 'contact.id': 'contactId' }
          const fields: Record<string, string> = {}
          for (const [k, msg] of Object.entries(e.details)) if (typeof msg === 'string') fields[map[k] ?? k.split('.').pop()!] = msg
          throw new ApiError(e.status, e.message, fields)
        }
        throw e
      }
    })
    if (ok) onClose()
  }
  const err = f.errors

  return (
    <FormModal open={open} onClose={onClose} title="Add New Lead" onSubmit={save} busy={f.busy} formError={f.formError} width={760}
      submitLabel={allowDuplicate ? 'Create anyway' : 'Create lead'}>
      {dupes && (
        <Notice tone="warn" className="mb-5">
          <p className="font-medium">Possible duplicate</p>
          <ul className="mt-1 space-y-1">
            {dupes.companies.map((c) => (
              <li key={c.id}>Company <b>{c.name}</b> already exists — <button type="button" className="link-accent underline" onClick={() => { f.set('companyMode', 'existing'); f.set('companyId', c.id); setDupes(null) }}>use it</button></li>
            ))}
            {dupes.contacts.map((c) => (
              <li key={c.id}>Contact <b>{c.name}</b> ({c.email}) exists — <button type="button" className="link-accent underline" onClick={() => { f.set('companyMode', 'existing'); f.set('companyId', c.companyId); f.set('contactMode', 'existing'); f.set('contactId', c.id); setDupes(null) }}>use this contact</button></li>
            ))}
            {dupes.leads.map((l) => <li key={l.id}>Open lead <Link className="link-accent underline" to={`/leads/${l.id}`} onClick={onClose}>{l.title}</Link> ({l.status})</li>)}
          </ul>
          <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={allowDuplicate} onChange={(e) => setAllowDuplicate(e.target.checked)} /> This is a different organisation/person — create anyway</label>
        </Notice>
      )}

      <Section title="Who is the prospect’s company?">
        <div className="mb-3 flex gap-4 text-[13px]">
          <label className="flex items-center gap-2"><input type="radio" checked={v.companyMode === 'new'} onChange={() => { f.set('companyMode', 'new'); f.set('contactMode', 'new') }} /> New company</label>
          <label className="flex items-center gap-2"><input type="radio" checked={v.companyMode === 'existing'} onChange={() => f.set('companyMode', 'existing')} disabled={!db.companies.length} /> Existing company</label>
        </div>
        {v.companyMode === 'existing' ? (
          <Field label="Company *" error={err.companyId}>
            <SelectInput label="Company" value={v.companyId} onChange={(x) => { f.set('companyId', x ?? ''); f.set('contactId', '') }} options={db.companies.map((c) => ({ value: c.id, label: c.name }))} empty="Select a company" />
          </Field>
        ) : (
          <Grid>
            <Field label="Company name *" error={err.companyName}><Text value={v.companyName} onChange={(x) => f.set('companyName', x)} onBlur={check} autoFocus /></Field>
            <Field label="Website" error={err.website}><Text value={v.website} onChange={(x) => f.set('website', x)} onBlur={check} placeholder="company.com" /></Field>
            <Field label="Industry"><SelectInput label="Industry" value={v.industry} onChange={(x) => f.set('industry', x)} options={INDUSTRIES} /></Field>
            <Field label="Company size"><SelectInput label="Company size" value={v.size} onChange={(x) => f.set('size', x)} options={COMPANY_SIZES} /></Field>
            <Field label="Location" className="sm:col-span-2"><Text value={v.location} onChange={(x) => f.set('location', x)} placeholder="City, Country" /></Field>
          </Grid>
        )}
      </Section>

      <Section title="Who are we talking to?">
        {v.companyMode === 'existing' && companyContacts.length > 0 && (
          <div className="mb-3 flex gap-4 text-[13px]">
            <label className="flex items-center gap-2"><input type="radio" checked={v.contactMode === 'existing'} onChange={() => f.set('contactMode', 'existing')} /> Existing contact</label>
            <label className="flex items-center gap-2"><input type="radio" checked={v.contactMode === 'new'} onChange={() => f.set('contactMode', 'new')} /> New contact</label>
          </div>
        )}
        {v.contactMode === 'existing' && v.companyMode === 'existing' ? (
          <Field label="Contact *" error={err.contactId}>
            <SelectInput label="Contact" value={v.contactId} onChange={(x) => f.set('contactId', x ?? '')} options={companyContacts.map((c) => ({ value: c.id, label: `${c.name}${c.title ? ` — ${c.title}` : ''}` }))} empty="Select a contact" />
          </Field>
        ) : (
          <Grid>
            <Field label="Full name *" error={err.name}><Text value={v.name} onChange={(x) => f.set('name', x)} /></Field>
            <Field label="Work email" error={err.email}><Text type="email" value={v.email} onChange={(x) => f.set('email', x)} onBlur={check} /></Field>
            <Field label="Phone"><Text value={v.phone} onChange={(x) => f.set('phone', x)} /></Field>
            <Field label="Job title"><Text value={v.jobTitle} onChange={(x) => f.set('jobTitle', x)} placeholder="e.g. CTO" /></Field>
            <Field label="LinkedIn profile" error={err.linkedin}><Text value={v.linkedin} onChange={(x) => f.set('linkedin', x)} placeholder="linkedin.com/in/…" /></Field>
            <Field label="Preferred way to be contacted"><SelectInput label="Preferred contact" value={v.preferredContact} onChange={(x) => f.set('preferredContact', x)} options={CONTACT_METHODS} /></Field>
            <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" checked={v.isDecisionMaker} onChange={(e) => f.set('isDecisionMaker', e.target.checked)} /> This person is a decision maker</label>
          </Grid>
        )}
      </Section>

      <Section title="What do they want to solve?">
        <Grid>
          <Field label="Lead title *" error={err.title} className="sm:col-span-2" hint="A short name for the requirement, e.g. “AI customer support assistant”"><Text value={v.title} onChange={(x) => f.set('title', x)} /></Field>
          <Field label="Primary business problem" className="sm:col-span-2"><Area value={v.businessProblem} onChange={(x) => f.set('businessProblem', x)} /></Field>
          <Field label="Services of interest" className="sm:col-span-2"><Chips label="Services" options={SERVICE_CATEGORIES} value={v.services as (typeof SERVICE_CATEGORIES)[number][]} onChange={(x) => f.set('services', x)} /></Field>
          <Field label="Desired solution" className="sm:col-span-2"><Area rows={2} value={v.desiredSolution} onChange={(x) => f.set('desiredSolution', x)} /></Field>
          <Field label="Project type"><SelectInput label="Project type" value={v.projectType} onChange={(x) => f.set('projectType', x)} options={PROJECT_TYPES} /></Field>
          <Field label="Desired timeline"><Text value={v.timeline} onChange={(x) => f.set('timeline', x)} placeholder="e.g. 3 months" /></Field>
          <Field label={`Estimated budget (${db.settings.currency})`} error={err.estimatedBudget} hint="Prospect’s estimate — not confirmed revenue"><Num value={v.estimatedBudget} onChange={(x) => f.set('estimatedBudget', x)} placeholder="Unknown" /></Field>
          <Field label="Budget readiness"><SelectInput label="Budget readiness" value={v.budgetReadiness} onChange={(x) => f.set('budgetReadiness', x)} options={BUDGET_READINESS} /></Field>
        </Grid>
      </Section>

      <Section title="Ownership & follow-up">
        <Grid>
          <Field label="Lead source"><SelectInput label="Lead source" value={v.source} onChange={(x) => f.set('source', x)} options={LEAD_SOURCES} /></Field>
          <Field label="Temperature"><SelectInput label="Temperature" value={v.temperature} onChange={(x) => f.set('temperature', x)} options={TEMPERATURES} empty="Not set" /></Field>
          <Field label="Lead owner"><SelectInput label="Lead owner" value={v.ownerId} onChange={(x) => f.set('ownerId', x ?? me.id)} options={owners} empty={false} /></Field>
          <Field label="Next follow-up" error={err.nextFollowUp}><Text type="date" value={v.nextFollowUp} onChange={(x) => f.set('nextFollowUp', x)} /></Field>
        </Grid>
      </Section>
    </FormModal>
  )
}

/* ================= Lead edit ================= */

export function LeadForm({ open, onClose, lead }: { open: boolean; onClose: () => void; lead: Lead }) {
  const { db, update } = useStore()
  const owners = useOwnerOptions()
  const f = useForm(open, () => ({ ...lead }) as Lead & Record<string, unknown>)
  const v = f.v
  const err = f.errors
  const contacts = db.contacts.filter((c) => c.companyId === v.companyId)
  const save = async () => { if (await f.submit(() => update('leads', lead.id, v, 'Lead'))) onClose() }
  return (
    <FormModal open={open} onClose={onClose} title={`Edit lead — ${lead.code}`} onSubmit={save} busy={f.busy} formError={f.formError} width={800}>
      <Section title="Lead">
        <Grid>
          <Field label="Lead title *" error={err.title} className="sm:col-span-2"><Text value={v.title} onChange={(x) => f.set('title', x)} /></Field>
          <Field label="Company *" error={err.companyId}><SelectInput label="Company" value={v.companyId} onChange={(x) => { f.set('companyId', x ?? ''); f.set('contactId', '') }} options={db.companies.map((c) => ({ value: c.id, label: c.name }))} empty="Select a company" /></Field>
          <Field label="Primary contact *" error={err.contactId}><SelectInput label="Contact" value={v.contactId} onChange={(x) => f.set('contactId', x ?? '')} options={contacts.map((c) => ({ value: c.id, label: c.name }))} empty="Select a contact" /></Field>
        </Grid>
      </Section>
      <Section title="Qualification">
        <Grid>
          <Field label="Status"><SelectInput label="Status" value={v.status} onChange={(x) => f.set('status', (x ?? 'New Lead') as Lead['status'])} options={LEAD_STATUSES} empty={false} /></Field>
          <Field label="Temperature"><SelectInput label="Temperature" value={v.temperature} onChange={(x) => f.set('temperature', x as Lead['temperature'])} options={TEMPERATURES} empty="Not set" /></Field>
          {v.status === 'Disqualified' && <Field label="Disqualification reason" className="sm:col-span-2"><Text value={v.disqualifyReason} onChange={(x) => f.set('disqualifyReason', x)} /></Field>}
          <Field label="Lead source"><SelectInput label="Source" value={v.source} onChange={(x) => f.set('source', x)} options={LEAD_SOURCES} /></Field>
          <Field label="Lead owner"><SelectInput label="Owner" value={v.ownerId} onChange={(x) => f.set('ownerId', x)} options={owners} empty="Unassigned" /></Field>
          <Field label={`Estimated project budget (${db.settings.currency})`} error={err.estimatedBudget}><Num value={v.estimatedBudget} onChange={(x) => f.set('estimatedBudget', x)} placeholder="Unknown" /></Field>
          <Field label={`Estimated deal value (${db.settings.currency})`} error={err.estimatedValue}><Num value={v.estimatedValue} onChange={(x) => f.set('estimatedValue', x)} placeholder="Unknown" /></Field>
          <Field label="Probability of conversion (%)" error={err.probability}><Num value={v.probability} onChange={(x) => f.set('probability', x)} max={100} placeholder="Unknown" /></Field>
          <Field label="Budget readiness"><SelectInput label="Budget readiness" value={v.budgetReadiness} onChange={(x) => f.set('budgetReadiness', x)} options={BUDGET_READINESS} /></Field>
          <Field label="Expected decision date" error={err.expectedDecisionDate}><Text type="date" value={v.expectedDecisionDate} onChange={(x) => f.set('expectedDecisionDate', x)} /></Field>
          <Field label="Next follow-up" error={err.nextFollowUp}><Text type="date" value={v.nextFollowUp} onChange={(x) => f.set('nextFollowUp', x)} /></Field>
        </Grid>
      </Section>
      <Section title="Business requirements">
        <Grid>
          <Field label="Primary business problem" className="sm:col-span-2"><Area value={v.businessProblem} onChange={(x) => f.set('businessProblem', x)} /></Field>
          <Field label="Desired solution" className="sm:col-span-2"><Area rows={2} value={v.desiredSolution} onChange={(x) => f.set('desiredSolution', x)} /></Field>
          <Field label="Current technology stack"><Text value={v.techStack} onChange={(x) => f.set('techStack', x)} /></Field>
          <Field label="Existing systems & tools"><Text value={v.existingSystems} onChange={(x) => f.set('existingSystems', x)} /></Field>
          <Field label="Project type"><SelectInput label="Project type" value={v.projectType} onChange={(x) => f.set('projectType', x)} options={PROJECT_TYPES} /></Field>
          <Field label="Preferred engagement model"><SelectInput label="Engagement model" value={v.engagementModel} onChange={(x) => f.set('engagementModel', x)} options={ENGAGEMENT_MODELS} /></Field>
          <Field label="Project timeline"><Text value={v.timeline} onChange={(x) => f.set('timeline', x)} /></Field>
          <Field label="Technical complexity"><SelectInput label="Technical complexity" value={v.technicalComplexity} onChange={(x) => f.set('technicalComplexity', x)} options={COMPLEXITY} /></Field>
          <Field label="Key decision makers" className="sm:col-span-2"><Text value={v.decisionMakers} onChange={(x) => f.set('decisionMakers', x)} /></Field>
          <Field label="Preferred contact method"><SelectInput label="Preferred contact" value={v.preferredContact} onChange={(x) => f.set('preferredContact', x)} options={CONTACT_METHODS} /></Field>
          <Field label="Additional requirements" className="sm:col-span-2"><Area rows={2} value={v.additionalRequirements} onChange={(x) => f.set('additionalRequirements', x)} /></Field>
          <Field label="Solution interest" className="sm:col-span-2"><Chips label="Services" options={SERVICE_CATEGORIES} value={v.services as (typeof SERVICE_CATEGORIES)[number][]} onChange={(x) => f.set('services', x)} /></Field>
        </Grid>
      </Section>
    </FormModal>
  )
}

/* ================= Company & contact ================= */

export function CompanyForm({ open, onClose, company, onSaved }: { open: boolean; onClose: () => void; company?: Company; onSaved?: (c: Company) => void }) {
  const { create, update } = useStore()
  const owners = useOwnerOptions()
  const f = useForm(open, () => (company ? { ...company } : { name: '', website: '', industry: null, size: null, location: '', description: '', notes: '', ownerId: null }) as Record<string, unknown>)
  const v = f.v, err = f.errors
  const save = async () => {
    if (await f.submit(async () => { const c = company ? await update('companies', company.id, v, 'Company') : await create('companies', v, 'Company'); onSaved?.(c) })) onClose()
  }
  return (
    <FormModal open={open} onClose={onClose} title={company ? 'Edit company' : 'Add company'} onSubmit={save} busy={f.busy} formError={f.formError}>
      <Grid>
        <Field label="Company name *" error={err.name}><Text value={v.name} onChange={(x) => f.set('name', x)} autoFocus /></Field>
        <Field label="Website" error={err.website}><Text value={v.website} onChange={(x) => f.set('website', x)} /></Field>
        <Field label="Industry"><SelectInput label="Industry" value={v.industry as string} onChange={(x) => f.set('industry', x)} options={INDUSTRIES} /></Field>
        <Field label="Company size"><SelectInput label="Size" value={v.size as string} onChange={(x) => f.set('size', x)} options={COMPANY_SIZES} /></Field>
        <Field label="Location"><Text value={v.location} onChange={(x) => f.set('location', x)} /></Field>
        <Field label="Account owner"><SelectInput label="Owner" value={v.ownerId as string} onChange={(x) => f.set('ownerId', x)} options={owners} empty="Unassigned" /></Field>
        <Field label="Company profile" className="sm:col-span-2"><Area value={v.description} onChange={(x) => f.set('description', x)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Area value={v.notes} onChange={(x) => f.set('notes', x)} /></Field>
      </Grid>
    </FormModal>
  )
}

export function ContactForm({ open, onClose, contact, companyId }: { open: boolean; onClose: () => void; contact?: Contact; companyId?: string }) {
  const { db, create, update } = useStore()
  const f = useForm(open, () => (contact ? { ...contact } : { companyId: companyId ?? '', name: '', email: '', phone: '', title: '', linkedin: '', preferredContact: null, isDecisionMaker: false }) as Record<string, unknown>)
  const v = f.v, err = f.errors
  const save = async () => { if (await f.submit(() => contact ? update('contacts', contact.id, v, 'Contact') : create('contacts', v, 'Contact'))) onClose() }
  return (
    <FormModal open={open} onClose={onClose} title={contact ? 'Edit contact' : 'Add contact'} onSubmit={save} busy={f.busy} formError={f.formError}>
      <Grid>
        <Field label="Company *" error={err.companyId}><SelectInput label="Company" value={v.companyId as string} onChange={(x) => f.set('companyId', x ?? '')} options={db.companies.map((c) => ({ value: c.id, label: c.name }))} empty="Select a company" /></Field>
        <Field label="Full name *" error={err.name}><Text value={v.name} onChange={(x) => f.set('name', x)} /></Field>
        <Field label="Job title"><Text value={v.title} onChange={(x) => f.set('title', x)} /></Field>
        <Field label="Work email" error={err.email}><Text type="email" value={v.email} onChange={(x) => f.set('email', x)} /></Field>
        <Field label="Phone"><Text value={v.phone} onChange={(x) => f.set('phone', x)} /></Field>
        <Field label="LinkedIn profile" error={err.linkedin}><Text value={v.linkedin} onChange={(x) => f.set('linkedin', x)} /></Field>
        <Field label="Preferred contact method"><SelectInput label="Preferred contact" value={v.preferredContact as string} onChange={(x) => f.set('preferredContact', x)} options={CONTACT_METHODS} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-[13px]"><input type="checkbox" checked={!!v.isDecisionMaker} onChange={(e) => f.set('isDecisionMaker', e.target.checked)} /> Decision maker</label>
      </Grid>
    </FormModal>
  )
}

/* ================= Opportunity ================= */

export function OpportunityForm({ open, onClose, opportunity, lead, companyId, onSaved }: { open: boolean; onClose: () => void; opportunity?: Opportunity; lead?: Lead; companyId?: string; onSaved?: (o: Opportunity) => void }) {
  const { db, me, create, update } = useStore()
  const owners = useOwnerOptions()
  const f = useForm(open, () => (opportunity ? { ...opportunity } : {
    name: lead?.title ?? '', companyId: lead?.companyId ?? companyId ?? '', contactId: lead?.contactId ?? null, leadId: lead?.id ?? null,
    ownerId: lead?.ownerId ?? me.id, services: lead?.services ?? [], problemStatement: lead?.businessProblem ?? '', proposedSolution: lead?.desiredSolution ?? '',
    value: lead?.estimatedValue ?? lead?.estimatedBudget ?? null, probability: null, deliveryTimeline: lead?.timeline ?? '', expectedCloseDate: lead?.expectedDecisionDate ?? '',
    stage: (lead && ['Discovery Completed', 'Qualified'].includes(lead.status) ? (lead.status === 'Qualified' ? 'Qualified Opportunity' : 'Discovery Completed') : 'New Lead') as Stage,
    competitors: '', nextAction: '', nextActionDate: '', lostReason: null, lostNote: '',
  }) as Record<string, unknown>)
  const v = f.v, err = f.errors
  const contacts = db.contacts.filter((c) => c.companyId === v.companyId)
  const leads = db.leads.filter((l) => l.companyId === v.companyId)
  const defaultProb = db.settings.stageProbabilities[v.stage as Stage]
  const save = async () => {
    if (await f.submit(async () => {
      const body = { ...v, probability: v.probability ?? undefined }
      const o = opportunity ? await update('opportunities', opportunity.id, body, 'Opportunity') : await create('opportunities', body, 'Opportunity')
      onSaved?.(o)
    })) onClose()
  }
  return (
    <FormModal open={open} onClose={onClose} title={opportunity ? `Edit opportunity — ${opportunity.code}` : 'New opportunity'} onSubmit={save} busy={f.busy} formError={f.formError} width={780}>
      <Section title="Opportunity">
        <Grid>
          <Field label="Opportunity name *" error={err.name} className="sm:col-span-2"><Text value={v.name} onChange={(x) => f.set('name', x)} autoFocus /></Field>
          <Field label="Company *" error={err.companyId}><SelectInput label="Company" value={v.companyId as string} onChange={(x) => { f.set('companyId', x ?? ''); f.set('contactId', null); f.set('leadId', null) }} options={db.companies.map((c) => ({ value: c.id, label: c.name }))} empty="Select a company" /></Field>
          <Field label="Primary contact" error={err.contactId}><SelectInput label="Contact" value={v.contactId as string} onChange={(x) => f.set('contactId', x)} options={contacts.map((c) => ({ value: c.id, label: c.name }))} empty="None" /></Field>
          <Field label="Source lead" error={err.leadId}><SelectInput label="Lead" value={v.leadId as string} onChange={(x) => f.set('leadId', x)} options={leads.map((l) => ({ value: l.id, label: `${l.code} — ${l.title}` }))} empty="None" /></Field>
          <Field label="Owner"><SelectInput label="Owner" value={v.ownerId as string} onChange={(x) => f.set('ownerId', x)} options={owners} empty="Unassigned" /></Field>
          <Field label="Service categories *" error={err.services} className="sm:col-span-2"><Chips label="Services" options={SERVICE_CATEGORIES} value={(v.services as (typeof SERVICE_CATEGORIES)[number][]) ?? []} onChange={(x) => f.set('services', x)} /></Field>
        </Grid>
      </Section>
      <Section title="Value & timing">
        <Grid>
          <Field label="Stage"><SelectInput label="Stage" value={v.stage as string} onChange={(x) => f.set('stage', (x ?? 'New Lead') as Stage)} options={STAGES} empty={false} /></Field>
          <Field label={`Estimated deal value (${db.settings.currency}) *`} error={err.value}><Num value={v.value} onChange={(x) => f.set('value', x)} /></Field>
          <Field label="Probability of closing (%)" error={err.probability} hint={`Leave blank to use the stage default (${defaultProb}%)`}><Num value={v.probability} onChange={(x) => f.set('probability', x)} max={100} placeholder={`${defaultProb}`} /></Field>
          <Field label="Expected close date" error={err.expectedCloseDate}><Text type="date" value={v.expectedCloseDate} onChange={(x) => f.set('expectedCloseDate', x)} /></Field>
          <Field label="Estimated delivery timeline"><Text value={v.deliveryTimeline} onChange={(x) => f.set('deliveryTimeline', x)} placeholder="e.g. 12 weeks" /></Field>
          <Field label="Competitors (if known)"><Text value={v.competitors} onChange={(x) => f.set('competitors', x)} /></Field>
          {v.stage === 'Closed Lost' && <>
            <Field label="Lost reason *" error={err.lostReason}><SelectInput label="Lost reason" value={v.lostReason as string} onChange={(x) => f.set('lostReason', x)} options={LOST_REASONS} empty="Select a reason" /></Field>
            <Field label="Lost note"><Text value={v.lostNote} onChange={(x) => f.set('lostNote', x)} /></Field>
          </>}
        </Grid>
      </Section>
      <Section title="Problem, solution & next action">
        <Grid>
          <Field label="Problem statement" className="sm:col-span-2"><Area value={v.problemStatement} onChange={(x) => f.set('problemStatement', x)} /></Field>
          <Field label="Proposed solution" className="sm:col-span-2"><Area value={v.proposedSolution} onChange={(x) => f.set('proposedSolution', x)} /></Field>
          <Field label="Next action"><Text value={v.nextAction} onChange={(x) => f.set('nextAction', x)} placeholder="e.g. Schedule technical discussion" /></Field>
          <Field label="Next action date" error={err.nextActionDate}><Text type="date" value={v.nextActionDate} onChange={(x) => f.set('nextActionDate', x)} /></Field>
        </Grid>
      </Section>
    </FormModal>
  )
}

/** Asked whenever an opportunity is moved to Closed Lost */
export function LostReasonModal({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reason: string, note: string) => Promise<void> | void }) {
  const [reason, setReason] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setReason(null); setNote('') } }, [open])
  return (
    <Modal open={open} onClose={onClose} title="Why was this opportunity lost?" width={460}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-danger" disabled={!reason || busy} onClick={async () => { setBusy(true); try { await onConfirm(reason!, note) } finally { setBusy(false) } }}>Mark as lost</button></>}>
      <div className="space-y-4">
        <Field label="Lost reason *"><SelectInput label="Lost reason" value={reason} onChange={setReason} options={LOST_REASONS} empty="Select a reason" /></Field>
        <Field label="Note (optional)"><Area rows={2} value={note} onChange={setNote} /></Field>
      </div>
    </Modal>
  )
}

/* ================= Task & activity ================= */

export function TaskForm({ open, onClose, task, defaults }: { open: boolean; onClose: () => void; task?: Task; defaults?: Partial<Task> }) {
  const { db, me, create, update } = useStore()
  const owners = useOwnerOptions()
  const f = useForm(open, () => (task ? { ...task } : { title: '', type: 'Follow-up', priority: 'Medium', dueDate: todayIso(), dueTime: '', status: 'Open', ownerId: me.id, leadId: null, opportunityId: null, companyId: null, notes: '', ...defaults }) as Record<string, unknown>)
  const v = f.v, err = f.errors
  const save = async () => { if (await f.submit(() => task ? update('tasks', task.id, v, 'Task') : create('tasks', v, 'Task'))) onClose() }
  return (
    <FormModal open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'} onSubmit={save} busy={f.busy} formError={f.formError}>
      <Grid>
        <Field label="What needs to be done? *" error={err.title} className="sm:col-span-2"><Text value={v.title} onChange={(x) => f.set('title', x)} autoFocus /></Field>
        <Field label="Type"><SelectInput label="Type" value={v.type as string} onChange={(x) => f.set('type', x ?? 'Follow-up')} options={TASK_TYPES} empty={false} /></Field>
        <Field label="Priority"><SelectInput label="Priority" value={v.priority as string} onChange={(x) => f.set('priority', x ?? 'Medium')} options={TASK_PRIORITIES} empty={false} /></Field>
        <Field label="Due date *" error={err.dueDate}><Text type="date" value={v.dueDate} onChange={(x) => f.set('dueDate', x)} /></Field>
        <Field label="Time" error={err.dueTime}><Text type="time" value={v.dueTime} onChange={(x) => f.set('dueTime', x)} /></Field>
        <Field label="Owner"><SelectInput label="Owner" value={v.ownerId as string} onChange={(x) => f.set('ownerId', x)} options={owners} empty="Unassigned" /></Field>
        <Field label="Status"><SelectInput label="Status" value={v.status as string} onChange={(x) => f.set('status', x ?? 'Open')} options={['Open', 'Completed']} empty={false} /></Field>
        <Field label="Related lead"><SelectInput label="Lead" value={v.leadId as string} onChange={(x) => f.set('leadId', x)} options={db.leads.map((l) => ({ value: l.id, label: `${l.code} — ${l.title}` }))} empty="None" /></Field>
        <Field label="Related opportunity"><SelectInput label="Opportunity" value={v.opportunityId as string} onChange={(x) => f.set('opportunityId', x)} options={db.opportunities.map((o) => ({ value: o.id, label: `${o.code} — ${o.name}` }))} empty="None" /></Field>
        <Field label="Notes" className="sm:col-span-2"><Area rows={2} value={v.notes} onChange={(x) => f.set('notes', x)} /></Field>
      </Grid>
    </FormModal>
  )
}

const ACTIVITY_LABEL: Record<(typeof LOGGABLE_ACTIVITY_TYPES)[number], string> = { call: 'Call', email: 'Email', meeting: 'Meeting', note: 'Note' }
export function ActivityForm({ open, onClose, defaults }: { open: boolean; onClose: () => void; defaults: { leadId?: string | null; opportunityId?: string | null; companyId?: string | null; contactId?: string | null; type?: string; title?: string; body?: string } }) {
  const { create } = useStore()
  const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
  const f = useForm(open, () => ({ type: 'call', title: '', body: '', occurredAt: nowLocal(), ...defaults }) as Record<string, unknown>)
  const v = f.v, err = f.errors
  const save = async () => {
    if (await f.submit(() => create('activities', { ...v, occurredAt: v.occurredAt ? new Date(v.occurredAt as string).toISOString() : null }, 'Activity'))) onClose()
  }
  return (
    <FormModal open={open} onClose={onClose} title="Log an interaction" onSubmit={save} busy={f.busy} formError={f.formError} width={560}>
      <div className="mb-4 flex flex-wrap gap-2">
        {LOGGABLE_ACTIVITY_TYPES.map((t) => (
          <button type="button" key={t} onClick={() => f.set('type', t)} aria-pressed={v.type === t}
            className={cx('rounded-full border px-3 py-1 text-[12px]', v.type === t ? 'border-sky-accent bg-sky-light' : 'border-line text-muted')}>{ACTIVITY_LABEL[t]}</button>
        ))}
      </div>
      <Grid>
        <Field label="Summary *" error={err.title} className="sm:col-span-2"><Text value={v.title} onChange={(x) => f.set('title', x)} placeholder="e.g. Discovery call with CTO" autoFocus /></Field>
        <Field label="Details" className="sm:col-span-2"><Area rows={4} value={v.body} onChange={(x) => f.set('body', x)} placeholder="What was discussed, decisions, open questions…" /></Field>
        <Field label="When"><Text type="datetime-local" value={v.occurredAt} onChange={(x) => f.set('occurredAt', x)} /></Field>
      </Grid>
      <p className="mt-3 text-[11px] text-faint">This records the interaction in the CRM. It does not send an email or place a call.</p>
    </FormModal>
  )
}

/* ================= Proposal ================= */

export function ProposalForm({ open, onClose, proposal, opportunityId }: { open: boolean; onClose: () => void; proposal?: Proposal; opportunityId?: string }) {
  const { db, create, update } = useStore()
  const f = useForm(open, () => {
    if (proposal) return { ...proposal } as Record<string, unknown>
    const o = db.opportunities.find((x) => x.id === opportunityId)
    const company = o ? db.companies.find((c) => c.id === o.companyId) : undefined
    return { title: o ? `${company?.name ?? ''} — ${o.name} proposal`.trim() : '', opportunityId: opportunityId ?? '', services: o?.services ?? [], problemStatement: o?.problemStatement ?? '', solutionSummary: o?.proposedSolution ?? '', price: o?.value ?? null, deliveryTimeline: o?.deliveryTimeline ?? '', status: 'Draft', validUntil: '' } as Record<string, unknown>
  })
  const v = f.v, err = f.errors
  const prefill = (id: string | null) => {
    f.set('opportunityId', id ?? '')
    const o = db.opportunities.find((x) => x.id === id)
    if (o && !proposal) {
      const company = db.companies.find((c) => c.id === o.companyId)
      f.setV((d) => ({ ...d, opportunityId: o.id, title: (d.title as string) || `${company?.name ?? ''} — ${o.name} proposal`, services: o.services, problemStatement: o.problemStatement ?? '', solutionSummary: o.proposedSolution ?? '', price: o.value, deliveryTimeline: o.deliveryTimeline ?? '' }))
    }
  }
  const save = async () => { if (await f.submit(() => proposal ? update('proposals', proposal.id, v, 'Proposal') : create('proposals', v, 'Proposal'))) onClose() }
  return (
    <FormModal open={open} onClose={onClose} title={proposal ? `Edit proposal — ${proposal.code}` : 'New proposal'} onSubmit={save} busy={f.busy} formError={f.formError} width={720}>
      <Grid>
        <Field label="Opportunity *" error={err.opportunityId} className="sm:col-span-2"><SelectInput label="Opportunity" value={v.opportunityId as string} onChange={prefill} options={db.opportunities.map((o) => ({ value: o.id, label: `${o.code} — ${o.name} (${db.companies.find((c) => c.id === o.companyId)?.name ?? ''})` }))} empty="Select an opportunity" /></Field>
        <Field label="Proposal title *" error={err.title} className="sm:col-span-2"><Text value={v.title} onChange={(x) => f.set('title', x)} /></Field>
        <Field label="Proposed services *" error={err.services} className="sm:col-span-2"><Chips label="Services" options={SERVICE_CATEGORIES} value={(v.services as (typeof SERVICE_CATEGORIES)[number][]) ?? []} onChange={(x) => f.set('services', x)} /></Field>
        <Field label={`Estimated price (${db.settings.currency}) *`} error={err.price}><Num value={v.price} onChange={(x) => f.set('price', x)} /></Field>
        <Field label="Expected delivery timeline"><Text value={v.deliveryTimeline} onChange={(x) => f.set('deliveryTimeline', x)} /></Field>
        <Field label="Status"><SelectInput label="Status" value={v.status as string} onChange={(x) => f.set('status', x ?? 'Draft')} options={PROPOSAL_STATUSES} empty={false} /></Field>
        <Field label="Valid until" error={err.validUntil}><Text type="date" value={v.validUntil} onChange={(x) => f.set('validUntil', x)} /></Field>
        <Field label="Problem statement" className="sm:col-span-2"><Area value={v.problemStatement} onChange={(x) => f.set('problemStatement', x)} /></Field>
        <Field label="Proposed solution summary" className="sm:col-span-2"><Area rows={4} value={v.solutionSummary} onChange={(x) => f.set('solutionSummary', x)} /></Field>
      </Grid>
      <p className="mt-3 text-[11px] text-faint">Marking a proposal “Sent” records the date in the CRM; it does not email the document. View tracking is not available.</p>
    </FormModal>
  )
}

/* ================= Event ================= */

export function EventForm({ open, onClose, event, defaults }: { open: boolean; onClose: () => void; event?: CalEvent; defaults?: Partial<CalEvent> }) {
  const { db, me, create, update, remove } = useStore()
  const owners = useOwnerOptions()
  const f = useForm(open, () => (event ? { ...event } : { title: '', kind: 'Discovery Meeting', date: todayIso(), start: '10:00', end: '11:00', location: 'Google Meet', ownerId: me.id, leadId: null, opportunityId: null, companyId: null, ...defaults }) as Record<string, unknown>)
  const v = f.v, err = f.errors
  const save = async () => { if (await f.submit(() => event ? update('events', event.id, v, 'Event') : create('events', v, 'Event'))) onClose() }
  return (
    <FormModal open={open} onClose={onClose} title={event ? 'Edit meeting' : 'Schedule meeting'} onSubmit={save} busy={f.busy} formError={f.formError}
      extraFooter={event && <button className="btn-quiet-danger mr-auto" onClick={async () => { if (await f.submit(() => remove('events', event.id, 'Event'))) onClose() }}>Delete</button>}>
      <Grid>
        <Field label="Title *" error={err.title} className="sm:col-span-2"><Text value={v.title} onChange={(x) => f.set('title', x)} autoFocus /></Field>
        <Field label="Type"><SelectInput label="Type" value={v.kind as string} onChange={(x) => f.set('kind', x ?? 'Discovery Meeting')} options={EVENT_KINDS} empty={false} /></Field>
        <Field label="Date *" error={err.date}><Text type="date" value={v.date} onChange={(x) => f.set('date', x)} /></Field>
        <Field label="Start *" error={err.start}><Text type="time" value={v.start} onChange={(x) => f.set('start', x)} /></Field>
        <Field label="End *" error={err.end}><Text type="time" value={v.end} onChange={(x) => f.set('end', x)} /></Field>
        <Field label="Location / link"><Text value={v.location} onChange={(x) => f.set('location', x)} /></Field>
        <Field label="Owner"><SelectInput label="Owner" value={v.ownerId as string} onChange={(x) => f.set('ownerId', x)} options={owners} empty="Unassigned" /></Field>
        <Field label="Related lead"><SelectInput label="Lead" value={v.leadId as string} onChange={(x) => f.set('leadId', x)} options={db.leads.map((l) => ({ value: l.id, label: `${l.code} — ${l.title}` }))} empty="None" /></Field>
        <Field label="Related opportunity"><SelectInput label="Opportunity" value={v.opportunityId as string} onChange={(x) => f.set('opportunityId', x)} options={db.opportunities.map((o) => ({ value: o.id, label: `${o.code} — ${o.name}` }))} empty="None" /></Field>
      </Grid>
      <p className="mt-3 text-[11px] text-faint">Saved to the LeadHub calendar only — no calendar invite is sent.</p>
    </FormModal>
  )
}

/* ================= Campaign, service, invoice, user ================= */

export function CampaignForm({ open, onClose, campaign }: { open: boolean; onClose: () => void; campaign?: Campaign }) {
  const { me, create, update } = useStore()
  const f = useForm(open, () => (campaign ? { ...campaign } : { title: '', author: me.name, date: todayIso(), body: '', image: '', tags: [] }) as Record<string, unknown>)
  const v = f.v, err = f.errors
  const save = async () => { if (await f.submit(() => campaign ? update('campaigns', campaign.id, v, 'Campaign') : create('campaigns', v, 'Campaign'))) onClose() }
  return (
    <FormModal open={open} onClose={onClose} title={campaign ? 'Edit campaign' : 'New campaign'} onSubmit={save} busy={f.busy} formError={f.formError}>
      <Grid>
        <Field label="Title *" error={err.title} className="sm:col-span-2"><Text value={v.title} onChange={(x) => f.set('title', x)} autoFocus /></Field>
        <Field label="Owner *" error={err.author}><Text value={v.author} onChange={(x) => f.set('author', x)} /></Field>
        <Field label="Date *" error={err.date}><Text type="date" value={v.date} onChange={(x) => f.set('date', x)} /></Field>
        <Field label="Image URL" className="sm:col-span-2"><Text value={v.image} onChange={(x) => f.set('image', x)} /></Field>
        <Field label="Tags (comma separated)" className="sm:col-span-2"><Text value={(v.tags as string[]).join(', ')} onChange={(x) => f.set('tags', x.split(',').map((t) => t.trim()).filter(Boolean))} /></Field>
        <Field label="Description" className="sm:col-span-2"><Area rows={5} value={v.body} onChange={(x) => f.set('body', x)} /></Field>
      </Grid>
    </FormModal>
  )
}

export function ServiceForm({ open, onClose, service }: { open: boolean; onClose: () => void; service?: Service }) {
  const { db, create, update } = useStore()
  const f = useForm(open, () => (service ? { ...service } : { name: '', group: 'AI Solutions', category: 'AI Solutions', description: '', startingPrice: null, typicalDuration: '', active: true }) as Record<string, unknown>)
  const v = f.v, err = f.errors
  const save = async () => { if (await f.submit(() => service ? update('services', service.id, v, 'Service') : create('services', v, 'Service'))) onClose() }
  return (
    <FormModal open={open} onClose={onClose} title={service ? 'Edit service' : 'Add service'} onSubmit={save} busy={f.busy} formError={f.formError}>
      <Grid>
        <Field label="Service name *" error={err.name} className="sm:col-span-2"><Text value={v.name} onChange={(x) => f.set('name', x)} autoFocus /></Field>
        <Field label="Group"><SelectInput label="Group" value={v.group as string} onChange={(x) => f.set('group', x ?? SERVICE_GROUPS[0])} options={SERVICE_GROUPS} empty={false} /></Field>
        <Field label="Interest category"><SelectInput label="Category" value={v.category as string} onChange={(x) => f.set('category', x ?? SERVICE_CATEGORIES[0])} options={SERVICE_CATEGORIES} empty={false} /></Field>
        <Field label={`Starting price (${db.settings.currency})`} error={err.startingPrice}><Num value={v.startingPrice} onChange={(x) => f.set('startingPrice', x)} placeholder="Not set" /></Field>
        <Field label="Typical duration"><Text value={v.typicalDuration} onChange={(x) => f.set('typicalDuration', x)} placeholder="e.g. 8–12 weeks" /></Field>
        <Field label="Description" className="sm:col-span-2"><Area value={v.description} onChange={(x) => f.set('description', x)} /></Field>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!!v.active} onChange={(e) => f.set('active', e.target.checked)} /> Offered to clients</label>
      </Grid>
    </FormModal>
  )
}

export function InvoiceForm({ open, onClose, invoice }: { open: boolean; onClose: () => void; invoice?: Invoice }) {
  const { db, create, update } = useStore()
  const won = useMemo(() => db.opportunities.filter((o) => o.stage === 'Closed Won'), [db.opportunities])
  const f = useForm(open, () => (invoice ? { ...invoice } : { companyId: won[0]?.companyId ?? '', opportunityId: won[0]?.id ?? null, item: '', subtotal: null, tax: 0, discount: 0, status: 'Pending', dueDate: todayIso() }) as Record<string, unknown>)
  const v = f.v, err = f.errors
  const save = async () => { if (await f.submit(() => invoice ? update('invoices', invoice.id, v, 'Invoice') : create('invoices', v, 'Invoice'))) onClose() }
  return (
    <FormModal open={open} onClose={onClose} title={invoice ? `Edit invoice — ${invoice.code}` : 'New invoice'} onSubmit={save} busy={f.busy} formError={f.formError}>
      <Grid>
        <Field label="Client *" error={err.companyId}><SelectInput label="Client" value={v.companyId as string} onChange={(x) => { f.set('companyId', x ?? ''); f.set('opportunityId', null) }} options={db.companies.map((c) => ({ value: c.id, label: c.name }))} empty="Select a client" /></Field>
        <Field label="Won opportunity"><SelectInput label="Opportunity" value={v.opportunityId as string} onChange={(x) => f.set('opportunityId', x)} options={won.filter((o) => o.companyId === v.companyId).map((o) => ({ value: o.id, label: o.name }))} empty="None" /></Field>
        <Field label="Item / milestone *" error={err.item} className="sm:col-span-2"><Text value={v.item} onChange={(x) => f.set('item', x)} /></Field>
        <Field label="Subtotal *" error={err.subtotal}><Num value={v.subtotal} onChange={(x) => f.set('subtotal', x)} /></Field>
        <Field label="Tax"><Num value={v.tax} onChange={(x) => f.set('tax', x ?? 0)} /></Field>
        <Field label="Discount"><Num value={v.discount} onChange={(x) => f.set('discount', x ?? 0)} /></Field>
        <Field label="Status"><SelectInput label="Status" value={v.status as string} onChange={(x) => f.set('status', x ?? 'Pending')} options={INVOICE_STATUSES} empty={false} /></Field>
        <Field label="Due date *" error={err.dueDate}><Text type="date" value={v.dueDate} onChange={(x) => f.set('dueDate', x)} /></Field>
      </Grid>
    </FormModal>
  )
}

export function UserForm({ open, onClose, user }: { open: boolean; onClose: () => void; user?: User }) {
  const { create, update } = useStore()
  const f = useForm(open, () => (user ? { ...user, password: '' } : { name: '', email: '', role: 'sales_rep', title: '', phone: '', territory: '', avatar: '', password: '' }) as Record<string, unknown>)
  const v = f.v, err = f.errors
  const save = async () => { if (await f.submit(() => user ? update('users', user.id, v, 'Team member') : create('users', v, 'Team member'))) onClose() }
  return (
    <FormModal open={open} onClose={onClose} title={user ? 'Edit team member' : 'Add team member'} onSubmit={save} busy={f.busy} formError={f.formError}>
      <Grid>
        <Field label="Full name *" error={err.name}><Text value={v.name} onChange={(x) => f.set('name', x)} autoFocus /></Field>
        <Field label="Email *" error={err.email}><Text type="email" value={v.email} onChange={(x) => f.set('email', x)} /></Field>
        <Field label="Role"><SelectInput label="Role" value={v.role as string} onChange={(x) => f.set('role', x ?? 'sales_rep')} options={ROLES.map((r) => ({ value: r, label: r === 'admin' ? 'Admin' : 'Sales rep' }))} empty={false} /></Field>
        <Field label="Job title"><Text value={v.title} onChange={(x) => f.set('title', x)} /></Field>
        <Field label="Territory / segment"><Text value={v.territory} onChange={(x) => f.set('territory', x)} /></Field>
        <Field label="Phone"><Text value={v.phone} onChange={(x) => f.set('phone', x)} /></Field>
        <Field label={user ? 'New password (leave blank to keep)' : 'Password (optional)'} error={err.password} hint="Without a password the person is listed as an owner but cannot sign in" className="sm:col-span-2">
          <Text type="password" autoComplete="new-password" value={v.password} onChange={(x) => f.set('password', x)} />
        </Field>
      </Grid>
    </FormModal>
  )
}
