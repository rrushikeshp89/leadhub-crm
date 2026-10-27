import { useEffect, useState, type ReactNode } from 'react'
import { Add, Call, Lock, Sms, Trash } from 'iconsax-react'
import { CURRENCIES, DEFAULT_QUALIFICATION, DEFAULT_STAGE_PROBABILITY, STAGES, type Criterion, type OrgSettings, type Stage } from '../../shared/model'
import { ApiError, patch, post } from '../lib/api'
import { useAuth, useStore } from '../store/Store'
import { Avatar, Card, CardHeader, ConfirmModal, Field, Notice, Spinner } from '../components/ui'
import { Logo } from '../components/Layout'
import { cx } from '../lib/format'
import { C } from '../lib/theme'

/* ================= Profile ================= */
export function Profile() {
  const { db, me, refresh, toast } = useStore()
  const [d, setD] = useState({ name: me.name, email: me.email, phone: me.phone ?? '', title: me.title ?? '', territory: me.territory ?? '', avatar: me.avatar ?? '', currentPassword: '', newPassword: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }))
  const mine = { leads: db.leads.filter((l) => l.ownerId === me.id && l.status !== 'Disqualified').length, won: db.opportunities.filter((o) => o.ownerId === me.id && o.stage === 'Closed Won').length, tasks: db.tasks.filter((t) => t.ownerId === me.id && t.status === 'Open').length }
  const save = async () => {
    setBusy(true); setErrors({})
    try { await patch('/me', d); await refresh(); setD((x) => ({ ...x, currentPassword: '', newPassword: '' })); toast('Profile saved') } catch (e) {
      if (e instanceof ApiError) { setErrors(e.fields); toast(e.message, 'danger') }
    } finally { setBusy(false) }
  }
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card className="flex flex-col items-center text-center">
        <div className="rounded-full bg-sky p-1.5"><Avatar src={d.avatar || null} name={d.name} size={120} /></div>
        <h1 className="mt-4 text-[20px] font-medium">{me.name}</h1>
        <p className="text-[13px] text-muted">{me.role === 'admin' ? 'Admin' : 'Sales rep'}{me.title ? ` · ${me.title}` : ''}</p>
        <div className="mt-6 grid w-full grid-cols-3 gap-3">
          {[[mine.leads, 'Active leads'], [mine.won, 'Deals won'], [mine.tasks, 'Open tasks']].map(([v, l], i) => (
            <div key={String(l)} className={cx('rounded-xl p-3', ['bg-lavender', 'bg-sun', 'bg-sky'][i])}><p className="text-[20px] font-semibold">{v}</p><p className="text-[11px]">{l}</p></div>
          ))}
        </div>
        <div className="mt-6 w-full space-y-3 text-left text-[13px]">
          <p className="flex items-center gap-3"><Sms size={16} color={C.muted} variant="Bold" />{me.email}</p>
          {me.phone && <p className="flex items-center gap-3"><Call size={16} color={C.muted} variant="Bold" />{me.phone}</p>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Edit profile" />
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <Field label="Full name" error={errors.name}><input className="input" value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Email" error={errors.email}><input className="input" type="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Phone"><input className="input" value={d.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Job title"><input className="input" value={d.title} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Territory / segment"><input className="input" value={d.territory} onChange={(e) => set('territory', e.target.value)} /></Field>
          <Field label="Avatar URL"><input className="input" value={d.avatar} onChange={(e) => set('avatar', e.target.value)} /></Field>
          <p className="pt-2 text-[13px] font-semibold sm:col-span-2">Change password</p>
          <Field label="Current password" error={errors.currentPassword}><input className="input" type="password" autoComplete="current-password" value={d.currentPassword} onChange={(e) => set('currentPassword', e.target.value)} /></Field>
          <Field label="New password" error={errors.newPassword} hint="At least 8 characters. Leave blank to keep."><input className="input" type="password" autoComplete="new-password" value={d.newPassword} onChange={(e) => set('newPassword', e.target.value)} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
        </form>
      </Card>
    </div>
  )
}

