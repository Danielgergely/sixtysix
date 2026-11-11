import { atomic } from './tx.js'
import type { FastifyInstance } from 'fastify'
import {
  DAY_MS,
  EXODUS_MAX_DISTANCE,
  EXODUS_MAX_SECONDS,
  exodusPlausible,
  utcDay,
  type ExodusBoard,
  type ExodusBoardResponse,
  type ExodusBoardRow,
  type ExodusRunResponse,
} from '@sixtysix/shared'
import { bodyOf, db, markActive, publicPlayer, userFromRequest, weekStart, type PublicRow } from './accounts.js'

/**
 * Exodus best runs (shared/src/exodus.ts). Not one row per run: one row per
 * user and period, holding the best distance in it. `period` is 'all',
 * 'w:YYYY-MM-DD' (that week's Monday, UTC) or 'd:YYYY-MM-DD' (a Daily Run's
 * day). Week and day rows older than PRUNE_DAYS are dropped now and then.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS exodus_runs (
    user_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    distance INTEGER NOT NULL,
    seconds INTEGER NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (user_id, period)
  );
  CREATE INDEX IF NOT EXISTS exodus_runs_board ON exodus_runs(period, distance DESC, at);
`)

const PRUNE_DAYS = 60
const TOP = 20

function prune(): void {
  const { changes } = db.prepare("DELETE FROM exodus_runs WHERE period != 'all' AND at < ?").run(Date.now() - PRUNE_DAYS * DAY_MS)
  if (changes) console.log(`[exodus] pruned ${changes} old week/day best${changes === 1 ? '' : 's'}`)
}
prune()
setInterval(prune, DAY_MS).unref()

const weekKey = (now = Date.now()) => `w:${utcDay(weekStart(new Date(now)))}`
const dayKey = (day: string) => `d:${day}`

/** At most RUNS_PER_HOUR submissions per user (in memory; a restart forgets, which is fine). */
const RUNS_PER_HOUR = 60
const HOUR_MS = 3_600_000
const runTimes = new Map<number, number[]>()
function tooManyRuns(userId: number, now: number): boolean {
  const recent = (runTimes.get(userId) ?? []).filter((t) => now - t < HOUR_MS)
  if (recent.length >= RUNS_PER_HOUR) {
    runTimes.set(userId, recent)
    return true
  }
  recent.push(now)
  runTimes.set(userId, recent)
  return false
}
setInterval(() => {
  const now = Date.now()
  for (const [id, times] of runTimes) if (times.every((t) => now - t >= HOUR_MS)) runTimes.delete(id)
}, HOUR_MS).unref()

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

/** Keeps the higher of the stored and the new distance; returns the best now stored. */
const upsert = db.prepare(`
  INSERT INTO exodus_runs (user_id, period, distance, seconds, at) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (user_id, period) DO UPDATE SET distance = excluded.distance, seconds = excluded.seconds, at = excluded.at
  WHERE excluded.distance > exodus_runs.distance
`)
const bestOf = db.prepare('SELECT distance FROM exodus_runs WHERE user_id = ? AND period = ?')

function record(userId: number, period: string, distance: number, seconds: number, now: number): number {
  upsert.run(userId, period, distance, seconds, now)
  return (bestOf.get(userId, period) as { distance: number }).distance
}

type BoardRow = PublicRow & { user_id: number; distance: number; at: number }

function toRow(r: BoardRow, rank: number): ExodusBoardRow {
  const p = publicPlayer(r)
  return { rank, username: p.username, name: p.name, avatar: p.avatar, distance: r.distance }
}

export function registerExodusRoutes(app: FastifyInstance): void {
  /** { distance, seconds, daily }: a finished run. Stores only new bests. */
  app.post('/api/exodus/run', (req, reply) => {
    try {
      const me = userFromRequest(req)
      if (!me) return reply.code(401).send({ ok: false, error: 'Signed out' })
      const body = bodyOf(req)
      const { distance, seconds, daily } = body
      if (!isInt(distance, 0, EXODUS_MAX_DISTANCE) || !isInt(seconds, 1, EXODUS_MAX_SECONDS) || (daily !== null && daily !== undefined && typeof daily !== 'string')) {
        return reply.code(400).send({ ok: false, error: 'Bad request' })
      }
      if (!exodusPlausible(distance, seconds)) return reply.code(400).send({ ok: false, error: 'Bad request' })
      const now = Date.now()
      if (tooManyRuns(me.id, now)) return reply.code(429).send({ ok: false, error: 'Too many runs — wait a while.' })
      // A Daily Run counts on its own day, or the next one (a run that started before midnight).
      const dailyOk = typeof daily === 'string' && (daily === utcDay(now) || daily === utcDay(now - DAY_MS))
      const res: ExodusRunResponse = atomic(() => ({
        ok: true,
        best: record(me.id, 'all', distance, seconds, now),
        weekBest: record(me.id, weekKey(now), distance, seconds, now),
        dailyBest: dailyOk ? record(me.id, dayKey(daily), distance, seconds, now) : null,
      }))
      markActive(me.id)
      return res
    } catch (err) {
      console.error('[exodus] /api/exodus/run failed', err)
      return reply.code(500).send({ ok: false, error: 'Something went wrong' })
    }
  })

  /** ?board=all|week|daily → top 20 (longest first, earlier first on a tie), plus the caller's row when signed in. */
  app.get('/api/exodus/leaderboard', (req): ExodusBoardResponse => {
    const q = (req.query as { board?: string }).board
    const board: ExodusBoard = q === 'week' || q === 'daily' ? q : 'all'
    const now = Date.now()
    const ws = weekStart(new Date(now))
    const period = board === 'all' ? 'all' : board === 'week' ? weekKey(now) : dayKey(utcDay(now))
    const resetsAt = board === 'all' ? null : board === 'week' ? ws + 7 * DAY_MS : Date.parse(utcDay(now)) + DAY_MS
    const rows = db
      .prepare(
        `SELECT r.user_id, r.distance, r.at, u.username, u.profile, u.created_at
         FROM exodus_runs r JOIN users u ON u.id = r.user_id
         WHERE r.period = ? AND r.distance > 0
         ORDER BY r.distance DESC, r.at ASC LIMIT ?`,
      )
      .all(period, TOP) as unknown as BoardRow[]
    const top = rows.map((r, i) => toRow(r, i + 1))
    let me: ExodusBoardRow | null = null
    const user = userFromRequest(req)
    if (user) {
      const i = rows.findIndex((r) => r.user_id === user.id)
      if (i >= 0) me = top[i]
      else {
        const mine = db
          .prepare(
            `SELECT r.user_id, r.distance, r.at, u.username, u.profile, u.created_at
             FROM exodus_runs r JOIN users u ON u.id = r.user_id WHERE r.user_id = ? AND r.period = ? AND r.distance > 0`,
          )
          .get(user.id, period) as unknown as BoardRow | undefined
        if (mine) {
          const { ahead } = db
            .prepare(
              `SELECT COUNT(*) AS ahead FROM exodus_runs r JOIN users u ON u.id = r.user_id
               WHERE r.period = ? AND (r.distance > ? OR (r.distance = ? AND r.at < ?))`,
            )
            .get(period, mine.distance, mine.distance, mine.at) as { ahead: number }
          me = toRow(mine, ahead + 1)
        }
      }
    }
    return { ok: true, board, period: period === 'all' ? 'all' : period.slice(2), resetsAt, top, me }
  })
}
