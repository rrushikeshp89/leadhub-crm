import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowDown2, ArrowUp, CloseCircle, SearchNormal1, TickSquare } from 'iconsax-react'
import { cx } from '../lib/format'
import { C } from '../lib/theme'

/* ---------- Card ---------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('card p-5', className)}>{children}</section>
}

export function CardHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-4 flex items-center justify-between gap-3', className)}>
      <h2 className="card-title">{title}</h2>
      {action}
    </div>
  )
}

/** The "ooo" menu used on every card in the template */
export function MoreButton({ items, light }: { items?: { label: string; onClick: () => void }[]; light?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useClickAway<HTMLDivElement>(() => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button
        aria-label="More options"
        onClick={() => setOpen((o) => !o)}
        className={cx('flex h-7 w-8 items-center justify-center rounded-md transition-colors', light ? 'hover:bg-white/40' : 'hover:bg-canvas')}
      >
        <OooIcon />
      </button>
      {open && items && items.length > 0 && (
        <div className="absolute right-0 top-8 z-30 min-w-[150px] rounded-xl bg-white p-1.5 shadow-pop">
          {items.map((it) => (
            <button key={it.label} onClick={() => { setOpen(false); it.onClick() }} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] text-ink hover:bg-canvas">
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function OooIcon({ className }: { className?: string }) {
  return (
    <svg width="22" height="6" viewBox="0 0 22 6" fill="none" className={className}>
      <circle cx="3" cy="3" r="2.2" stroke={C.muted} strokeWidth="1.2" />
      <circle cx="11" cy="3" r="2.2" stroke={C.muted} strokeWidth="1.2" />
      <circle cx="19" cy="3" r="2.2" stroke={C.muted} strokeWidth="1.2" />
    </svg>
  )
}

/* ---------- Trend badge (↑ 15%) ---------- */
export function Trend({ value, className }: { value: number; className?: string }) {
  const up = value >= 0
  return (
    <span className={cx('inline-flex items-center gap-0.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold', up ? 'text-success' : 'text-danger', className)}>
      {up ? <ArrowUp size={11} color="currentColor" /> : <ArrowDown size={11} color="currentColor" />}
      {Math.abs(value)}%
    </span>
  )
}

/* ---------- Status pill ---------- */
const PILL = {
  sky: 'bg-sky-light text-sky-accent',
  warn: 'bg-warn-light text-warn',
  danger: 'bg-danger-light text-danger',
  lavender: 'bg-lavender-light text-lavender-ink',
  sun: 'bg-sun-light text-sun-ink',
  green: 'bg-success-light text-success',
  gray: 'bg-canvas text-muted',
}
export type Tone = keyof typeof PILL
export const STATUS_TONE: Record<string, Tone> = {
  // lead status
  'New Lead': 'lavender', Contacted: 'sky', 'Discovery Scheduled': 'sun', 'Discovery Completed': 'sun', Qualified: 'green', Disqualified: 'gray',
  // pipeline stages
  'Qualified Opportunity': 'green', 'Solution Design': 'sky', 'Proposal Sent': 'warn', Negotiation: 'warn', 'Closed Won': 'green', 'Closed Lost': 'danger',
  // temperature
  Hot: 'danger', Warm: 'warn', Cold: 'sky',
  // proposals
  Draft: 'gray', 'In Review': 'lavender', Sent: 'sky', Accepted: 'green', Rejected: 'danger', Expired: 'gray',
  // tasks / priorities
  Open: 'sky', Completed: 'green', High: 'danger', Medium: 'warn', Low: 'gray', Overdue: 'danger', 'Due today': 'warn',
  // invoices / services
  Paid: 'sky', Pending: 'warn', Active: 'sky', Inactive: 'gray',
}
export function Pill({ children, tone, dot = true, className }: { children: ReactNode; tone?: Tone; dot?: boolean; className?: string }) {
  const t = tone ?? STATUS_TONE[String(children)] ?? 'gray'
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-medium', PILL[t], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/* ---------- Avatar ---------- */
export function Avatar({ src, name, size = 40, online, className }: { src?: string | null; name: string; size?: number; online?: boolean; className?: string }) {
  const [err, setErr] = useState(false)
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('')
  return (
    <span className={cx('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      {src && !err ? (
        <img src={src} alt={name} onError={() => setErr(true)} className="h-full w-full rounded-full bg-sky-light object-cover" loading="lazy" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-sky-light text-[12px] font-semibold text-sky-accent">{initials}</span>
      )}
      {online && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-success" />}
    </span>
  )
}

/* ---------- Search ---------- */
export function SearchInput({ value, onChange, placeholder = 'Search', className, pill }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; pill?: boolean }) {
  return (
    <label className={cx('flex h-9 items-center gap-2 border bg-white px-3.5 transition-colors focus-within:border-sky-accent', pill ? 'rounded-full border-faint' : 'rounded-lg border-line', className)}>
      <SearchNormal1 size={14} color={C.muted} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full min-w-0 bg-transparent text-[12px] text-ink outline-none placeholder:text-muted"
      />
    </label>
  )
}

/* ---------- Dropdown (Weekly ⌄ / Grade 3 ⌄) ---------- */
export function Dropdown<T extends string>({ value, options, onChange, icon, className, label, size = 'md', display, variant = 'canvas' }: {
  value: T; options: readonly T[]; onChange: (v: T) => void; icon?: ReactNode; className?: string; label?: string; size?: 'sm' | 'md'; display?: ReactNode
  /** canvas = on white cards (template); white = directly on the page background */
  variant?: 'canvas' | 'white'
}) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; minWidth: number } | null>(null)
  const ref = useClickAway<HTMLDivElement>(() => setPos(null))
  const btn = useRef<HTMLButtonElement>(null)
  // The menu is positioned against the viewport so table/card overflow never clips it
  const toggle = () => {
    if (pos) return setPos(null)
    const r = btn.current!.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    setPos({
      ...(below < 280 && r.top > below ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8)),
      minWidth: r.width,
    })
  }
  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [pos])
  return (
    <div ref={ref} className={cx('relative', className)}>
      <button
        ref={btn}
        type="button"
        aria-label={label ?? 'Select'}
        aria-haspopup="listbox"
        aria-expanded={!!pos}
        onClick={(e) => { e.stopPropagation(); toggle() }}
        className={cx('flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-md text-muted transition-colors hover:text-ink', variant === 'white' ? 'bg-white' : 'bg-canvas', size === 'sm' ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-[12px]')}
      >
        <span className="flex items-center gap-2 truncate">{icon}{display ?? value}</span>
        <ArrowDown2 size={12} color="currentColor" className="shrink-0" />
      </button>
      {pos && (
        <ul role="listbox" style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: pos.minWidth }} className="scroll-thin z-[70] max-h-64 overflow-auto rounded-xl bg-white p-1.5 shadow-pop">
          {options.map((o) => (
            <li key={o}>
              <button
                type="button"
                role="option"
                aria-selected={o === value}
                onClick={(e) => { e.stopPropagation(); onChange(o); setPos(null) }}
                className={cx('block w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-[12px] hover:bg-canvas', o === value ? 'bg-lavender-light text-ink' : 'text-ink')}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ---------- Checkbox ---------- */
export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      className={cx('flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors', checked ? 'border-sky-accent bg-sky-accent' : 'border-line-strong bg-white')}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke={C.white} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      )}
    </button>
  )
}

/* ---------- Round yellow action button (filter / +) ---------- */
export function RoundAction({ children, onClick, label, active }: { children: ReactNode; onClick?: () => void; label: string; active?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className={cx('flex h-8 w-8 items-center justify-center rounded-full transition-colors', active ? 'bg-sun-hover text-ink ring-2 ring-sun ring-offset-2' : 'bg-sun text-ink hover:bg-sun-hover')}>
      {children}
    </button>
  )
}

/* ---------- Pagination ---------- */
export function Pagination({ page, pages, onPage, numbered }: { page: number; pages: number; onPage: (p: number) => void; numbered?: boolean }) {
  const btn = 'rounded-md border border-line bg-white px-3.5 py-1.5 text-[12px] text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40'
  const nums: (number | '…')[] = []
  if (numbered) {
    for (let i = 1; i <= pages; i++) {
      if (i <= 4 || i === pages || Math.abs(i - page) <= 1) nums.push(i)
      else if (nums[nums.length - 1] !== '…') nums.push('…')
    }
  }
  return (
    <div className="mt-4 flex items-center justify-between">
      <button className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      {numbered ? (
        <div className="flex items-center gap-1">
          {nums.map((n, i) =>
            n === '…' ? <span key={i} className="px-1 text-[12px] text-muted">…</span> : (
              <button key={i} onClick={() => onPage(n)} className={cx('h-7 min-w-7 rounded-md px-2 text-[12px]', n === page ? 'bg-sky-light text-ink' : 'text-muted hover:text-ink')}>{n}</button>
            ))}
        </div>
      ) : (
        <span className="text-[12px] text-muted">Page {page} of {Math.max(1, pages)}</span>
      )}
      <button className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  )
}

export function usePaged<T>(rows: T[], size: number) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(rows.length / size))
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])
  return { page, pages, setPage, slice: rows.slice((page - 1) * size, page * size) }
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, footer, width = 560 }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number
}) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="card flex max-h-[90vh] w-full flex-col" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="card-title">{title}</h3>
          <button aria-label="Close" onClick={onClose} className="rounded-full p-1 hover:bg-canvas"><CloseCircle size={22} color={C.muted} /></button>
        </div>
        <div className="scroll-thin overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children, className, error, hint }: { label: string; children: ReactNode; className?: string; error?: string; hint?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[12px] text-muted">{label}</span>
      {children}
      {error ? <span role="alert" className="mt-1 block text-[11px] text-danger">{error}</span> : hint ? <span className="mt-1 block text-[11px] text-faint">{hint}</span> : null}
    </label>
  )
}

