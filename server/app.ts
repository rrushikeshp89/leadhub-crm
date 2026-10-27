import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import express from 'express'
import { openDb } from './db'
import { Repo } from './repo'
import { CrmService } from './service'
import { buildRouter, errorHandler } from './routes'
import { sessionMiddleware } from './auth'
import { seedAdmin, seedDemo, seedServices } from './seed'

export interface AppOptions {
  dbFile?: string
  /** First-run seeding when the database has no users */
  admin?: { email: string; password: string }
  demo?: boolean
  repPassword?: string | null
  serveClient?: boolean
}

export function createApp(opts: AppOptions = {}) {
  const db = openDb(opts.dbFile)
  const repo = new Repo(db)
  const svc = new CrmService(repo)

  const userCount = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n
  if (!userCount && opts.admin) {
    seedAdmin(repo, opts.admin.email, opts.admin.password)
    seedServices(repo)
    if (opts.demo) seedDemo(svc, opts.repPassword ?? null)
  }

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback')
  app.use(express.json({ limit: '1mb' }))
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'same-origin')
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
    app.use(express.static(dist))
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')))
  }
  app.use(errorHandler)
  return { app, svc, db }
}
