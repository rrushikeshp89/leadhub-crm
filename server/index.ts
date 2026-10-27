import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

// Load .env before any module reads process.env
if (existsSync('.env')) process.loadEnvFile('.env')
const { createApp } = await import('./app')

let password = process.env.SEED_ADMIN_PASSWORD
const email = process.env.SEED_ADMIN_EMAIL || 'admin@leadhub.local'
if (!password) {
  password = randomBytes(9).toString('base64url')
  console.log(`\n[setup] SEED_ADMIN_PASSWORD is not set. If this is the first run, sign in as ${email} with: ${password}\n`)
}

const { app } = createApp({
  dbFile: process.env.DB_PATH || 'data/crm.db',
  admin: { email, password },
  demo: process.env.SEED_DEMO !== 'false',
  repPassword: process.env.SEED_REP_PASSWORD || null,
  serveClient: true,
})

const port = Number(process.env.API_PORT || 4000)
app.listen(port, () => console.log(`LeadHub API listening on http://localhost:${port}`))
