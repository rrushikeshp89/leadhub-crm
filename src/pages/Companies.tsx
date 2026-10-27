import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Add, Edit2, Setting4, Trash } from 'iconsax-react'
import { COMPANY_SIZES, INDUSTRIES, type Company, type Contact } from '../../shared/model'
import { isOpen } from '../../shared/calc'
import { useLookups, useStore } from '../store/Store'
import { Avatar, Card, Cell, Cols, ConfirmModal, Dropdown, Empty, IconAction, Pagination, RoundAction, SearchInput, Toolbar, Unknown, usePaged } from '../components/ui'
import { CompanyForm, ContactForm } from '../components/forms'
import { useMoney } from '../lib/hooks'
import { C } from '../lib/theme'

export default function Companies() {
  const [params] = useSearchParams()
  const tab = (params.get('tab') as 'companies' | 'contacts') ?? 'companies'
  return (
    <Card>
      {tab === 'companies' ? <CompanyTable switcher={<Switcher />} /> : <ContactTable switcher={<Switcher />} />}
    </Card>
  )
}

function Switcher() {
  const [params, setParams] = useSearchParams()
  const { db } = useStore()
  const tab = params.get('tab') ?? 'companies'
  return (
    <div className="mb-4 flex gap-2">
      <button className={tab === 'companies' ? 'chip-on' : 'chip-off'} onClick={() => setParams({})}>Companies <span className="text-ink/50">{db.companies.length}</span></button>
      <button className={tab === 'contacts' ? 'chip-on' : 'chip-off'} onClick={() => setParams({ tab: 'contacts' })}>Contacts <span className="text-ink/50">{db.contacts.length}</span></button>
    </div>
  )
}

