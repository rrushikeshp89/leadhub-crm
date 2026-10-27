import { useCallback, useState } from 'react'
import type { Lead, Opportunity, Proposal, User } from '../../shared/model'
import { dayDiff, isOpen, isQualified, todayIso } from '../../shared/calc'

export interface LeadView { key: string; label: string; test: (l: Lead, me: User) => boolean }
const active = (l: Lead) => l.status !== 'Disqualified'

export const LEAD_VIEWS: LeadView[] = [
  { key: 'active', label: 'Active Leads', test: active },
  { key: 'mine', label: 'My Active Leads', test: (l, me) => active(l) && l.ownerId === me.id },
  { key: 'hot', label: 'Hot Leads', test: (l) => active(l) && l.temperature === 'Hot' },
  { key: 'new', label: 'New Inquiries', test: (l) => l.status === 'New Lead' },
  { key: 'qualified', label: 'Qualified', test: (l) => l.status === 'Qualified' },
  { key: 'due', label: 'Follow-ups Due Today', test: (l) => active(l) && l.nextFollowUp === todayIso() },
  { key: 'overdue', label: 'Overdue Follow-ups', test: (l) => active(l) && !!l.nextFollowUp && l.nextFollowUp < todayIso() },
  { key: 'disqualified', label: 'Disqualified', test: (l) => l.status === 'Disqualified' },
  { key: 'all', label: 'All', test: () => true },
]

export interface OppView { key: string; label: string; test: (o: Opportunity, me: User, proposals: Proposal[]) => boolean }
export const OPP_VIEWS: OppView[] = [
  { key: 'open', label: 'Open Pipeline', test: (o) => isOpen(o.stage) },
  { key: 'mine', label: 'My Opportunities', test: (o, me) => isOpen(o.stage) && o.ownerId === me.id },
  { key: 'qualified', label: 'Qualified Opportunities', test: (o) => isQualified(o.stage) },
  { key: 'awaiting', label: 'Proposals Awaiting Response', test: (o, _me, ps) => isOpen(o.stage) && ps.some((p) => p.opportunityId === o.id && p.status === 'Sent') },
  { key: 'overdue', label: 'Overdue Opportunities', test: (o) => isOpen(o.stage) && ((!!o.expectedCloseDate && o.expectedCloseDate < todayIso()) || (!!o.nextActionDate && o.nextActionDate < todayIso())) },
  { key: 'closed', label: 'Recently Closed', test: (o) => !isOpen(o.stage) && !!o.closedAt && dayDiff(o.closedAt, todayIso()) <= 30 },
  { key: 'won', label: 'Closed Won', test: (o) => o.stage === 'Closed Won' },
  { key: 'lost', label: 'Closed Lost', test: (o) => o.stage === 'Closed Lost' },
  { key: 'all', label: 'All', test: () => true },
]

/** Per-browser custom views (a viewer convenience; not shared between users) */
export function useSavedViews<F>(storageKey: string) {
  const read = (): { name: string; filters: F }[] => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]') } catch { return [] }
  }
  const [views, setViews] = useState(read)
  const write = (v: { name: string; filters: F }[]) => {
    setViews(v)
    try { localStorage.setItem(storageKey, JSON.stringify(v)) } catch { /* storage may be unavailable */ }
  }
  const save = useCallback((name: string, filters: F) => write([...read().filter((x) => x.name !== name), { name, filters }]), [storageKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const drop = useCallback((name: string) => write(read().filter((x) => x.name !== name)), [storageKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return { views, save, drop }
}
