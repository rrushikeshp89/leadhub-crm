import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { DB } from './db'

const NAME = /^crm-\d{8}-\d{6}\.db$/

/** Consistent snapshot of the live database (safe while the app is writing) */
export function backupNow(db: DB, dir: string, keep: number): string {
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const file = resolve(dir, `crm-${stamp}.db`)
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  // Keep the newest `keep` snapshots
  const old = listBackups(dir).slice(keep)
  for (const f of old) rmSync(join(dir, f))
  return file
}

/** Newest first */
export function listBackups(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => NAME.test(f)).sort().reverse()
  } catch {
    return []
  }
}

/** Snapshot every `intervalHours`; runs at startup when the newest snapshot is older than that */
export function scheduleBackups(db: DB, opts: { dir: string; intervalHours: number; keep: number }) {
  if (opts.intervalHours <= 0) return () => {}
  const intervalMs = opts.intervalHours * 3600_000
  const run = () => {
    try {
      const file = backupNow(db, opts.dir, opts.keep)
      console.log(`[backup] wrote ${file}`)
    } catch (e) {
      console.error('[backup] failed', e)
    }
  }
  const latest = listBackups(opts.dir)[0]
  const age = latest ? Date.now() - statSync(join(opts.dir, latest)).mtimeMs : Infinity
  const first = setTimeout(run, Math.max(0, Math.min(intervalMs - age, intervalMs)))
  const every = setInterval(run, intervalMs)
  first.unref()
  every.unref()
  return () => { clearTimeout(first); clearInterval(every) }
}