export function ConfirmModal({ open, onClose, onConfirm, text, confirmLabel = 'Delete' }: { open: boolean; onClose: () => void; onConfirm: () => void; text: string; confirmLabel?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Please confirm" width={420}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-danger" onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button></>}>
      <p className="text-[14px] text-muted">{text}</p>
    </Modal>
  )
}

export function Empty({ text = 'Nothing here yet' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-[13px] text-muted">
      <TickSquare size={28} color={C.sky} variant="Bulk" />
      {text}
    </div>
  )
}

/* ---------- helpers ---------- */
export function useClickAway<T extends HTMLElement>(fn: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) fn() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [fn])
  return ref
}

/* ---------- CRM helpers ---------- */

/** Shown wherever a value has not been captured yet — never guess a value */
export function Unknown({ text = 'Unknown' }: { text?: string }) {
  return <span className="italic text-faint">{text}</span>
}

export function KV({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
  return (
    <div className={className}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-ink">{empty ? <Unknown /> : value}</dd>
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: readonly { key: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cx('flex flex-wrap gap-1 rounded-lg bg-canvas p-1', className)}>
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={t.key === value} onClick={() => onChange(t.key)}
          className={cx('rounded-md px-3 py-1.5 text-[12px] transition-colors', t.key === value ? 'bg-lavender text-ink' : 'text-muted hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className={cx('ml-1.5', t.key === value ? 'text-ink/60' : 'text-faint')}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-label="Loading" className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky border-t-sky-accent', className)} />
}

export function Chips<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value: T[]; onChange: (v: T[]) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o)
        return (
          <button type="button" key={o} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cx('rounded-full border px-3 py-1 text-[12px] transition-colors', on ? 'border-lavender bg-lavender-light text-ink' : 'border-line bg-white text-muted hover:text-ink')}>
            {o}
          </button>
        )
      })}
    </div>
  )
}

