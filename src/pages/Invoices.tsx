import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Add, Edit2, Trash } from 'iconsax-react'
import { INVOICE_STATUSES, type Invoice } from '../../shared/model'
import { useLookups, useStore } from '../store/Store'
import { Card, Cell, Cols, ConfirmModal, Dropdown, Empty, IconAction, MoreButton, Pagination, Pill, RoundAction, SearchInput, usePaged } from '../components/ui'
import { ChartEmpty, TipBox } from '../components/widgets'
import { InvoiceForm } from '../components/forms'
import { useMoney } from '../lib/hooks'
import { longDate, MONTHS_SHORT, parseDate } from '../lib/format'
import { C } from '../lib/theme'

const AXIS = { fontSize: 12, fill: C.faint }
const total = (i: Invoice) => i.subtotal + i.tax - i.discount

function Spark() {
  return <svg width="48" height="24" viewBox="0 0 48 24" fill="none" aria-hidden><path d="M2 14c3 0 3-8 6-8s3 14 6 14 3-16 6-16 3 12 6 12 3-8 6-8 3 6 6 6 3-10 6-10" stroke={C.white} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export default function Invoices() {
  const { db, remove, attempt } = useStore()
  const { companyById, oppById } = useLookups()
  const money = useMoney()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [form, setForm] = useState<{ open: boolean; invoice?: Invoice }>({ open: false })
  const [confirm, setConfirm] = useState<Invoice | null>(null)

  const rows = useMemo(() => db.invoices.filter((i) => (!q || [i.code, i.item, companyById.get(i.companyId)?.name].some((v) => v?.toLowerCase().includes(q.toLowerCase()))) && (status === 'All statuses' || i.status === status)), [db.invoices, q, status, companyById])
  const { page, pages, setPage, slice } = usePaged(rows, db.settings.pageSize)
  const sum = (f: (i: Invoice) => boolean) => db.invoices.filter(f).reduce((a, i) => a + total(i), 0)
  const year = new Date().getFullYear()
  const series = MONTHS_SHORT.map((m, idx) => ({ m, v: db.invoices.filter((i) => i.status === 'Paid' && parseDate(i.dueDate).getFullYear() === year && parseDate(i.dueDate).getMonth() === idx).reduce((a, i) => a + total(i), 0) }))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
        <Card>
          <div className="mb-2 flex items-center justify-between"><h2 className="card-title">Collections {year}</h2><MoreButton /></div>
          {series.every((s) => !s.v) ? <ChartEmpty text={`No paid invoices in ${year}.`} /> : (
            <div className="h-[240px]">
              <ResponsiveContainer>
                <AreaChart data={series} margin={{ left: 8, right: 8, top: 30 }}>
                  <defs><linearGradient id="fee" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.sun} stopOpacity={0.45} /><stop offset="100%" stopColor={C.sun} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke={C.line} strokeDasharray="3 3" />
                  <XAxis dataKey="m" axisLine={false} tickLine={false} tick={AXIS} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={AXIS} tickFormatter={(v) => money(Number(v), true)} width={64} />
                  <Tooltip cursor={{ stroke: C.sun, strokeWidth: 4 }} content={({ active, payload, label }) => active && payload?.length ? <TipBox><p className="text-[14px] font-semibold">{money(Number(payload[0].value))}</p><p className="text-muted">Paid · {label} {year}</p></TipBox> : null} />
                  <Area type="monotone" dataKey="v" stroke={C.sun} strokeWidth={3} fill="url(#fee)" activeDot={{ r: 8, fill: C.sun, stroke: '#fff', strokeWidth: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <div className="grid grid-cols-2 gap-6">
          {[['Total invoiced', sum(() => true)], ['Paid', sum((i) => i.status === 'Paid')], ['Pending', sum((i) => i.status === 'Pending')], ['Overdue', sum((i) => i.status === 'Overdue')]].map(([l, v]) => (
            <div key={l as string} className="rounded-card bg-sky p-5"><Spark /><p className="mt-5 truncate text-[22px] font-semibold leading-none">{money(v as number)}</p><p className="mt-3 text-[13px]">{l}</p></div>
          ))}
        </div>
      </div>

      <Card>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <h1 className="card-title mr-auto">Invoices</h1>
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search client, item or invoice #" className="w-64" pill />
          <Dropdown label="Status" value={status} options={['All statuses', ...INVOICE_STATUSES]} onChange={(v) => { setStatus(v); setPage(1) }} />
          <RoundAction label="New invoice" onClick={() => setForm({ open: true })}><Add size={18} color="currentColor" /></RoundAction>
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[960px] table-fixed">
            <Cols w={[9, 22, 17, 14, 10, 10, 10, 8]} />
            <thead><tr className="bg-sky-light">
              {['Invoice', 'Client', 'Item', 'Subtotal', 'Amount', 'Due date', 'Status'].map((h, i) => <th key={h} className={`th ${i === 0 ? 'rounded-l-lg pl-4' : ''}`}>{h}</th>)}
              <th className="th rounded-r-lg">Action</th>
            </tr></thead>
            <tbody>
              {slice.map((i) => (
                <tr key={i.id} className="border-b border-line hover:bg-canvas">
                  <td className="td pl-4 font-medium">{i.code}</td>
                  <td className="td"><Cell primary={<Link to={`/companies/${i.companyId}`} className="hover:text-sky-accent">{companyById.get(i.companyId)?.name}</Link>} secondary={i.opportunityId ? <Link to={`/opportunities/${i.opportunityId}`} className="hover:text-sky-accent">{oppById.get(i.opportunityId)?.name}</Link> : 'No linked opportunity'} /></td>
                  <td className="td"><Cell primary={i.item} /></td>
                  <td className="td"><Cell primary={money(i.subtotal)} secondary={`tax ${money(i.tax)} · discount ${money(i.discount)}`} /></td>
                  <td className="td font-medium">{money(total(i))}</td>
                  <td className="td">{longDate(i.dueDate)}</td>
                  <td className="td"><Pill>{i.status}</Pill></td>
                  <td className="td"><div className="flex gap-1">
                    <IconAction label="Edit invoice" onClick={() => setForm({ open: true, invoice: i })}><Edit2 size={18} color={C.muted} /></IconAction>
                    <IconAction label="Delete invoice" onClick={() => setConfirm(i)} danger><Trash size={18} color={C.muted} /></IconAction>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {slice.length === 0 && <Empty text={db.invoices.length ? 'No invoices match.' : 'No invoices yet. Invoice won opportunities by delivery milestone.'} />}
        </div>
        <Pagination page={page} pages={pages} onPage={setPage} />
      </Card>
      <InvoiceForm open={form.open} invoice={form.invoice} onClose={() => setForm({ open: false })} />
      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} text={`Delete invoice ${confirm?.code}?`} onConfirm={() => confirm && attempt(() => remove('invoices', confirm.id, `Invoice ${confirm.code}`))} />
    </div>
  )
}
