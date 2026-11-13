// One Durable Object plays the role of the old single Node process: it owns the SQLite
// database, every live room (in memory) and every player's WebSocket. All requests to
// /api, /ws and /healthz land here (see worker.ts), always on the same instance ("main").
import { DurableObject } from 'cloudflare:workers'
import { bindSqlStorage } from './shims/sqlite'
import type { ShimApp } from './shims/fastify'
import type { ShimServer } from './shims/socket-server'

export interface Env {
  ASSETS: Fetcher
  GAME: DurableObjectNamespace<GameHost>
  IMPORT_TOKEN?: string
  CF_VERSION?: { id: string }
}

export const VERSION_HEADER = 'x-sixtysix-version'

type ServerModule = { app: ShimApp; io: ShimServer }

export class GameHost extends DurableObject<Env> {
  private server!: ServerModule

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    bindSqlStorage(ctx.storage.sql, (fn) => ctx.storage.transactionSync(fn))
    void ctx.blockConcurrencyWhile(async () => {
      this.server = (await import('./server-main')) as ServerModule
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // A running object keeps the code it started with, even after a deploy. The Worker (always the
    // newest version) tells us which version it is; if ours is older and nobody is connected, restart
    // so the next request gets the new code. Live games are never cut off by a deploy this way.
    const wanted = request.headers.get(VERSION_HEADER)
    if (wanted && this.env.CF_VERSION && wanted !== this.env.CF_VERSION.id && this.server.io.count() === 0) {
      this.ctx.abort('new version deployed')
    }

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 })
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)
      // Not the hibernation API on purpose: rooms live in memory, so the object must stay
      // awake while anyone is connected, exactly like the old always-on process.
      server.accept()
      this.server.io.attach(server)
      return new Response(null, { status: 101, webSocket: client })
    }

    if (url.pathname === '/api/admin/import' && request.method === 'POST') return this.importRows(request)

    return this.server.app.handle(request)
  }

  /** Hourly cron: wakes the object so the server's own sweeps (duel expiry, prunes) get to run. */
  async tick(): Promise<{ sockets: number }> {
    return { sockets: this.server.io.count() }
  }

  /**
   * One-time move of the production database: rows exported by cloudflare/export-db.mjs.
   * Guarded by the IMPORT_TOKEN secret; refuses to run when the users table already has data
   * unless ?replace=1 (then the listed tables are emptied first).
   */
  private async importRows(request: Request): Promise<Response> {
    const token = this.env.IMPORT_TOKEN
    if (!token || request.headers.get('Authorization') !== `Bearer ${token}`) return new Response('Forbidden', { status: 403 })
    const replace = new URL(request.url).searchParams.get('replace') === '1'
    const dump = (await request.json()) as { tables: Record<string, Record<string, unknown>[]> }
    const sql = this.ctx.storage.sql
    const existing = sql.exec('SELECT COUNT(*) AS n FROM users').one().n as number
    if (existing > 0 && !replace) return Response.json({ ok: false, error: `users already has ${existing} rows; use ?replace=1` }, { status: 409 })

    // Parents before children, so foreign keys hold while inserting.
    const order = ['users', 'sessions', 'grants', 'plots', 'question_flags', 'exodus_runs', 'hunt_days', 'duels', 'stall']
    const names = [...order.filter((t) => t in dump.tables), ...Object.keys(dump.tables).filter((t) => !order.includes(t))]
    const counts: Record<string, number> = {}
    this.ctx.storage.transactionSync(() => {
      if (replace) for (const t of [...names].reverse()) sql.exec(`DELETE FROM "${t}"`)
      for (const t of names) {
        const cols = new Set(sql.exec(`PRAGMA table_info("${t}")`).toArray().map((c) => String(c.name)))
        let n = 0
        for (const row of dump.tables[t]) {
          const keys = Object.keys(row).filter((k) => cols.has(k))
          if (!keys.length) continue
          sql.exec(
            `INSERT INTO "${t}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
            ...keys.map((k) => row[k] as SqlStorageValue),
          )
          n++
        }
        counts[t] = n
      }
    })
    return Response.json({ ok: true, imported: counts })
  }
}
