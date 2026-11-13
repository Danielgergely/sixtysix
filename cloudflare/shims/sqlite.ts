// Stand-in for `node:sqlite` (aliased in wrangler.jsonc): the server's synchronous
// DatabaseSync calls run against the Durable Object's built-in SQLite storage.
// The Durable Object binds the storage before the server modules are imported.

type Cursor = { toArray(): Record<string, unknown>[]; rowsWritten: number }
type SqlStorage = { exec(query: string, ...bindings: unknown[]): Cursor }

let sql: SqlStorage | null = null
let transaction: (<T>(fn: () => T) => T) | null = null

export function bindSqlStorage(storage: SqlStorage, transactionSync: <T>(fn: () => T) => T): void {
  sql = storage
  transaction = transactionSync
}

const storage = (): SqlStorage => {
  if (!sql) throw new Error('[sqlite shim] storage not bound yet')
  return sql
}

// node:sqlite accepts booleans/undefined loosely in practice; the DO API wants SQL values.
const bind = (v: unknown) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)

export class DatabaseSync {
  constructor(_path?: string) {
    storage()
  }

  exec(source: string): void {
    // WAL is the Durable Object's business, and BEGIN/COMMIT must go through transactionSync (see tx.ts).
    const cleaned = source.replace(/PRAGMA\s+journal_mode\s*=\s*\w+\s*;?/gi, '').trim()
    if (/^(BEGIN|COMMIT|ROLLBACK)\b/i.test(cleaned)) {
      throw new Error(`[sqlite shim] raw "${cleaned}" is not allowed in a Durable Object; use atomic()`)
    }
    if (cleaned) storage().exec(cleaned).toArray()
  }

  prepare(query: string) {
    return {
      get: (...params: unknown[]) => storage().exec(query, ...params.map(bind)).toArray()[0],
      all: (...params: unknown[]) => storage().exec(query, ...params.map(bind)).toArray(),
      run: (...params: unknown[]) => {
        const cursor = storage().exec(query, ...params.map(bind))
        cursor.toArray()
        const last = storage().exec('SELECT last_insert_rowid() AS id').toArray()[0]
        return { changes: cursor.rowsWritten, lastInsertRowid: Number(last?.id ?? 0) }
      },
    }
  }

  /** All-or-nothing block; tx.ts prefers this over BEGIN/COMMIT when present. */
  transactionSync<T>(fn: () => T): T {
    if (!transaction) throw new Error('[sqlite shim] storage not bound yet')
    return transaction(fn)
  }
}
