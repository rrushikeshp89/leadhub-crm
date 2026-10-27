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
import { createClient } from '@libsql/client'
import { createApp, type AppOptions } from '../server/app'
import { backupNow, listBackups } from '../server/backup'

const ADMIN = { email: 'admin@test.local', password: 'test-password-123' }
const servers: Server[] = []
const dirs: string[] = []
after(() => {
  servers.forEach((s) => s.close())
  // Windows keeps a closed libSQL file locked until its statements are garbage-collected,
  // so temp folders are removed at the end and a leftover lock is not a test failure
  for (const d of dirs) try { rmSync(d, { recursive: true, force: true }) } catch { /* OS temp cleanup */ }
})
const tempDir = (name: string) => { const d = mkdtempSync(join(tmpdir(), `leadhub-${name}-`)); dirs.push(d); return d }

async function start(opts: AppOptions = {}) {
  const { app, db, svc } = await createApp({ dbUrl: ':memory:', admin: ADMIN, demo: false, ...opts })
  const server = app.listen(0)
  servers.push(server)
  await new Promise((r) => server.once('listening', r))
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, db, svc }
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
  test('refuses to start an empty database without an admin account', async () => {
    await assert.rejects(() => createApp({ dbUrl: ':memory:' }), /SEED_ADMIN_PASSWORD/)
  })
})

describe('data layer', () => {
  test('concurrent writes on a database file all succeed with distinct codes', async () => {
    const { svc, db } = await createApp({ dbUrl: join(tempDir('db'), 'crm.db'), admin: ADMIN, demo: false })
    const me = (await db.get<{ id: string; role: 'admin'; name: string }>('SELECT id, role, name FROM users'))!
    const made = await Promise.all(Array.from({ length: 12 }, (_, i) => svc.create<{ code: string }>('companies', { name: `Parallel ${i}` }, me as never)))
    assert.equal(new Set(made.map((c) => c.code)).size, 12, 'no two records share a code')
    db.close()
  })
  test('a failed nested transaction rolls back only its own changes', async () => {
    const { db } = await start()
    await db.tx(async () => {
      await db.run("INSERT INTO settings (key, value) VALUES ('outer', '1')")
      await assert.rejects(db.tx(async () => {
        await db.run("INSERT INTO settings (key, value) VALUES ('inner', '1')")
        throw new Error('inner failure')
      }))
    })
    const keys = (await db.all<{ key: string }>("SELECT key FROM settings WHERE key IN ('outer', 'inner')")).map((r) => r.key)
    assert.deepEqual(keys, ['outer'])
  })
  test('foreign keys are enforced and reported as a conflict', async () => {
    const { db, svc } = await start()
    const me = (await db.get<{ id: string; role: 'admin'; name: string }>('SELECT id, role, name FROM users'))!
    const co = await svc.create<{ id: string }>('companies', { name: 'Keep Me Ltd' }, me as never)
    const ct = await svc.create<{ id: string }>('contacts', { companyId: co.id, name: 'Asha' }, me as never)
    await svc.create('leads', { companyId: co.id, contactId: ct.id, title: 'Keeps the company' }, me as never)
    await assert.rejects(svc.remove('companies', co.id, me as never), (e: { status?: number }) => e.status === 409)
  })
})

describe('backups', () => {
  test('writes a readable snapshot and keeps only the newest ones', async () => {
    const dir = tempDir('backup')
    const { db } = await createApp({ dbUrl: join(dir, 'crm.db'), admin: ADMIN, demo: false })
    let file = await backupNow(db, join(dir, 'backups'), 2)
    for (let i = 0; i < 2; i++) {
      await new Promise((r) => setTimeout(r, 1100)) // snapshot names have one-second resolution
      file = await backupNow(db, join(dir, 'backups'), 2)
    }
    assert.equal(listBackups(join(dir, 'backups')).length, 2)
    // Opened last: on Windows an opened snapshot stays locked, which would block rotation
    const copy = createClient({ url: `file:${file}` })
    assert.equal((await copy.execute('SELECT COUNT(*) AS n FROM users')).rows[0].n, 1)
    copy.close()
    db.close()
  })
})
