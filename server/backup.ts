import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { Db } from './db'

const NAME = /^crm-\d{8}-\d{6}\.db$/

/** Consistent snapshot of a local database file (safe while the app is writing) */
export async function backupNow(db: Db, dir: string, keep: number): Promise<string> {
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const file = resolve(dir, `crm-${stamp}.db`)
  await db.script(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  // Keep the newest `keep` snapshots
  for (const f of listBackups(dir).slice(keep)) rmSync(join(dir, f))
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

/**
 * Snapshot every `intervalHours`; runs at startup when the newest snapshot is older than that.
 * Only for local database files: a hosted database (Turso) has its own point-in-time restore.
 */
export function scheduleBackups(db: Db, opts: { dir: string | null; intervalHours: number; keep: number }) {
  if (opts.intervalHours <= 0 || !db.localFile) return () => {}
  const dir = opts.dir ?? join(dirname(resolve(db.localFile)), 'backups')
  const intervalMs = opts.intervalHours * 3600_000
  const run = async () => {
    try {
      console.log(`[backup] wrote ${await backupNow(db, dir, opts.keep)}`)
    } catch (e) {
      console.error('[backup] failed', e)
    }
  }
  const latest = listBackups(dir)[0]
  const age = latest ? Date.now() - statSync(join(dir, latest)).mtimeMs : Infinity
  const first = setTimeout(run, Math.max(0, Math.min(intervalMs - age, intervalMs)))
  const every = setInterval(run, intervalMs)
  first.unref()
  every.unref()
  return () => { clearTimeout(first); clearInterval(every) }
}
