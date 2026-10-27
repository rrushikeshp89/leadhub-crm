import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import express from 'express'
import { config } from './config'
import { openDb } from './db'
import { Repo } from './repo'
import { CrmService } from './service'
import { buildRouter, errorHandler } from './routes'
import { sessionMiddleware } from './auth'
import { requestLog, securityHeaders } from './security'
import { seedAdmin, seedDemo, seedServices } from './seed'

export interface AppOptions {
  /** libSQL URL or file path; `:memory:` for tests */
  dbUrl?: string
  dbAuthToken?: string
  /** First-run seeding when the database has no users */
  admin?: { email: string; password: string }
  demo?: boolean
  repPassword?: string | null
  serveClient?: boolean
  /** Defaults come from server/config.ts */
  trustProxy?: boolean | number | string
  secure?: boolean
  logRequests?: boolean
}

export async function createApp(opts: AppOptions = {}) {
  const db = await openDb(opts.dbUrl ?? config.database.url, opts.dbAuthToken ?? config.database.authToken)
  const repo = new Repo(db)
  const svc = new CrmService(repo)

  const userCount = (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users'))!.n
  if (!userCount) {
    // Without a first admin nobody could ever sign in
    if (!opts.admin) {
      db.close()
      throw new Error('The database has no users: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD for the first run.')
    }
    await seedAdmin(repo, opts.admin.email, opts.admin.password)
    await seedServices(repo)
    if (opts.demo) await seedDemo(svc, opts.repPassword ?? null)
  }

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', opts.trustProxy ?? config.trustProxy)
  if (opts.logRequests ?? config.logRequests) app.use(requestLog())
  app.use(securityHeaders({ hsts: opts.secure ?? config.secure }))
  app.use(express.json({ limit: '1mb' }))
  app.use((req, res, next) => {
    // Cookie-authenticated writes must be JSON (blocks cross-site form posts)
    const hasBody = Number(req.headers['content-length'] || 0) > 0 || !!req.headers['transfer-encoding']
    if (hasBody && req.path.startsWith('/api/') && !req.is('application/json')) {
      return res.status(415).json({ error: 'Send JSON' })
    }
    next()
  })
  app.use('/api', sessionMiddleware(repo), buildRouter(svc))
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

  const dist = resolve('dist')
  if (opts.serveClient && existsSync(dist)) {
    app.use(express.static(dist, {
      index: false,
      setHeaders(res, file) {
        // Vite fingerprints everything under /assets, so it can be cached for good
        res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    }))
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(resolve(dist, 'index.html'))
    })
  }
  app.use(errorHandler)
  return { app, svc, db }
}
