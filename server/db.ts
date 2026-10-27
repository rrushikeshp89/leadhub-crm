import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createClient, type Client, type InValue, type Transaction } from '@libsql/client'

/**
 * libSQL (SQLite-compatible) everywhere: `:memory:` in tests, a local file in development,
 * a hosted Turso database in production. Same SQL, same schema.
 * Schema changes are versioned migrations; each runs once, in order, inside a transaction.
 * Column names are camelCase so rows map 1:1 to the shared TypeScript model.
 */

const MIGRATIONS: string[] = [
  /* v1 — initial schema */ `
  CREATE TABLE users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL DEFAULT 'sales_rep', title TEXT, phone TEXT, territory TEXT, avatar TEXT,
    passwordHash TEXT, createdAt TEXT NOT NULL
  );
  CREATE TABLE sessions (
    tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expiresAt TEXT NOT NULL, createdAt TEXT NOT NULL
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE companies (
    id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, website TEXT, industry TEXT, size TEXT,
    location TEXT, description TEXT, notes TEXT, ownerId TEXT REFERENCES users(id) ON DELETE SET NULL,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );
  CREATE TABLE contacts (
    id TEXT PRIMARY KEY, companyId TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL, email TEXT, phone TEXT, title TEXT, linkedin TEXT, avatar TEXT, preferredContact TEXT,
    isDecisionMaker INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );
  CREATE INDEX contacts_company ON contacts(companyId);
  CREATE INDEX contacts_email ON contacts(email COLLATE NOCASE);

  CREATE TABLE leads (
    id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE,
    companyId TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    contactId TEXT NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
    ownerId TEXT REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL, source TEXT, status TEXT NOT NULL, temperature TEXT, qualification TEXT NOT NULL DEFAULT '{}',
    estimatedBudget REAL, estimatedValue REAL, probability REAL, expectedDecisionDate TEXT, nextFollowUp TEXT,
    businessProblem TEXT, techStack TEXT, existingSystems TEXT, desiredSolution TEXT, projectType TEXT,
    engagementModel TEXT, timeline TEXT, decisionMakers TEXT, budgetReadiness TEXT, technicalComplexity TEXT,
    additionalRequirements TEXT, preferredContact TEXT, services TEXT NOT NULL DEFAULT '[]', disqualifyReason TEXT,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );
  CREATE INDEX leads_company ON leads(companyId);
  CREATE INDEX leads_owner ON leads(ownerId);

  CREATE TABLE opportunities (
    id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    companyId TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    contactId TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    leadId TEXT REFERENCES leads(id) ON DELETE SET NULL,
    ownerId TEXT REFERENCES users(id) ON DELETE SET NULL,
    services TEXT NOT NULL DEFAULT '[]', problemStatement TEXT, proposedSolution TEXT,
    value REAL NOT NULL DEFAULT 0, probability REAL NOT NULL DEFAULT 0, deliveryTimeline TEXT, expectedCloseDate TEXT,
    stage TEXT NOT NULL, competitors TEXT, nextAction TEXT, nextActionDate TEXT, lostReason TEXT, lostNote TEXT,
    closedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );
  CREATE INDEX opps_company ON opportunities(companyId);
  CREATE INDEX opps_lead ON opportunities(leadId);

  CREATE TABLE stage_history (
    id TEXT PRIMARY KEY, opportunityId TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    fromStage TEXT, toStage TEXT NOT NULL, userId TEXT REFERENCES users(id) ON DELETE SET NULL, changedAt TEXT NOT NULL
  );
  CREATE INDEX stage_history_opp ON stage_history(opportunityId);

  CREATE TABLE tasks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL, priority TEXT NOT NULL, dueDate TEXT NOT NULL,
    dueTime TEXT, status TEXT NOT NULL DEFAULT 'Open', ownerId TEXT REFERENCES users(id) ON DELETE SET NULL,
    leadId TEXT REFERENCES leads(id) ON DELETE CASCADE,
    opportunityId TEXT REFERENCES opportunities(id) ON DELETE CASCADE,
    companyId TEXT REFERENCES companies(id) ON DELETE CASCADE,
    notes TEXT, completedAt TEXT, createdAt TEXT NOT NULL
  );
  CREATE INDEX tasks_due ON tasks(status, dueDate);

  CREATE TABLE activities (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT,
    leadId TEXT REFERENCES leads(id) ON DELETE CASCADE,
    opportunityId TEXT REFERENCES opportunities(id) ON DELETE CASCADE,
    companyId TEXT REFERENCES companies(id) ON DELETE CASCADE,
    contactId TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    userId TEXT REFERENCES users(id) ON DELETE SET NULL, occurredAt TEXT NOT NULL
  );
  CREATE INDEX activities_time ON activities(occurredAt);

  CREATE TABLE proposals (
    id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
    opportunityId TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    companyId TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    services TEXT NOT NULL DEFAULT '[]', problemStatement TEXT, solutionSummary TEXT, price REAL NOT NULL DEFAULT 0,
    deliveryTimeline TEXT, status TEXT NOT NULL, sentAt TEXT, validUntil TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );

  CREATE TABLE events (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL, start TEXT NOT NULL, "end" TEXT NOT NULL,
    kind TEXT NOT NULL, location TEXT, ownerId TEXT REFERENCES users(id) ON DELETE SET NULL,
    leadId TEXT REFERENCES leads(id) ON DELETE SET NULL,
    opportunityId TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
    companyId TEXT REFERENCES companies(id) ON DELETE SET NULL, createdAt TEXT NOT NULL
  );

  CREATE TABLE campaigns (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, date TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0,
    body TEXT NOT NULL DEFAULT '', image TEXT, tags TEXT NOT NULL DEFAULT '[]', createdAt TEXT NOT NULL
  );

  CREATE TABLE services (
    id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, "group" TEXT NOT NULL, category TEXT NOT NULL,
    description TEXT, startingPrice REAL, typicalDuration TEXT, active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE invoices (
    id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE,
    companyId TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    opportunityId TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
    item TEXT NOT NULL, subtotal REAL NOT NULL, tax REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL, dueDate TEXT NOT NULL, createdAt TEXT NOT NULL
  );

  CREATE TABLE conversations (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, isGroup INTEGER NOT NULL DEFAULT 0, memberIds TEXT NOT NULL DEFAULT '[]',
    contactId TEXT REFERENCES contacts(id) ON DELETE SET NULL, description TEXT, createdAt TEXT NOT NULL
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    userId TEXT REFERENCES users(id) ON DELETE SET NULL, author TEXT NOT NULL, body TEXT NOT NULL, createdAt TEXT NOT NULL
  );
  `,
]

