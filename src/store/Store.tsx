import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  Activity, Bootstrap, CalEvent, Campaign, Company, Contact, Conversation, Invoice, Lead, Message, Opportunity, OrgSettings,
  Proposal, Service, Stage, Task, User,
} from '../../shared/model'
import { ApiError, del, get, patch, post } from '../lib/api'
import { uid } from '../lib/format'

/** Collections that use the generic /api/:entity endpoints */
type Entities = {
  companies: Company; contacts: Contact; leads: Lead; opportunities: Opportunity; tasks: Task; activities: Activity
  proposals: Proposal; events: CalEvent; campaigns: Campaign; services: Service; invoices: Invoice; users: User; conversations: Conversation
}
export type EntityName = keyof Entities

interface Toast { id: string; text: string; tone: 'success' | 'danger' }

interface StoreApi {
  db: Bootstrap
  me: User
  refresh: () => Promise<void>
  create: <E extends EntityName>(e: E, data: Partial<Entities[E]> | Record<string, unknown>, label?: string) => Promise<Entities[E]>
  update: <E extends EntityName>(e: E, id: string, data: Partial<Entities[E]> | Record<string, unknown>, label?: string) => Promise<Entities[E]>
  remove: (e: EntityName, id: string, label?: string) => Promise<true>
  changeStage: (id: string, stage: Stage, extra?: { lostReason?: string | null; lostNote?: string | null }) => Promise<Opportunity>
  sendMessage: (conversationId: string, body: string) => Promise<void>
  saveSettings: (s: Partial<OrgSettings>) => Promise<void>
  logout: () => Promise<void>
  toast: (text: string, tone?: Toast['tone']) => void
  toasts: Toast[]
  /** Run a mutation and toast its error; returns undefined on failure */
  attempt: <T>(fn: () => Promise<T>) => Promise<T | undefined>
}

const Ctx = createContext<StoreApi | null>(null)

type Phase = { kind: 'loading' } | { kind: 'anon' } | { kind: 'error'; message: string } | { kind: 'ready'; db: Bootstrap }

