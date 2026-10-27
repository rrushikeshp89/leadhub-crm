import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Add, ArrowDown2, ArrowRight2, Box, Building, Calendar, Call, DollarSquare, HambergerMenu, Home2, Logout, Messages2, Note1,
  Notification, People, Profile2User, ProfileCircle, Setting2, Sms, Teacher, type IconProps,
} from 'iconsax-react'
import { isDueToday, isOverdue } from '../../shared/calc'
import { useLookups, useStore } from '../store/Store'
import { Avatar, SearchInput, useClickAway } from './ui'
import { EventForm, LeadIntakeForm, OpportunityForm, TaskForm } from './forms'
import { cx, timeAgo } from '../lib/format'
import { C } from '../lib/theme'

type NavItem = { to: string; label: string; icon: ComponentType<IconProps>; children?: { to: string; label: string }[]; match?: string[] }

const MENU: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: Home2, match: ['/', '/my-day'] },
  { to: '/team', label: 'Sales Team', icon: Teacher },
  { to: '/leads', label: 'Leads', icon: Profile2User },
  { to: '/companies', label: 'Companies', icon: Building },
  { to: '/follow-ups', label: 'Follow-ups', icon: People },
  {
    to: '/pipeline', label: 'Deals', icon: DollarSquare,
    children: [{ to: '/pipeline', label: 'Pipeline Board' }, { to: '/opportunities', label: 'Opportunities' }, { to: '/proposals', label: 'Proposals' }, { to: '/invoices', label: 'Invoices' }],
  },
  { to: '/campaigns', label: 'Campaigns', icon: Note1 },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/services', label: 'Services', icon: Box },
  { to: '/messages', label: 'Message', icon: Messages2 },
]
const OTHER: NavItem[] = [
  { to: '/profile', label: 'Profile', icon: ProfileCircle },
  { to: '/settings', label: 'Setting', icon: Setting2 },
]

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx('flex items-center gap-2.5', className)}>
      <img src="/logo.svg" alt="" className="h-6 w-6" />
      <span className="text-[20px] font-semibold tracking-tight text-ink">LeadHub</span>
    </Link>
  )
}

function SideLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const { pathname } = useLocation()
  const paths = item.children ? item.children.map((c) => c.to) : item.match ?? [item.to]
  const inSection = paths.some((p) => (p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(p + '/')))
  const [open, setOpen] = useState(inSection)
  useEffect(() => { if (inSection) setOpen(true) }, [inSection])
  const Icon = item.icon
  const cls = cx('flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[15px] transition-colors', inSection ? 'bg-sky text-ink' : 'text-muted hover:bg-canvas hover:text-ink')
  if (!item.children) {
    return (
      <NavLink to={item.to} className={cls} onClick={onNavigate}>
        <Icon size={20} color={inSection ? C.ink : C.muted} />
        {item.label}
      </NavLink>
    )
  }
  return (
    <div>
      <button className={cls} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon size={20} color={inSection ? C.ink : C.muted} />
        <span className="flex-1 text-left">{item.label}</span>
        {open ? <ArrowDown2 size={14} color="currentColor" /> : <ArrowRight2 size={14} color="currentColor" />}
      </button>
      {open && (
        <div className="ml-[22px] mt-2 border-l-2 border-sky pl-4">
          {item.children.map((c) => (
            <NavLink key={c.to} to={c.to} onClick={onNavigate}
              className={({ isActive }) => cx('block py-1.5 text-[14px] transition-colors', isActive ? 'text-ink' : 'text-muted hover:text-ink')}>
              {c.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

function AppBanner() {
  return (
    <div className="banner-app relative mt-6 min-h-[160px] overflow-hidden rounded-xl p-4 text-white">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(115deg,transparent 45%,rgba(255,255,255,.35) 46%,rgba(255,255,255,.05) 62%,transparent 63%)' }} />
      <div className="banner-app-fold pointer-events-none absolute -bottom-6 -left-4 h-24 w-56 rotate-[-18deg]" />
      <div className="pointer-events-none absolute -right-10 top-10 h-40 w-24 rotate-[28deg]" style={{ background: 'linear-gradient(180deg,rgba(255,255,255,.55),rgba(96,223,250,.2))' }} />
      <p className="relative text-[13px] font-medium leading-[1.35]">Share your<br />inquiry form and<br />capture new leads</p>
      <a href="/inquiry" target="_blank" rel="noreferrer" className="relative mt-8 block w-full rounded-full bg-white py-2 text-center text-[11px] font-semibold text-ink transition-colors hover:bg-sky-light">Open Inquiry Form</a>
    </div>
  )
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logout } = useStore()
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-ink/20 lg:hidden" onClick={onClose} />}
      <aside className={cx(
        'scroll-thin fixed inset-y-0 left-0 z-40 flex w-[220px] flex-col overflow-y-auto bg-white px-4 pb-5 pt-6 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}>
        <Logo className="px-3" />
        <p className="mb-2 mt-7 px-3 text-[12px] uppercase tracking-wide text-faint">Menu</p>
        <nav className="flex flex-col gap-1">{MENU.map((m) => <SideLink key={m.label} item={m} onNavigate={onClose} />)}</nav>
        <p className="mb-2 mt-6 px-3 text-[12px] uppercase tracking-wide text-faint">Other</p>
        <nav className="flex flex-col gap-1">
          {OTHER.map((m) => <SideLink key={m.label} item={m} onNavigate={onClose} />)}
          <button onClick={() => void logout()} className="flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] text-muted transition-colors hover:bg-canvas hover:text-ink">
            <Logout size={20} color={C.muted} /> Log out
          </button>
        </nav>
        <div className="mt-auto hidden [@media(min-height:860px)]:block"><AppBanner /></div>
      </aside>
    </>
  )
}

/* ---------- global search ---------- */
function HeaderSearch() {
  const { db } = useStore()
  const { companyById } = useLookups()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useClickAway<HTMLDivElement>(() => setOpen(false))
  const navigate = useNavigate()
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    const hit = (...xs: (string | null | undefined)[]) => xs.some((x) => x?.toLowerCase().includes(s))
    const co = (id: string) => companyById.get(id)?.name ?? ''
    return [
      { label: 'Leads', items: db.leads.filter((l) => hit(l.title, l.code, co(l.companyId))).slice(0, 5).map((l) => ({ id: l.id, title: l.title, sub: `${co(l.companyId)} · ${l.status}`, to: `/leads/${l.id}` })) },
      { label: 'Opportunities', items: db.opportunities.filter((o) => hit(o.name, o.code, co(o.companyId))).slice(0, 5).map((o) => ({ id: o.id, title: o.name, sub: `${co(o.companyId)} · ${o.stage}`, to: `/opportunities/${o.id}` })) },
      { label: 'Companies', items: db.companies.filter((c) => hit(c.name, c.website, c.industry)).slice(0, 5).map((c) => ({ id: c.id, title: c.name, sub: [c.industry, c.location].filter(Boolean).join(' · '), to: `/companies/${c.id}` })) },
      { label: 'Contacts', items: db.contacts.filter((c) => hit(c.name, c.email, c.title)).slice(0, 5).map((c) => ({ id: c.id, title: c.name, sub: `${c.title ?? 'Contact'} · ${co(c.companyId)}`, to: `/companies/${c.companyId}` })) },
    ].filter((g) => g.items.length)
  }, [q, db.leads, db.opportunities, db.companies, db.contacts, companyById])
  return (
    <div ref={ref} className="relative w-full max-w-[300px]">
      <div onFocus={() => setOpen(true)}>
        <SearchInput value={q} onChange={(v) => { setQ(v); setOpen(true) }} pill className="h-10 bg-transparent" placeholder="Search leads, companies, deals…" />
      </div>
      {open && q.trim().length >= 2 && (
        <div className="scroll-thin absolute left-0 top-12 z-30 max-h-[70vh] w-[min(92vw,380px)] overflow-y-auto rounded-xl bg-white p-2 shadow-pop">
          {groups.length === 0 && <p className="px-3 py-2 text-[12px] text-muted">Nothing matches “{q}”</p>}
          {groups.map((g) => (
            <div key={g.label} className="mb-1">
              <p className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-wide text-faint">{g.label}</p>
              {g.items.map((it) => (
                <button key={it.id} onClick={() => { navigate(it.to); setQ(''); setOpen(false) }} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-canvas">
                  <span className="block truncate text-[13px]">{it.title}</span>
                  <span className="block truncate text-[11px] text-muted">{it.sub}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Popover({ icon, label, badge, children, width = 320 }: { icon: ReactNode; label: string; badge?: number; children: (close: () => void) => ReactNode; width?: number }) {
  const [open, setOpen] = useState(false)
  const ref = useClickAway<HTMLDivElement>(() => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button aria-label={label} title={label} onClick={() => setOpen((o) => !o)} className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white transition-colors hover:bg-sky-light">
        {icon}
        {!!badge && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white">{badge > 9 ? '9+' : badge}</span>}
      </button>
      {open && <div className="absolute right-0 top-14 z-30 rounded-xl bg-white p-3 shadow-pop" style={{ width }}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

function Header({ onMenu }: { onMenu: () => void }) {
  const { db, me, logout } = useStore()
  const { leadById, oppById } = useLookups()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const [quick, setQuick] = useState<null | 'lead' | 'opp' | 'task' | 'event'>(null)
  const ref = useClickAway<HTMLDivElement>(() => setMenu(false))
  const mine = db.tasks.filter((t) => t.ownerId === me.id)
  const overdue = mine.filter((t) => isOverdue(t))
  const today = mine.filter((t) => isDueToday(t))
  const label = (t: (typeof mine)[number]) => (t.opportunityId ? oppById.get(t.opportunityId)?.name : t.leadId ? leadById.get(t.leadId)?.title : undefined)
  const taskLink = (t: (typeof mine)[number]) => (t.opportunityId ? `/opportunities/${t.opportunityId}` : t.leadId ? `/leads/${t.leadId}` : '/follow-ups')
  return (
    <header className="flex items-center gap-2 pb-6 sm:gap-4">
      <button aria-label="Open menu" onClick={onMenu} className="rounded-lg bg-white p-2 lg:hidden"><HambergerMenu size={22} color={C.ink} /></button>
      <HeaderSearch />
      {db.settings.demoData && (
        <Link to="/settings" className="hidden rounded-full bg-sun-light px-3 py-1 text-[11px] font-medium text-sun-ink md:inline" title="The CRM contains fictional sample records. Clear them in Settings.">Demo data</Link>
      )}
      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <Popover label="Quick add" width={220} icon={<Add size={22} color={C.ink} />}>
          {(close) => (
            <div className="flex flex-col">
              {([['lead', 'Add lead'], ['opp', 'New opportunity'], ['task', 'Schedule follow-up'], ['event', 'Book meeting']] as const).map(([k, l]) => (
                <button key={k} onClick={() => { close(); setQuick(k) }} className="rounded-lg px-3 py-2 text-left text-[13px] hover:bg-canvas">{l}</button>
              ))}
            </div>
          )}
        </Popover>
        <div className="hidden sm:block">
        <Popover label="Messages" icon={<Messages2 size={20} color={C.ink} variant="Bold" />}>
          {(close) => (
            <>
              <div className="mb-2 flex items-center justify-between px-1"><span className="text-[14px] font-medium">Team messages</span><Link to="/messages" onClick={close} className="link-muted">View All</Link></div>
              {db.conversations.slice(0, 4).map((c) => {
                const last = db.messages.filter((m) => m.conversationId === c.id).at(-1)
                return (
                  <Link key={c.id} to={`/messages?c=${c.id}`} onClick={close} className="block rounded-lg p-2 hover:bg-canvas">
                    <span className="block truncate text-[13px] font-medium">{c.name}</span>
                    <span className="block truncate text-[12px] text-muted">{last ? `${last.author}: ${last.body}` : 'No messages yet'}</span>
                  </Link>
                )
              })}
            </>
          )}
        </Popover>
        </div>
        <Popover label="Follow-up reminders" badge={overdue.length + today.length} width={340} icon={<Notification size={20} color={C.ink} variant="Bold" />}>
          {(close) => (
            <>
              <div className="mb-2 flex items-center justify-between px-1"><span className="text-[14px] font-medium">Your follow-ups</span><Link to="/follow-ups" onClick={close} className="link-muted">All tasks</Link></div>
              {!overdue.length && !today.length && <p className="px-1 py-2 text-[12px] text-muted">Nothing overdue or due today.</p>}
              {[...overdue, ...today].slice(0, 6).map((t) => (
                <Link key={t.id} to={taskLink(t)} onClick={close} className="block rounded-lg p-2 hover:bg-canvas">
                  <span className={cx('block text-[11px] font-semibold uppercase', isOverdue(t) ? 'text-danger' : 'text-warn')}>{isOverdue(t) ? `Overdue · ${t.dueDate}` : 'Due today'}</span>
                  <span className="block truncate text-[13px]">{t.title}</span>
                  {label(t) && <span className="block truncate text-[11px] text-muted">{label(t)}</span>}
                </Link>
              ))}
              <p className="mt-2 border-t border-line px-1 pt-2 text-[11px] text-faint">In-app reminders only — no email or push notifications are sent.</p>
              {db.activities.length > 0 && <p className="mt-1 px-1 text-[11px] text-faint">Last activity {timeAgo([...db.activities].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0].occurredAt)}</p>}
            </>
          )}
        </Popover>
        <div ref={ref} className="relative">
          <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-3 text-right" aria-label="Account menu">
            <span className="hidden sm:block">
              <span className="block text-[15px] font-semibold leading-tight">{me.name}</span>
              <span className="block text-[11px] text-muted">{me.role === 'admin' ? 'Admin' : me.title ?? 'Sales Rep'}</span>
            </span>
            <Avatar src={me.avatar} name={me.name} size={44} online />
          </button>
          {menu && (
            <div className="absolute right-0 top-14 z-30 w-56 rounded-xl bg-white p-1.5 shadow-pop">
              <Link to="/my-day" onClick={() => setMenu(false)} className="block rounded-lg px-3 py-2 text-[13px] hover:bg-canvas">My day</Link>
              <Link to="/profile" onClick={() => setMenu(false)} className="block rounded-lg px-3 py-2 text-[13px] hover:bg-canvas">My profile</Link>
              <Link to="/settings" onClick={() => setMenu(false)} className="block rounded-lg px-3 py-2 text-[13px] hover:bg-canvas">Settings</Link>
              <button className="block w-full rounded-lg px-3 py-2 text-left text-[13px] text-danger hover:bg-canvas" onClick={() => void logout()}>Log out</button>
            </div>
          )}
        </div>
      </div>
      <LeadIntakeForm open={quick === 'lead'} onClose={() => setQuick(null)} onCreated={(l) => navigate(`/leads/${l.id}`)} />
      <OpportunityForm open={quick === 'opp'} onClose={() => setQuick(null)} onSaved={(o) => navigate(`/opportunities/${o.id}`)} />
      <TaskForm open={quick === 'task'} onClose={() => setQuick(null)} />
      <EventForm open={quick === 'event'} onClose={() => setQuick(null)} />
    </header>
  )
}

function Footer() {
  const { db, me } = useStore()
  return (
    <footer className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-faint">
      <span className="flex items-center gap-2"><Sms size={16} color={C.faint} variant="Bold" />{me.email}</span>
      {me.phone && <span className="flex items-center gap-2"><Call size={16} color={C.faint} variant="Bold" />{me.phone}</span>}
      <span className="ml-auto flex flex-wrap gap-6">
        {db.settings.demoData && <span className="text-sun-ink">Showing fictional demo data</span>}
        <span>Copyright © {db.settings.companyName}</span>
      </span>
    </footer>
  )
}

function Toasts() {
  const { toasts } = useStore()
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx('rounded-xl px-4 py-3 text-[13px] font-medium shadow-pop', t.tone === 'success' ? 'bg-sky text-ink' : 'bg-danger-light text-danger')}>{t.text}</div>
      ))}
    </div>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-6">
        <Header onMenu={() => setOpen(true)} />
        <main><Outlet /></main>
        <Footer />
      </div>
      <Toasts />
    </div>
  )
}