export type Args = InValue[]
type Row = Record<string, unknown>

/** Accept a libSQL URL (`libsql://…`, `file:…`, `:memory:`) or a plain file path */
export function toDbUrl(input: string) {
  return input === ':memory:' || /^(libsql|https?|wss?|file):/i.test(input) ? input : `file:${input}`
}

export class Db {
  /** The transaction the current async call chain is running in, if any */
  private readonly scope = new AsyncLocalStorage<{ t: Transaction; depth: number }>()
  /** Top-level write transactions run one at a time, so concurrent requests queue instead of hitting SQLITE_BUSY */
  private writeQueue: Promise<unknown> = Promise.resolve()

  /** `localFile` is the database path for file databases, null for `:memory:` and remote ones */
  constructor(readonly client: Client, readonly localFile: string | null) {}

  /** Inside tx() every query goes through the open transaction, so callers never pass it around */
  private get conn(): Client | Transaction {
    return this.scope.getStore()?.t ?? this.client
  }

  async all<T = Row>(sql: string, args: Args = []): Promise<T[]> {
    const rs = await this.conn.execute({ sql, args })
    // libSQL rows are array-like objects; spreading keeps just the named columns
    return rs.rows.map((r) => ({ ...r }) as T)
  }

  async get<T = Row>(sql: string, args: Args = []): Promise<T | undefined> {
    return (await this.all<T>(sql, args))[0]
  }

  /** Returns the number of rows changed */
  async run(sql: string, args: Args = []): Promise<number> {
    return (await this.conn.execute({ sql, args })).rowsAffected
  }

  /** Several statements separated by semicolons, without arguments */
  async script(sql: string): Promise<void> {
    await this.conn.executeMultiple(sql)
  }

  /** Re-entrant write transaction (nested calls become savepoints) */
  async tx<T>(fn: () => Promise<T>): Promise<T> {
    const cur = this.scope.getStore()
    if (cur) {
      const sp = `sp${cur.depth}`
      await cur.t.execute(`SAVEPOINT ${sp}`)
      try {
        const out = await this.scope.run({ t: cur.t, depth: cur.depth + 1 }, fn)
        await cur.t.execute(`RELEASE ${sp}`)
        return out
      } catch (e) {
        await cur.t.executeMultiple(`ROLLBACK TO ${sp}; RELEASE ${sp}`)
        throw e
      }
    }
    const turn = this.writeQueue.then(() => this.transaction(fn))
    this.writeQueue = turn.catch(() => {})
    return turn
  }

  private async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const t = await this.client.transaction('write')
    try {
      const out = await this.scope.run({ t, depth: 1 }, fn)
      await t.commit()
      return out
    } catch (e) {
      if (!t.closed) await t.rollback()
      throw e
    } finally {
      t.close()
    }
  }

  close() {
    this.client.close()
  }
}

export async function openDb(url: string, authToken?: string): Promise<Db> {
  const full = toDbUrl(url)
  const file = full.startsWith('file:') ? full.slice('file:'.length) : null
  if (file) mkdirSync(dirname(resolve(file)), { recursive: true })
  // timeout: a single write outside a transaction waits up to 5 s for the file lock instead of failing
  const db = new Db(createClient({ url: full, authToken: authToken || undefined, timeout: 5000 }), file)
  if (file) await db.script('PRAGMA journal_mode = WAL;')
  // Deletes rely on foreign keys (RESTRICT / CASCADE); refuse to run without them
  const fk = await db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')
  if (!fk?.foreign_keys) throw new Error('Foreign key enforcement is off for this database; LeadHub needs it for data integrity.')
  await migrate(db)
  return db
}

async function migrate(db: Db) {
  await db.script('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)')
  const row = await db.get<{ version: number }>('SELECT version FROM schema_version')
  if (!row) await db.run('INSERT INTO schema_version (version) VALUES (0)')
  for (let version = row?.version ?? 0; version < MIGRATIONS.length; version++) {
    const v = version
    await db.tx(async () => {
      await db.script(MIGRATIONS[v])
      await db.run('UPDATE schema_version SET version = ?', [v + 1])
    })
  }
}
