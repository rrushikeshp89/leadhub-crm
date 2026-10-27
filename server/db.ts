import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * SQLite via Node's built-in driver (no native build step).
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

export type DB = DatabaseSync

export function openDb(file = process.env.DB_PATH || 'data/crm.db'): DB {
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  migrate(db)
  return db
}

function migrate(db: DB) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)')
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined
  let version = row?.version ?? 0
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run()
  for (; version < MIGRATIONS.length; version++) {
    tx(db, () => {
      db.exec(MIGRATIONS[version])
      db.prepare('UPDATE schema_version SET version = ?').run(version + 1)
    })
  }
}

const depth = new WeakMap<DB, number>()
/** Re-entrant transaction (nested calls become savepoints) */
export function tx<T>(db: DB, fn: () => T): T {
  const d = depth.get(db) ?? 0
  const sp = `sp${d}`
  db.exec(d === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`)
  depth.set(db, d + 1)
  try {
    const out = fn()
    db.exec(d === 0 ? 'COMMIT' : `RELEASE ${sp}`)
    return out
  } catch (e) {
    db.exec(d === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
    throw e
  } finally {
    depth.set(db, d)
  }
}