function CompanyTable({ switcher }: { switcher: ReactNode }) {
  const { db, remove, attempt } = useStore()
  const { userById } = useLookups()
  const money = useMoney()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [industry, setIndustry] = useState('All industries')
  const [size, setSize] = useState('Any size')
  const [sort, setSort] = useState<'Name' | 'Open pipeline' | 'Recently added'>('Name')
  const [showFilters, setShowFilters] = useState(false)
  const [form, setForm] = useState<{ open: boolean; company?: Company }>({ open: false })
  const [confirm, setConfirm] = useState<Company | null>(null)

  const stats = useMemo(() => {
    const m = new Map<string, { contacts: number; leads: number; open: number; pipeline: number; won: number }>()
    const get = (id: string) => m.get(id) ?? m.set(id, { contacts: 0, leads: 0, open: 0, pipeline: 0, won: 0 }).get(id)!
    db.contacts.forEach((c) => get(c.companyId).contacts++)
    db.leads.forEach((l) => { if (l.status !== 'Disqualified') get(l.companyId).leads++ })
    db.opportunities.forEach((o) => {
      const s = get(o.companyId)
      if (isOpen(o.stage)) { s.open++; s.pipeline += o.value }
      if (o.stage === 'Closed Won') s.won += o.value
    })
    return m
  }, [db.contacts, db.leads, db.opportunities])
  const empty = { contacts: 0, leads: 0, open: 0, pipeline: 0, won: 0 }

  const rows = useMemo(() => {
    const s = q.toLowerCase()
    const list = db.companies.filter((c) => (!s || [c.name, c.website, c.location, c.code].some((v) => v?.toLowerCase().includes(s))) &&
      (industry === 'All industries' || c.industry === industry) && (size === 'Any size' || c.size === size))
    if (sort === 'Name') list.sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'Open pipeline') list.sort((a, b) => (stats.get(b.id)?.pipeline ?? 0) - (stats.get(a.id)?.pipeline ?? 0))
    if (sort === 'Recently added') list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return list
  }, [db.companies, q, industry, size, sort, stats])
  const { page, pages, setPage, slice } = usePaged(rows, db.settings.pageSize)

  return (
    <>
      <Toolbar title="All Companies">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search company, website, location" className="w-60" pill />
        <Dropdown label="Sort" value={sort} options={['Name', 'Open pipeline', 'Recently added'] as const} onChange={setSort} />
        <RoundAction label="Filters" active={showFilters} onClick={() => setShowFilters((s) => !s)}><Setting4 size={16} color="currentColor" /></RoundAction>
        <RoundAction label="Add company" onClick={() => setForm({ open: true })}><Add size={18} color="currentColor" /></RoundAction>
      </Toolbar>
      {switcher}
      {showFilters && (
        <div className="panel mb-4 flex flex-wrap items-center gap-3">
          <Dropdown label="Industry" value={industry} options={['All industries', ...INDUSTRIES]} onChange={(v) => { setIndustry(v); setPage(1) }} />
          <Dropdown label="Size" value={size} options={['Any size', ...COMPANY_SIZES]} onChange={(v) => { setSize(v); setPage(1) }} />
        </div>
      )}
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[960px] table-fixed">
            <Cols w={[20, 15, 12, 7, 8, 13, 9, 10, 6]} />
          <thead><tr className="bg-sky-light">
            {['Company', 'Industry', 'Location', 'Contacts', 'Active leads', 'Open pipeline', 'Closed won', 'Owner'].map((h, i) => <th key={h} className={`th ${i === 0 ? 'rounded-l-lg pl-4' : ''}`}>{h}</th>)}
            <th className="th rounded-r-lg">Action</th>
          </tr></thead>
          <tbody>
            {slice.map((c) => {
              const s = stats.get(c.id) ?? empty
              return (
                <tr key={c.id} onClick={() => navigate(`/companies/${c.id}`)} className="cursor-pointer border-b border-line transition-colors hover:bg-canvas">
                  <td className="td pl-4"><Cell primary={<span className="font-medium">{c.name}</span>} secondary={c.website?.replace(/^https?:\/\//, '') ?? c.code} /></td>
                  <td className="td"><Cell primary={c.industry ?? <Unknown />} secondary={c.size ? `${c.size} employees` : 'Size unknown'} /></td>
                  <td className="td"><Cell primary={c.location ?? <Unknown />} /></td>
                  <td className="td">{s.contacts}</td>
                  <td className="td">{s.leads}</td>
                  <td className="td"><Cell primary={money(s.pipeline)} secondary={`${s.open} open opportunit${s.open === 1 ? 'y' : 'ies'}`} /></td>
                  <td className="td">{s.won ? money(s.won) : <span className="text-muted">—</span>}</td>
                  <td className="td"><Cell primary={c.ownerId ? userById.get(c.ownerId)?.name : 'Unassigned'} /></td>
                  <td className="td" onClick={(e) => e.stopPropagation()}><div className="flex gap-1">
                    <IconAction label={`Edit ${c.name}`} onClick={() => setForm({ open: true, company: c })}><Edit2 size={18} color={C.muted} /></IconAction>
                    <IconAction label={`Delete ${c.name}`} onClick={() => setConfirm(c)} danger><Trash size={18} color={C.muted} /></IconAction>
                  </div></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {slice.length === 0 && <Empty text={db.companies.length ? 'No companies match.' : 'No companies yet. They are created automatically when you add a lead.'} />}
      </div>
      <Pagination page={page} pages={pages} onPage={setPage} />
      <CompanyForm open={form.open} company={form.company} onClose={() => setForm({ open: false })} onSaved={(c) => !form.company && navigate(`/companies/${c.id}`)} />
      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} text={`Delete ${confirm?.name}? This only works when the company has no leads, opportunities or invoices; its contacts are deleted with it.`}
        onConfirm={() => confirm && attempt(() => remove('companies', confirm.id, confirm.name))} />
    </>
  )
}

function ContactTable({ switcher }: { switcher: ReactNode }) {
  const { db, remove, attempt } = useStore()
  const { companyById } = useLookups()
  const [q, setQ] = useState('')
  const [form, setForm] = useState<{ open: boolean; contact?: Contact }>({ open: false })
  const [confirm, setConfirm] = useState<Contact | null>(null)
  const leadCount = useMemo(() => {
    const m = new Map<string, number>()
    db.leads.forEach((l) => l.status !== 'Disqualified' && m.set(l.contactId, (m.get(l.contactId) ?? 0) + 1))
    return m
  }, [db.leads])
  const rows = useMemo(() => {
    const s = q.toLowerCase()
    return db.contacts.filter((c) => !s || [c.name, c.email, c.title, companyById.get(c.companyId)?.name].some((v) => v?.toLowerCase().includes(s))).sort((a, b) => a.name.localeCompare(b.name))
  }, [db.contacts, q, companyById])
  const { page, pages, setPage, slice } = usePaged(rows, db.settings.pageSize)
  return (
    <>
      <Toolbar title="All Contacts">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search name, email, title, company" className="w-64" pill />
        <RoundAction label="Add contact" onClick={() => setForm({ open: true })}><Add size={18} color="currentColor" /></RoundAction>
      </Toolbar>
      {switcher}
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[960px] table-fixed">
            <Cols w={[28, 26, 16, 10, 10, 10]} />
          <thead><tr className="bg-sky-light">
            {['Contact', 'Company', 'Phone', 'Decision maker', 'Active leads'].map((h, i) => <th key={h} className={`th ${i === 0 ? 'rounded-l-lg pl-4' : ''}`}>{h}</th>)}
            <th className="th rounded-r-lg">Action</th>
          </tr></thead>
          <tbody>
            {slice.map((c) => (
              <tr key={c.id} className="border-b border-line hover:bg-canvas">
                <td className="td pl-4"><div className="flex items-center gap-3"><Avatar src={c.avatar} name={c.name} size={36} /><Cell primary={c.name} secondary={c.email ?? 'No email'} /></div></td>
                <td className="td"><Cell primary={<Link to={`/companies/${c.companyId}`} className="hover:text-sky-accent">{companyById.get(c.companyId)?.name}</Link>} secondary={c.title ?? 'Title unknown'} /></td>
                <td className="td"><Cell primary={c.phone ?? '—'} secondary={c.preferredContact ? `Prefers ${c.preferredContact}` : undefined} /></td>
                <td className="td">{c.isDecisionMaker ? 'Yes' : '—'}</td>
                <td className="td">{leadCount.get(c.id) ?? 0}</td>
                <td className="td"><div className="flex gap-1">
                  <IconAction label={`Edit ${c.name}`} onClick={() => setForm({ open: true, contact: c })}><Edit2 size={18} color={C.muted} /></IconAction>
                  <IconAction label={`Delete ${c.name}`} onClick={() => setConfirm(c)} danger><Trash size={18} color={C.muted} /></IconAction>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {slice.length === 0 && <Empty text="No contacts found." />}
      </div>
      <Pagination page={page} pages={pages} onPage={setPage} />
      <ContactForm open={form.open} contact={form.contact} onClose={() => setForm({ open: false })} />
      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} text={`Delete ${confirm?.name}? Contacts that are the primary contact of a lead cannot be deleted.`} onConfirm={() => confirm && attempt(() => remove('contacts', confirm.id, confirm.name))} />
    </>
  )
}
