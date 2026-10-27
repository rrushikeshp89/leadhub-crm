/**
 * Production hardening: health probe, security headers, proxy-aware rate limiting,
 * first-run safety and database backups.
 */
import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { createApp, type AppOptions } from '../server/app'
import { backupNow, listBackups } from '../server/backup'

const ADMIN = { email: 'admin@test.local', password: 'test-password-123' }
const servers: Server[] = []
after(() => servers.forEach((s) => s.close()))

async function start(opts: AppOptions = {}) {
  const { app, db } = createApp({ dbFile: ':memory:', admin: ADMIN, demo: false, ...opts })
  const server = app.listen(0)
  servers.push(server)
  await new Promise((r) => server.once('listening', r))
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, db }
}

const login = (base: string, ip: string) => fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  body: JSON.stringify({ email: ADMIN.email, password: 'wrong-password' }),
})

describe('health probe', () => {
  test('answers without sign-in and checks the database', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/api/health`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true })
    assert.equal(res.headers.get('cache-control'), 'no-store')
  })
})

describe('security headers', () => {
  test('sends CSP and anti-framing headers on every response', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/api/health`)
    const csp = res.headers.get('content-security-policy') ?? ''
    assert.match(csp, /default-src 'self'/)
    assert.match(csp, /script-src 'self'(;|$)/, 'no inline or remote scripts')
    assert.match(csp, /frame-ancestors 'none'/)
    assert.equal(res.headers.get('x-frame-options'), 'DENY')
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(res.headers.get('x-powered-by'), null)
  })
  test('adds HSTS only when served over HTTPS', async () => {
    const plain = await start({ secure: false })
    assert.equal((await fetch(`${plain.base}/api/health`)).headers.get('strict-transport-security'), null)
    const https = await start({ secure: true })
    assert.match((await fetch(`${https.base}/api/health`)).headers.get('strict-transport-security') ?? '', /max-age=\d+/)
  })
})

describe('rate limiting behind a proxy', () => {
  test('counts attempts per client address from X-Forwarded-For', async () => {
    const { base } = await start({ trustProxy: 1 })
    for (let i = 0; i < 10; i++) assert.equal((await login(base, '203.0.113.7')).status, 401)
    assert.equal((await login(base, '203.0.113.7')).status, 429, 'the 11th attempt from one client is blocked')
    assert.equal((await login(base, '198.51.100.9')).status, 401, 'other clients are unaffected')
  })
  test('ignores X-Forwarded-For when the proxy is not trusted', async () => {
    const { base } = await start({ trustProxy: false })
    for (let i = 0; i < 10; i++) await login(base, `203.0.113.${i}`)
    assert.equal((await login(base, '198.51.100.9')).status, 429, 'spoofed addresses do not reset the limit')
  })
})

describe('first run', () => {
  test('refuses to start an empty database without an admin account', () => {
    assert.throws(() => createApp({ dbFile: ':memory:' }), /SEED_ADMIN_PASSWORD/)
  })
})

describe('backups', () => {
  test('writes a readable snapshot and keeps only the newest ones', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'leadhub-backup-'))
    try {
      const { db } = createApp({ dbFile: join(dir, 'crm.db'), admin: ADMIN, demo: false })
      const file = backupNow(db, join(dir, 'backups'), 2)
      const copy = new DatabaseSync(file, { readOnly: true })
      assert.equal((copy.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n, 1)
      copy.close()
      for (let i = 0; i < 2; i++) {
        await new Promise((r) => setTimeout(r, 1100)) // snapshot names have one-second resolution
        backupNow(db, join(dir, 'backups'), 2)
      }
      assert.equal(listBackups(join(dir, 'backups')).length, 2)
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