/* ================= Settings ================= */
export function Settings() {
  const { db, me, saveSettings, refresh, toast, attempt } = useStore()
  const isAdmin = me.role === 'admin'
  const [org, setOrg] = useState<OrgSettings>(db.settings)
  const [confirm, setConfirm] = useState<null | 'clear' | 'load'>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => setOrg(db.settings), [db.settings])
  const weightTotal = org.qualification.reduce((a, c) => a + c.weight, 0)
  const setCrit = (i: number, c: Partial<Criterion>) => setOrg((o) => ({ ...o, qualification: o.qualification.map((x, j) => (j === i ? { ...x, ...c } : x)) }))
  const save = async (part: Partial<OrgSettings>, label: string) => {
    setBusy(true)
    try { await saveSettings(part); toast(`${label} saved`) } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not save', 'danger') } finally { setBusy(false) }
  }
  const demo = async (action: 'clear' | 'load') => {
    const ok = await attempt(() => post('/admin/demo', { action }))
    if (ok) { await refresh(); toast(action === 'clear' ? 'Demo data removed' : 'Demo data loaded') }
  }

  if (!isAdmin) return <Card><Notice>Organisation settings can only be changed by an admin. You can update your own details on your <a className="underline" href="/profile">profile</a>.</Notice></Card>

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Organisation" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Company name"><input className="input" value={org.companyName} onChange={(e) => setOrg({ ...org, companyName: e.target.value })} /></Field>
          <Field label="Currency"><select className="input" value={org.currency} onChange={(e) => setOrg({ ...org, currency: e.target.value as OrgSettings['currency'] })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Rows per page"><select className="input" value={org.pageSize} onChange={(e) => setOrg({ ...org, pageSize: Number(e.target.value) })}>{[5, 10, 15, 20, 50].map((n) => <option key={n}>{n}</option>)}</select></Field>
          <Field label="Flag records as stale after (days)" hint="Used by the rule-based ‘Needs attention’ checks"><input className="input" type="number" min={1} max={365} value={org.staleDays} onChange={(e) => setOrg({ ...org, staleDays: Number(e.target.value) })} /></Field>
        </div>
        <div className="mt-4 flex justify-end"><button className="btn-primary" disabled={busy} onClick={() => save({ companyName: org.companyName, currency: org.currency, pageSize: org.pageSize, staleDays: org.staleDays }, 'Organisation settings')}>Save</button></div>
      </Card>

      <Card>
        <CardHeader title="AI assistant" />
        {db.meta.ai.configured
          ? <Notice>AI features are enabled using <b>{db.meta.ai.model}</b>. Requests are made by the server; the API key is never sent to the browser. AI output is always shown as a suggestion and is never saved automatically.</Notice>
          : <Notice tone="warn">AI features are <b>not configured</b>. To enable them, set <code className="rounded bg-white px-1">ANTHROPIC_API_KEY</code> (and optionally <code className="rounded bg-white px-1">ANTHROPIC_MODEL</code>) in the server’s <code className="rounded bg-white px-1">.env</code> file and restart the API. Rule-based insights keep working without it.</Notice>}
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader title="Lead qualification framework" action={<span className={cx('text-[12px]', weightTotal === 100 ? 'text-muted' : 'text-warn')}>Total weight {weightTotal}{weightTotal !== 100 && ' (scores are normalised)'}</span>} />
        <p className="mb-4 text-[12px] text-muted">Each criterion is rated None / Weak / Moderate / Strong on a lead, or left Unknown. The score is the weighted share of the maximum. Unknown criteria score zero and are listed as missing.</p>
        <div className="space-y-3">
          {org.qualification.map((c, i) => (
            <div key={i} className="grid grid-cols-1 items-end gap-3 rounded-lg bg-canvas p-3 md:grid-cols-[140px_1fr_2fr_90px_auto]">
              <Field label="Key"><input className="input bg-white" value={c.key} onChange={(e) => setCrit(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} /></Field>
              <Field label="Label"><input className="input bg-white" value={c.label} onChange={(e) => setCrit(i, { label: e.target.value })} /></Field>
              <Field label="Guidance"><input className="input bg-white" value={c.hint} onChange={(e) => setCrit(i, { hint: e.target.value })} /></Field>
              <Field label="Weight"><input className="input bg-white" type="number" min={0} max={100} value={c.weight} onChange={(e) => setCrit(i, { weight: Number(e.target.value) })} /></Field>
              <button aria-label={`Remove ${c.label}`} className="mb-2 rounded p-1 hover:bg-danger-light disabled:opacity-30" disabled={org.qualification.length <= 1} onClick={() => setOrg({ ...org, qualification: org.qualification.filter((_, j) => j !== i) })}><Trash size={16} color={C.muted} /></button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-ghost btn-sm" disabled={org.qualification.length >= 10} onClick={() => setOrg({ ...org, qualification: [...org.qualification, { key: `criterion_${org.qualification.length + 1}`, label: 'New criterion', weight: 10, hint: '' }] })}><Add size={14} color="currentColor" />Add criterion</button>
          <button className="btn-ghost btn-sm" onClick={() => setOrg({ ...org, qualification: DEFAULT_QUALIFICATION })}>Reset to default</button>
          <button className="btn-primary btn-sm ml-auto" disabled={busy} onClick={() => save({ qualification: org.qualification }, 'Qualification framework')}>Save framework</button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Default probability by stage" />
        <p className="mb-4 text-[12px] text-muted">Applied when an opportunity enters a stage, unless a probability is entered explicitly. Weighted pipeline = estimated value × probability.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {STAGES.map((s) => (
            <label key={s} className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2 text-[12px]">
              {s}
              <span className="flex items-center gap-1"><input type="number" min={0} max={100} disabled={s === 'Closed Won' || s === 'Closed Lost'} className="h-8 w-16 rounded border border-line bg-white px-2 text-right text-[12px] disabled:opacity-50" value={org.stageProbabilities[s]} onChange={(e) => setOrg({ ...org, stageProbabilities: { ...org.stageProbabilities, [s]: Number(e.target.value) } as Record<Stage, number> })} />%</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={() => setOrg({ ...org, stageProbabilities: DEFAULT_STAGE_PROBABILITY })}>Reset</button>
          <button className="btn-primary btn-sm" disabled={busy} onClick={() => save({ stageProbabilities: org.stageProbabilities }, 'Stage probabilities')}>Save</button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Demo data" />
        {db.settings.demoData ? (
          <>
            <Notice tone="warn" className="mb-4">The CRM currently contains <b>fictional demo records</b> (companies, people, deals and figures). Dashboards are calculated from them.</Notice>
            <button className="btn-danger" onClick={() => setConfirm('clear')}>Remove all demo data</button>
            <p className="mt-2 text-[11px] text-faint">Deletes every company, contact, lead, opportunity, proposal, task, event, invoice, campaign and message. Users, settings and the service catalog are kept.</p>
          </>
        ) : (
          <>
            <p className="mb-4 text-[12px] text-muted">No demo data is loaded. You can load the fictional sample dataset into an empty CRM to explore the features.</p>
            <button className="btn-ghost" disabled={db.companies.length > 0} onClick={() => setConfirm('load')}>Load demo data</button>
            {db.companies.length > 0 && <p className="mt-2 text-[11px] text-faint">Available only when the CRM has no companies.</p>}
          </>
        )}
      </Card>

      <ConfirmModal open={confirm === 'clear'} onClose={() => setConfirm(null)} text="Remove all demo records? This permanently deletes every business record in the CRM." onConfirm={() => demo('clear')} />
      <ConfirmModal open={confirm === 'load'} onClose={() => setConfirm(null)} text="Load the fictional demo dataset?" onConfirm={() => demo('load')} />
    </div>
  )
}

/* ================= Login ================= */
export function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true); setError(null)
    try { await signIn(email, pw) } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not sign in') } finally { setBusy(false) }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-frame p-4">
      <div className="card grid w-full max-w-[880px] overflow-hidden md:grid-cols-2">
        <div className="relative hidden flex-col justify-between bg-sky p-10 md:flex">
          <Logo />
          <div>
            <p className="text-[28px] font-semibold leading-tight">Your sales command center for software & AI deals.</p>
            <p className="mt-3 text-[13px] text-ink/70">Capture leads, qualify prospects, manage the pipeline, track proposals and turn clients into long-term partners.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-full bg-lavender px-3 py-1 text-[12px]">Pipeline</span>
              <span className="rounded-full bg-sun px-3 py-1 text-[12px]">Follow-ups</span>
              <span className="rounded-full bg-white px-3 py-1 text-[12px]">Proposals</span>
            </div>
          </div>
        </div>
        <form className="p-10" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <h1 className="text-[22px] font-medium">Welcome back</h1>
          <p className="mt-1 text-[13px] text-muted">Sign in to your LeadHub workspace</p>
          {error && <Notice tone="danger" className="mt-6">{error}</Notice>}
          <div className="mt-6 space-y-4">
            <Field label="Work email"><IconInput icon={<Sms size={16} color={C.muted} />}><input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-transparent text-[13px] outline-none" /></IconInput></Field>
            <Field label="Password"><IconInput icon={<Lock size={16} color={C.muted} />}><input type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} className="w-full bg-transparent text-[13px] outline-none" /></IconInput></Field>
          </div>
          <button type="submit" disabled={busy || !email || !pw} className="btn-primary mt-8 w-full">{busy ? <Spinner className="border-white/40 border-t-white" /> : 'Sign in'}</button>
          <p className="mt-4 text-center text-[11px] text-faint">Accounts are created by an admin under Sales Team.</p>
        </form>
      </div>
    </div>
  )
}

function IconInput({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="flex h-11 items-center gap-2 rounded-lg border border-line bg-canvas px-3 focus-within:border-sky-accent focus-within:bg-white">{icon}{children}</div>
}
