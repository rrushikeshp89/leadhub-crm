import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

// Load .env before any module reads process.env (real environment variables win)
if (existsSync('.env')) process.loadEnvFile('.env')
const { config, isProd, MIN_ADMIN_PASSWORD } = await import('./config')
const { createApp } = await import('./app')
const { scheduleBackups } = await import('./backup')

const { adminEmail: email, demo, repPassword } = config.seed
let password = config.seed.adminPassword
if (password && password.length < MIN_ADMIN_PASSWORD) {
  console.error(`[setup] SEED_ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD} characters.`)
  process.exit(1)
}
if (!password && !isProd) {
  // Development convenience only: production must set a password explicitly
  password = randomBytes(9).toString('base64url')
  console.log(`\n[setup] SEED_ADMIN_PASSWORD is not set. If this is the first run, sign in as ${email} with: ${password}\n`)
}
if (isProd && !config.secure) console.warn('[setup] COOKIE_SECURE=false in production: session cookies will be sent over plain HTTP.')

let started
try {
  started = createApp({
    dbFile: config.dbPath,
    admin: password ? { email, password } : undefined,
    demo,
    repPassword,
    serveClient: true,
  })
} catch (e) {
  console.error(`[setup] ${(e as Error).message}`)
  process.exit(1)
}
const { app, db } = started

const stopBackups = scheduleBackups(db, config.backup)
const server = app.listen(config.port, () => console.log(`LeadHub listening on port ${config.port}${isProd ? ' (production)' : ''}`))

// Hosts send SIGTERM before replacing the container: finish open requests, then close the database cleanly
let closing = false
function shutdown(signal: string) {
  if (closing) return
  closing = true
  console.log(`[shutdown] ${signal} received, closing`)
  stopBackups()
  const force = setTimeout(() => process.exit(1), 10_000)
  force.unref()
  server.close(() => {
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      db.close()
    } finally {
      process.exit(0)
    }
  })
  server.closeIdleConnections()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
