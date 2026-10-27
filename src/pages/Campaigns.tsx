import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Add, Edit2, Send2, Setting4, Trash } from 'iconsax-react'
import type { Campaign } from '../../shared/model'
import { useStore } from '../store/Store'
import { Card, ConfirmModal, Dropdown, Empty, Modal, RoundAction, SearchInput, IconAction } from '../components/ui'
import { CampaignForm } from '../components/forms'
import { cx, fullDate } from '../lib/format'
import { C } from '../lib/theme'

const TAG_TONES = ['bg-sky-light text-sky-accent', 'bg-lavender-light text-lavender-ink', 'bg-sun-light text-sun-ink']

export default function Campaigns() {
  const { db, remove, attempt } = useStore()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('All tags')
  const [showFilter, setShowFilter] = useState(false)
  const [form, setForm] = useState<{ open: boolean; campaign?: Campaign }>({ open: false })
  const [confirm, setConfirm] = useState<Campaign | null>(null)
  const [reading, setReading] = useState(false)

  const tags = ['All tags', ...new Set(db.campaigns.flatMap((c) => c.tags))]
  const list = useMemo(() => db.campaigns.filter((c) =>
    (!q || [c.title, c.author].some((v) => v.toLowerCase().includes(q.toLowerCase()))) && (tag === 'All tags' || c.tags.includes(tag))), [db.campaigns, q, tag])
  const activeId = params.get('id') ?? list[0]?.id
  const active = db.campaigns.find((c) => c.id === activeId)
  const campaignLeads = db.leads.filter((l) => l.source === 'Campaign').length
  useEffect(() => { if (!active && list[0]) setParams({ id: list[0].id }, { replace: true }) }, [active, list, setParams])

  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="card-title mr-auto">Campaign Board</h1>
        <span className="text-[12px] text-muted">{campaignLeads} lead{campaignLeads === 1 ? '' : 's'} with source “Campaign”</span>
        <SearchInput value={q} onChange={setQ} placeholder="Search by title or owner" className="w-60" pill />
        <RoundAction label="Filter by tag" active={showFilter} onClick={() => setShowFilter((s) => !s)}><Setting4 size={16} color="currentColor" /></RoundAction>
        <RoundAction label="New campaign" onClick={() => setForm({ open: true })}><Add size={18} color="currentColor" /></RoundAction>
      </div>
      {showFilter && <div className="mb-4"><Dropdown label="Tag" value={tag} options={tags} onChange={setTag} /></div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {list.length === 0 && <Empty text={db.campaigns.length ? 'No campaigns match.' : 'No campaigns yet. Record outreach and marketing campaigns here.'} />}
          {list.map((c) => (
            <button key={c.id} onClick={() => setParams({ id: c.id }, { replace: true })} className={cx('rounded-xl border p-4 text-left transition-colors', c.id === activeId ? 'border-lavender bg-lavender-light' : 'border-line bg-white hover:bg-canvas')}>
              <div className="flex items-start gap-3">
                {c.image && <img src={c.image} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" loading="lazy" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[15px] font-medium">{c.title}</p>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] text-muted">{fullDate(c.date)}</span>
                  </div>
                  <p className="text-[11px] text-faint">By {c.author}</p>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed">{c.body}</p>
            </button>
          ))}
        </div>

        {active && (
          <aside className="rounded-xl border border-line p-3 lg:sticky lg:top-6 lg:self-start">
            {active.image && <img src={active.image} alt="" className="h-40 w-full rounded-lg object-cover" />}
            <div className="mt-3 flex items-start justify-between gap-2">
              <h2 className="text-[15px] font-medium">{active.title}</h2>
              <div className="flex gap-1">
                <IconAction label="Edit campaign" onClick={() => setForm({ open: true, campaign: active })}><Edit2 size={18} color={C.muted} /></IconAction>
                <IconAction label="Delete campaign" onClick={() => setConfirm(active)} danger><Trash size={18} color={C.muted} /></IconAction>
              </div>
            </div>
            <p className="text-[11px] text-faint">By {active.author} · {fullDate(active.date)}</p>
            <p className="scroll-thin mt-4 max-h-[220px] overflow-y-auto pr-1 text-[12px] leading-relaxed">{active.body}</p>
            {active.tags.length > 0 && <>
              <p className="mt-4 text-[11px] font-medium">Tag</p>
              <div className="mt-2 flex flex-wrap gap-2">{active.tags.map((t, i) => <span key={t} className={cx('rounded-full px-3 py-1 text-[11px]', TAG_TONES[i % 3])}>{t}</span>)}</div>
            </>}
            <button onClick={() => setReading(true)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-sky py-2.5 text-[12px] font-medium transition-colors hover:bg-sky-hover">Read Full Page <Send2 size={14} color={C.ink} variant="Bold" /></button>
          </aside>
        )}
      </div>

      <Modal open={reading && !!active} onClose={() => setReading(false)} title={active?.title ?? ''} width={680}>
        {active && <>
          {active.image && <img src={active.image} alt="" className="h-64 w-full rounded-xl object-cover" />}
          <p className="mt-4 text-[12px] text-muted">By {active.author} · {fullDate(active.date)}</p>
          <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed">{active.body}</p>
        </>}
      </Modal>
      <CampaignForm open={form.open} campaign={form.campaign} onClose={() => setForm({ open: false })} />
      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} text={`Delete campaign “${confirm?.title}”?`} onConfirm={async () => { if (confirm && await attempt(() => remove('campaigns', confirm.id, confirm.title))) setParams({}, { replace: true }) }} />
    </Card>
  )
}