const AuthCtx = createContext<{ phase: Phase; signIn: (email: string, password: string) => Promise<void>; reload: () => void } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [toasts, setToasts] = useState<Toast[]>([])
  const refreshing = useRef<Promise<void> | null>(null)

  const load = useCallback(async () => {
    try {
      const { user } = await get<{ user: User | null }>('/auth/me')
      if (!user) return setPhase({ kind: 'anon' })
      setPhase({ kind: 'ready', db: await get<Bootstrap>('/bootstrap') })
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof ApiError ? e.message : 'Could not load the CRM.' })
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const toast = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = uid('t')
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const refresh = useCallback(async () => {
    // Coalesce concurrent refreshes
    if (refreshing.current) return refreshing.current
    refreshing.current = (async () => {
      try {
        const db = await get<Bootstrap>('/bootstrap')
        setPhase({ kind: 'ready', db })
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setPhase({ kind: 'anon' })
      } finally {
        refreshing.current = null
      }
    })()
    return refreshing.current
  }, [])

  const patchDb = useCallback((fn: (db: Bootstrap) => Bootstrap) => {
    setPhase((p) => (p.kind === 'ready' ? { kind: 'ready', db: fn(p.db) } : p))
  }, [])

  const upsertLocal = useCallback(<E extends EntityName>(e: E, row: Entities[E]) => {
    patchDb((db) => {
      const list = db[e] as unknown as { id: string }[]
      const exists = list.some((x) => x.id === (row as { id: string }).id)
      return { ...db, [e]: exists ? list.map((x) => (x.id === (row as { id: string }).id ? row : x)) : [row, ...list] }
    })
  }, [patchDb])

  const create = useCallback(async <E extends EntityName>(e: E, data: Record<string, unknown>, label?: string) => {
    const row = await post<Entities[E]>(`/${e}`, data)
    upsertLocal(e, row)
    if (label) toast(`${label} added`)
    void refresh()
    return row
  }, [upsertLocal, toast, refresh])

  const update = useCallback(async <E extends EntityName>(e: E, id: string, data: Record<string, unknown>, label?: string) => {
    const row = await patch<Entities[E]>(`/${e}/${id}`, data)
    upsertLocal(e, row)
    if (label) toast(`${label} saved`)
    void refresh()
    return row
  }, [upsertLocal, toast, refresh])

  const remove = useCallback(async (e: EntityName, id: string, label?: string) => {
    await del(`/${e}/${id}`)
    patchDb((db) => ({ ...db, [e]: (db[e] as unknown as { id: string }[]).filter((x) => x.id !== id) }))
    if (label) toast(`${label} deleted`, 'danger')
    void refresh()
    return true as const
  }, [patchDb, toast, refresh])

  const changeStage = useCallback(async (id: string, stage: Stage, extra?: { lostReason?: string | null; lostNote?: string | null }) => {
    // Optimistic move so drag-and-drop feels instant; reconciled by the server response
    let previous: Opportunity | undefined
    patchDb((db) => ({ ...db, opportunities: db.opportunities.map((o) => { if (o.id !== id) return o; previous = o; return { ...o, stage } }) }))
    try {
      const row = await post<Opportunity>(`/opportunities/${id}/stage`, { stage, ...extra })
      upsertLocal('opportunities', row)
      void refresh()
      return row
    } catch (err) {
      if (previous) upsertLocal('opportunities', previous)
      throw err
    }
  }, [patchDb, upsertLocal, refresh])

  const sendMessage = useCallback(async (conversationId: string, body: string) => {
    const m = await post<Message>(`/conversations/${conversationId}/messages`, { body })
    patchDb((db) => ({ ...db, messages: [...db.messages, m] }))
  }, [patchDb])

  const saveSettings = useCallback(async (s: Partial<OrgSettings>) => {
    const settings = await patch<OrgSettings>('/settings', s)
    patchDb((db) => ({ ...db, settings }))
  }, [patchDb])

  const logout = useCallback(async () => {
    try { await post('/auth/logout') } finally { setPhase({ kind: 'anon' }) }
  }, [])

  const attempt = useCallback(async <T,>(fn: () => Promise<T>) => {
    try { return await fn() } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Something went wrong', 'danger')
      return undefined
    }
  }, [toast])

  const signIn = useCallback(async (email: string, password: string) => {
    await post('/auth/login', { email, password })
    await load()
  }, [load])

  const auth = useMemo(() => ({ phase, signIn, reload: () => void load() }), [phase, signIn, load])

  const value = useMemo<StoreApi | null>(() => phase.kind !== 'ready' ? null : ({
    db: phase.db, me: phase.db.me, refresh, create: create as StoreApi['create'], update: update as StoreApi['update'], remove,
    changeStage, sendMessage, saveSettings, logout, toast, toasts, attempt,
  }), [phase, refresh, create, update, remove, changeStage, sendMessage, saveSettings, logout, toast, toasts, attempt])

  return (
    <AuthCtx.Provider value={auth}>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  const v = useContext(AuthCtx)
  if (!v) throw new Error('useAuth must be used inside StoreProvider')
  return v
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used after sign-in')
  return v
}

/** id → record maps for joins in the UI */
export function useLookups() {
  const { db } = useStore()
  return useMemo(() => ({
    leadById: new Map(db.leads.map((x) => [x.id, x])),
    companyById: new Map(db.companies.map((x) => [x.id, x])),
    contactById: new Map(db.contacts.map((x) => [x.id, x])),
    oppById: new Map(db.opportunities.map((x) => [x.id, x])),
    userById: new Map(db.users.map((x) => [x.id, x])),
    proposalById: new Map(db.proposals.map((x) => [x.id, x])),
  }), [db.leads, db.companies, db.contacts, db.opportunities, db.users, db.proposals])
}
