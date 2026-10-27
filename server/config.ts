/**
 * Runtime settings from the environment, with safe production defaults.
 * Read once at startup, after server/index.ts has loaded .env.
 */
const env = process.env
export const isProd = env.NODE_ENV === 'production'

const bool = (v: string | undefined, fallback: boolean) => (v === undefined || v === '' ? fallback : v === 'true')
const num = (v: string | undefined, fallback: number) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v))

/** Express "trust proxy": a hop count ("1"), "true"/"false", or a list of addresses/subnets */
function trustProxy(v: string | undefined): boolean | number | string {
  if (v === undefined || v === '') return 'loopback'
  if (v === 'true' || v === 'false') return v === 'true'
  return /^\d+$/.test(v) ? Number(v) : v
}


export const config = {
  // API_PORT wins over PORT so a dev tool that sets PORT for the web server does not move the API
  port: num(env.API_PORT || env.PORT, 4000),
  database: {
    /** libsql://… (Turso), file:… or a plain file path; DB_PATH is the older name */
    url: env.DATABASE_URL || env.DB_PATH || 'data/crm.db',
    authToken: env.DATABASE_AUTH_TOKEN || undefined,
  },
  trustProxy: trustProxy(env.TRUST_PROXY),
  /** HTTPS-only cookies and HSTS; on by default in production */
  secure: bool(env.COOKIE_SECURE, isProd),
  logRequests: bool(env.LOG_REQUESTS, isProd),
  seed: {
    adminEmail: env.SEED_ADMIN_EMAIL || 'admin@leadhub.local',
    adminPassword: env.SEED_ADMIN_PASSWORD || '',
    repPassword: env.SEED_REP_PASSWORD || null,
    demo: bool(env.SEED_DEMO, !isProd),
  },
  backup: {
    /** Default: a backups folder next to a local database file (remote databases are backed up by their host) */
    dir: env.BACKUP_DIR || null,
    /** 0 turns scheduled backups off */
    intervalHours: num(env.BACKUP_INTERVAL_HOURS, isProd ? 24 : 0),
    keep: Math.max(1, num(env.BACKUP_KEEP, 7)),
  },
}

export const MIN_ADMIN_PASSWORD = 12
