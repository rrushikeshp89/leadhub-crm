import { Router, type NextFunction, type Request, type Response } from 'express'
import type { Activity, Company, Contact, Lead, Opportunity, Proposal, Task, User } from '../shared/model'
import { loginSchema, profileSchema } from '../shared/schemas'
import { createSession, destroySession, hashPassword, publicUser, requireAdmin, requireAuth, verifyPassword } from './auth'
import { AI_KINDS, AiError, runAi, type AiKind } from './ai'
import { CrmService, ENTITY_NAMES, HttpError, validate } from './service'
import { seedDemo } from './seed'

type Handler = (req: Request, res: Response) => unknown
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = fn(req, res)
    if (out instanceof Promise) out.then((v) => { if (!res.headersSent) res.json(v) }).catch(next)
    else if (!res.headersSent) res.json(out)
  } catch (e) { next(e) }
}

/** Tiny in-memory limiter (per IP + bucket). Fine for a single-process deployment. */
function rateLimit(bucket: string, max: number, windowMs: number) {
  const hits = new Map<string, number[]>()
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${bucket}:${req.ip}`
    const nowMs = Date.now()
    const recent = (hits.get(key) ?? []).filter((t) => nowMs - t < windowMs)
    if (recent.length >= max) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' })
    recent.push(nowMs)
    hits.set(key, recent)
    next()
  }
}

export function buildRouter(svc: CrmService) {
  const r = Router()
  const user = (req: Request) => req.user as User

  r.get('/health', h(() => ({ ok: true })))

  /* ---------- auth ---------- */
  r.post('/auth/login', rateLimit('login', 10, 10 * 60_000), h((req, res) => {
    const { email, password } = validate(loginSchema, req.body)
    const row = svc.db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email) as (User & { passwordHash: string | null }) | undefined
    if (!row || !verifyPassword(password, row.passwordHash)) throw new HttpError(401, 'Email or password is incorrect')
    createSession(svc.repo, res, row.id)
    return { user: publicUser(row) }
  }))
  r.post('/auth/logout', h((req, res) => { destroySession(svc.repo, req, res); return { ok: true } }))
  r.get('/auth/me', h((req) => ({ user: req.user ?? null })))

  /* ---------- public lead capture ---------- */
  r.post('/public/inquiries', rateLimit('inquiry', 5, 10 * 60_000), h((req) => svc.inquiry(req.body)))
  r.get('/public/options', h(() => ({ companyName: svc.settings().companyName })))

  r.use(requireAuth)

  r.get('/bootstrap', h((req) => svc.bootstrap(user(req))))

  /* ---------- profile & settings ---------- */
  r.patch('/me', h((req) => {
    const me = user(req)
    const body = validate(profileSchema, { ...me, ...req.body })
    const row = svc.db.prepare('SELECT passwordHash FROM users WHERE id = ?').get(me.id) as { passwordHash: string | null }
    let passwordHash = row.passwordHash
    if (body.newPassword) {
      if (row.passwordHash && !verifyPassword(body.currentPassword ?? '', row.passwordHash)) throw new HttpError(400, 'Current password is incorrect', { currentPassword: 'Incorrect password' })
      passwordHash = hashPassword(body.newPassword)
    }
    const dupe = svc.db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id != ?').get(body.email, me.id)
    if (dupe) throw new HttpError(409, 'That email is already used by another user', { email: 'Already in use' })
    const updated = svc.repo.update('users', me.id, { name: body.name, email: body.email, title: body.title ?? null, phone: body.phone ?? null, territory: body.territory ?? null, avatar: body.avatar ?? null, passwordHash })
    return publicUser(updated as never)
  }))
  r.patch('/settings', requireAdmin, h((req) => svc.updateSettings(req.body)))
  r.post('/admin/demo', requireAdmin, h((req) => {
    const action = req.body?.action
    if (action === 'clear') { svc.clearBusinessData(); return { ok: true } }
    if (action === 'load') {
      const count = (svc.db.prepare('SELECT COUNT(*) AS n FROM companies').get() as { n: number }).n
      if (count) throw new HttpError(409, 'Clear the current data before loading demo data')
      seedDemo(svc, process.env.SEED_REP_PASSWORD || null)
      return { ok: true }
    }
    throw new HttpError(400, 'Unknown action')
  }))

  /* ---------- specialised writes ---------- */
  r.post('/intake', h((req) => svc.intake(req.body, user(req))))
  r.post('/duplicates', h((req) => svc.findDuplicates({ companyName: req.body?.companyName, website: req.body?.website, email: req.body?.email })))
  r.post('/opportunities/:id/stage', h((req) => svc.changeStage(String(req.params.id), req.body, user(req))))
  r.post('/conversations/:id/messages', h((req) => svc.postMessage(String(req.params.id), req.body?.body, user(req))))

  /* ---------- AI (suggestions only; never writes CRM data) ---------- */
  r.post('/ai/:kind', rateLimit('ai', 30, 60_000), h(async (req) => {
    const kind = String(req.params.kind) as AiKind
    if (!AI_KINDS.includes(kind)) throw new HttpError(404, 'Unknown AI action')
    const { leadId, opportunityId, purpose } = req.body ?? {}
    const opportunity = opportunityId ? svc.repo.get<Opportunity>('opportunities', opportunityId) : undefined
    const lead = leadId ? svc.repo.get<Lead>('leads', leadId) : opportunity?.leadId ? svc.repo.get<Lead>('leads', opportunity.leadId) : undefined
    if (!lead && !opportunity) throw new HttpError(400, 'Pick a lead or an opportunity')
    const companyId = (opportunity ?? lead)!.companyId
    const contactId = opportunity?.contactId ?? lead?.contactId
    const scope = lead ? 'leadId = ? OR companyId = ?' : 'opportunityId = ? OR companyId = ?'
    const scopeArgs = [lead?.id ?? opportunity!.id, companyId]
    try {
      return await runAi(kind, {
        settings: svc.settings(), lead, opportunity,
        company: svc.repo.get<Company>('companies', companyId),
        contact: contactId ? svc.repo.get<Contact>('contacts', contactId) : undefined,
        owner: (opportunity?.ownerId ?? lead?.ownerId) ? svc.repo.get<User>('users', (opportunity?.ownerId ?? lead?.ownerId)!) : undefined,
        opportunities: opportunity ? [opportunity] : svc.repo.all<Opportunity>('opportunities', 'leadId = ?', [lead!.id]),
        tasks: svc.repo.all<Task>('tasks', scope, scopeArgs),
        activities: svc.repo.all<Activity>('activities', scope, scopeArgs),
        proposals: svc.repo.all<Proposal>('proposals', opportunity ? 'opportunityId = ?' : 'companyId = ?', [opportunity?.id ?? companyId]),
        emailPurpose: typeof purpose === 'string' ? purpose.slice(0, 500) : undefined,
      })
    } catch (e) {
      if (e instanceof AiError) throw new HttpError(e.status, e.message, { code: e.code })
      throw e
    }
  }))

  /* ---------- generic CRUD ---------- */
  r.post('/:entity', h((req) => {
    const entity = String(req.params.entity)
    if (!ENTITY_NAMES.includes(entity)) throw new HttpError(404, 'Unknown resource')
    return svc.create(entity, req.body, user(req))
  }))
  r.patch('/:entity/:id', h((req) => {
    const entity = String(req.params.entity)
    if (!ENTITY_NAMES.includes(entity)) throw new HttpError(404, 'Unknown resource')
    return svc.update(entity, String(req.params.id), req.body, user(req))
  }))
  r.delete('/:entity/:id', h((req) => {
    const entity = String(req.params.entity)
    if (!ENTITY_NAMES.includes(entity)) throw new HttpError(404, 'Unknown resource')
    return svc.remove(entity, String(req.params.id), user(req))
  }))

  return r
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details })
  if ((err as { type?: string })?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' })
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' })
}
