import { randomUUID } from 'node:crypto'
import type { DB } from './db'

/** Per-table column handling. Everything not listed is stored as-is. */
export interface TableDef {
  table: string
  json?: string[]
  bool?: string[]
  /** human-readable sequential code, e.g. LD-0007 */
  code?: { prefix: string; pad: number }
  idPrefix: string
  timestamps?: 'both' | 'created' | 'none'
  orderBy?: string
}

export const TABLES = {
  users: { table: 'users', idPrefix: 'us', timestamps: 'created', orderBy: 'name' },
  companies: { table: 'companies', idPrefix: 'co', code: { prefix: 'CO-', pad: 4 }, timestamps: 'both', orderBy: 'name' },
  contacts: { table: 'contacts', idPrefix: 'ct', bool: ['isDecisionMaker'], timestamps: 'both', orderBy: 'name' },
  leads: { table: 'leads', idPrefix: 'ld', json: ['qualification', 'services'], code: { prefix: 'LD-', pad: 4 }, timestamps: 'both', orderBy: 'createdAt DESC' },
  opportunities: { table: 'opportunities', idPrefix: 'op', json: ['services'], code: { prefix: 'OP-', pad: 4 }, timestamps: 'both', orderBy: 'createdAt DESC' },
  stageHistory: { table: 'stage_history', idPrefix: 'sh', timestamps: 'none', orderBy: 'changedAt' },
  tasks: { table: 'tasks', idPrefix: 'tk', timestamps: 'created', orderBy: 'dueDate, dueTime' },
  activities: { table: 'activities', idPrefix: 'ac', timestamps: 'none', orderBy: 'occurredAt DESC' },
  proposals: { table: 'proposals', idPrefix: 'pr', json: ['services'], code: { prefix: 'PR-', pad: 4 }, timestamps: 'both', orderBy: 'updatedAt DESC' },
  events: { table: 'events', idPrefix: 'ev', timestamps: 'created', orderBy: 'date, start' },
  campaigns: { table: 'campaigns', idPrefix: 'cp', json: ['tags'], timestamps: 'created', orderBy: 'date DESC' },
  services: { table: 'services', idPrefix: 'sv', bool: ['active'], code: { prefix: 'SV-', pad: 3 }, timestamps: 'none', orderBy: 'code' },
  invoices: { table: 'invoices', idPrefix: 'in', code: { prefix: 'INV-', pad: 4 }, timestamps: 'created', orderBy: 'dueDate DESC' },
  conversations: { table: 'conversations', idPrefix: 'cv', bool: ['isGroup'], json: ['memberIds'], timestamps: 'created', orderBy: 'createdAt' },
  messages: { table: 'messages', idPrefix: 'ms', timestamps: 'created', orderBy: 'createdAt' },
} satisfies Record<string, TableDef>

export type TableKey = keyof typeof TABLES

const q = (s: string) => `"${s}"`
export const now = () => new Date().toISOString()
export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 14)}`

type Row = Record<string, unknown>

export function decode<T = Row>(def: TableDef, row: Row | undefined): T | undefined {
  if (!row) return undefined
  const out: Row = { ...row }
  for (const k of def.json ?? []) out[k] = typeof out[k] === 'string' ? JSON.parse(out[k] as string) : out[k] ?? null
  for (const k of def.bool ?? []) out[k] = !!out[k]
  return out as T
}

function encode(def: TableDef, data: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    if (def.json?.includes(k)) out[k] = JSON.stringify(v ?? (k === 'qualification' ? {} : []))
    else if (def.bool?.includes(k)) out[k] = v ? 1 : 0
    else out[k] = v as unknown
  }
  return out
}

export class Repo {
  constructor(readonly db: DB) {}

  all<T = Row>(key: TableKey, where = '', params: unknown[] = []): T[] {
    const def: TableDef = TABLES[key]
    const rows = this.db.prepare(`SELECT * FROM ${q(def.table)} ${where ? `WHERE ${where}` : ''} ORDER BY ${def.orderBy ?? 'rowid'}`).all(...(params as never[])) as Row[]
    return rows.map((r) => decode<T>(def, r)!)
  }

  get<T = Row>(key: TableKey, id: string): T | undefined {
    const def: TableDef = TABLES[key]
    return decode<T>(def, this.db.prepare(`SELECT * FROM ${q(def.table)} WHERE id = ?`).get(id) as Row | undefined)
  }

  nextCode(def: TableDef): string {
    const { prefix, pad } = def.code!
    const r = this.db.prepare(`SELECT MAX(CAST(SUBSTR(code, ${prefix.length + 1}) AS INTEGER)) AS n FROM ${q(def.table)}`).get() as { n: number | null }
    return prefix + String((r.n ?? 0) + 1).padStart(pad, '0')
  }

  insert<T = Row>(key: TableKey, data: Row): T {
    const def: TableDef = TABLES[key]
    const row: Row = { id: data.id ?? newId(def.idPrefix), ...data }
    if (def.code && !row.code) row.code = this.nextCode(def)
    const ts = now()
    if (def.timestamps === 'both') { row.createdAt ??= ts; row.updatedAt = row.updatedAt ?? ts }
    if (def.timestamps === 'created') row.createdAt ??= ts
    const enc = encode(def, row)
    const cols = Object.keys(enc)
    this.db.prepare(`INSERT INTO ${q(def.table)} (${cols.map(q).join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...(Object.values(enc) as never[]))
    return this.get<T>(key, row.id as string)!
  }

  update<T = Row>(key: TableKey, id: string, data: Row): T {
    const def: TableDef = TABLES[key]
    const patch = { ...data }
    delete patch.id
    delete patch.code
    delete patch.createdAt
    if (def.timestamps === 'both') patch.updatedAt = now()
    const enc = encode(def, patch)
    const cols = Object.keys(enc)
    if (cols.length) {
      this.db.prepare(`UPDATE ${q(def.table)} SET ${cols.map((c) => `${q(c)} = ?`).join(', ')} WHERE id = ?`).run(...(Object.values(enc) as never[]), id)
    }
    return this.get<T>(key, id)!
  }

  remove(key: TableKey, id: string) {
    const def: TableDef = TABLES[key]
    return this.db.prepare(`DELETE FROM ${q(def.table)} WHERE id = ?`).run(id).changes
  }
}
