import { useEffect, useState } from 'react'
import { COMPANY_SIZES, CONTACT_METHODS, SERVICE_CATEGORIES } from '../../shared/model'
import { ApiError, get, post } from '../lib/api'
import { Chips, Field, Notice, SelectInput } from '../components/ui'

/** Public lead-capture form. Submissions become New Leads with a response task for the assigned rep. */
export default function Inquiry() {
  const [company, setCompany] = useState('LeadHub Technologies')
  useEffect(() => { get<{ companyName: string }>('/public/options').then((r) => setCompany(r.companyName)).catch(() => {}) }, [])
  const [v, setV] = useState({ name: '', email: '', phone: '', jobTitle: '', company: '', website: '', companySize: null as string | null, problem: '', services: [] as string[], budget: '', timeline: '', preferredContact: null as string | null, company_url: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }))

  const submit = async () => {
    setState('sending'); setErrors({})
    try {
      await post('/public/inquiries', { ...v, budget: v.budget === '' ? null : Number(v.budget) })
      setState('done')
    } catch (e) {
      setState('error')
      if (e instanceof ApiError) { setErrors(e.fields); setMessage(e.message) } else setMessage('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-frame px-4 py-10">
      <div className="mx-auto max-w-[760px]">
        <div className="mb-6 flex items-center gap-2.5"><img src="/logo.svg" alt="" className="h-7 w-7" /><span className="text-[20px] font-semibold">{company}</span></div>
        <div className="card p-8">
          {state === 'done' ? (
            <div className="py-10 text-center">
              <h1 className="text-[22px] font-semibold">Thank you — we’ve received your inquiry.</h1>
              <p className="mt-3 text-[14px] text-muted">A solutions specialist will contact you by your preferred channel, usually within one business day.</p>
            </div>
          ) : (
            <form noValidate onSubmit={(e) => { e.preventDefault(); void submit() }}>
              <h1 className="text-[22px] font-semibold leading-tight">Tell us what you want to build</h1>
              <p className="mt-2 text-[14px] text-muted">Custom software, AI solutions and technology consulting for startups, SMBs and enterprises.</p>
              {state === 'error' && <Notice tone="danger" className="mt-5">{message}</Notice>}
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Your name *" error={errors.name}><input className="input" autoComplete="name" value={v.name} onChange={(e) => set('name', e.target.value)} /></Field>
                <Field label="Work email *" error={errors.email}><input className="input" type="email" autoComplete="email" value={v.email} onChange={(e) => set('email', e.target.value)} /></Field>
                <Field label="Company *" error={errors.company}><input className="input" autoComplete="organization" value={v.company} onChange={(e) => set('company', e.target.value)} /></Field>
                <Field label="Job title"><input className="input" autoComplete="organization-title" value={v.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></Field>
                <Field label="Company website" error={errors.website}><input className="input" value={v.website} onChange={(e) => set('website', e.target.value)} placeholder="company.com" /></Field>
                <Field label="Company size"><SelectInput label="Company size" value={v.companySize} onChange={(x) => set('companySize', x)} options={COMPANY_SIZES} empty="Select" /></Field>
                <Field label="What problem do you want to solve? *" error={errors.problem} className="sm:col-span-2"><textarea className="input h-28 py-2" value={v.problem} onChange={(e) => set('problem', e.target.value)} /></Field>
                <Field label="Which services are you interested in?" className="sm:col-span-2"><Chips label="Services" options={SERVICE_CATEGORIES} value={v.services as (typeof SERVICE_CATEGORIES)[number][]} onChange={(x) => set('services', x)} /></Field>
                <Field label="Estimated budget (optional)" error={errors.budget}><input className="input" type="number" min={0} value={v.budget} onChange={(e) => set('budget', e.target.value)} /></Field>
                <Field label="Desired timeline"><input className="input" value={v.timeline} onChange={(e) => set('timeline', e.target.value)} placeholder="e.g. within 3 months" /></Field>
                <Field label="Phone"><input className="input" type="tel" autoComplete="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
                <Field label="Preferred way to contact you"><SelectInput label="Preferred contact" value={v.preferredContact} onChange={(x) => set('preferredContact', x)} options={CONTACT_METHODS} empty="Any" /></Field>
                <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={v.company_url} onChange={(e) => set('company_url', e.target.value)} />
              </div>
              <button type="submit" disabled={state === 'sending'} className="btn-primary mt-6 w-full sm:w-auto">{state === 'sending' ? 'Sending…' : 'Send inquiry'}</button>
              <p className="mt-3 text-[11px] text-faint">We use these details only to respond to your inquiry.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