export function SelectInput({ value, onChange, options, empty = 'Unknown', label, className }: {
  value: string | null | undefined; onChange: (v: string | null) => void; options: readonly (string | { value: string; label: string })[]; empty?: string | false; label?: string; className?: string
}) {
  return (
    <select aria-label={label} className={cx('input', className)} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {empty !== false && <option value="">{empty}</option>}
      {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Notice({ tone = 'sky', children, className }: { tone?: 'sky' | 'warn' | 'danger' | 'lavender'; children: ReactNode; className?: string }) {
  const t = { sky: 'bg-sky-light text-ink', warn: 'bg-sun-light text-ink', danger: 'bg-danger-light text-danger', lavender: 'bg-lavender-light text-ink' }[tone]
  return <div role={tone === 'danger' ? 'alert' : undefined} className={cx('rounded-lg px-4 py-3 text-[12px] leading-relaxed', t, className)}>{children}</div>
}

/* ---------- Layout primitives shared by every page ---------- */

/** Title row of a page card: title left, controls right (template list pages) */
export function Toolbar({ title, children, className, as = 'h1' }: { title: ReactNode; children?: ReactNode; className?: string; as?: 'h1' | 'h2' }) {
  const H = as
  return (
    <div className={cx('mb-5 flex flex-wrap items-center gap-3', className)}>
      <H className="card-title mr-auto">{title}</H>
      {children}
    </div>
  )
}

/** Row-level icon action in tables and lists (edit / delete) */
export function IconAction({ label, onClick, children, danger }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return <button type="button" aria-label={label} title={label} onClick={(e) => { e.stopPropagation(); onClick() }} className={danger ? 'icon-btn-danger' : 'icon-btn'}>{children}</button>
}

/** Small descriptive tag, e.g. "Rule-based", "primary service" */
export function Tag({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'sun' | 'lavender' }) {
  const t = { gray: 'bg-canvas text-muted', sun: 'bg-sun-light text-sun-ink', lavender: 'bg-lavender-light text-lavender-ink' }[tone]
  return <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-[11px]', t)}>{children}</span>
}

/** Table cell content: primary line + optional muted secondary line, both truncated (template list rows) */
export function Cell({ primary, secondary, max = 220, className }: { primary: ReactNode; secondary?: ReactNode; max?: number; className?: string }) {
  return (
    <div className={cx('min-w-0', className)} style={{ maxWidth: max }}>
      <div className="truncate">{primary}</div>
      {secondary !== undefined && secondary !== null && secondary !== '' && <div className="mt-0.5 truncate text-[11px] text-muted">{secondary}</div>}
    </div>
  )
}

/** Fixed column proportions for template-style tables (use with `table-fixed`) */
export function Cols({ w }: { w: number[] }) {
  return <colgroup>{w.map((x, i) => <col key={i} style={{ width: `${x}%` }} />)}</colgroup>
}
