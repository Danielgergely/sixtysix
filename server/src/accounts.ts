import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  CHARACTERS,
  MIN_PASSWORD,
  STAT_COUNTERS,
  STAT_MAXES,
  USERNAME_RE,
  type Account,
  type AccountProfile,
  type AccountStats,
  type Grant,
} from '@sixtysix/shared'
import { cleanAvatar, cleanName } from './rooms.js'
import { houseLevels, publicLevels } from './plot.js'

/**
 * Optional accounts: username + password, sessions as bearer tokens, progress
 * as a JSON profile per user. SQLite file in DATA_DIR (a persistent volume in
 * production). Rewards arrive as idempotent grants (see shared/account.ts).
 */

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data')
mkdirSync(DATA_DIR, { recursive: true })
export const db = new DatabaseSync(join(DATA_DIR, 'sixtysix.db'))
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    profile TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS grants (
    id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  -- My Home in Jerusalem: one JSON PlotState per user (server/src/plot.ts).
  CREATE TABLE IF NOT EXISTS plots (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`)

// v2: grants remember their XP, for the weekly leaderboard.
try {
  db.exec('ALTER TABLE grants ADD COLUMN xp INTEGER NOT NULL DEFAULT 0')
} catch {
  // column exists
}

export interface UserRow {
  id: number
  username: string
  pass_hash: string
  created_at: number
  profile: string
}

const EMPTY_STATS: AccountStats = {
  gamesPlayed: 0,
  firstPlace: 0,
  secondPlace: 0,
  thirdPlace: 0,
  questionsAnswered: 0,
  questionsCorrect: 0,
  bestScore: 0,
  currentStreak: 0,
  bestStreak: 0,
}

// Sanity caps: one grant is one game or answer, never more than this.
const MAX_GRANT_COINS = 1_000
const MAX_GRANT_XP = 50_000
const MAX_GRANTS_PER_SYNC = 200

// ── passwords & tokens ────────────────────────────────────────────────

function hashPassword(password: string): string {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 32).toString('hex')}`
}

function checkPassword(password: string, stored: string): boolean {
  const [, saltHex, hashHex] = stored.split('$')
  const hash = Buffer.from(hashHex, 'hex')
  return timingSafeEqual(hash, scryptSync(password, Buffer.from(saltHex, 'hex'), hash.length))
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

function newSession(userId: number): string {
  const token = randomBytes(32).toString('base64url')
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)').run(sha256(token), userId, Date.now())
  return token
}

export function userFromRequest(req: FastifyRequest): UserRow | undefined {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return undefined
  return db
    .prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?')
    .get(sha256(auth.slice(7))) as UserRow | undefined
}

// ── validation ────────────────────────────────────────────────────────

const int = (v: unknown, max: number): number => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0
}

function cleanStats(raw: unknown): AccountStats {
  const s = (raw ?? {}) as Record<string, unknown>
  return Object.fromEntries(Object.keys(EMPTY_STATS).map((k) => [k, int(s[k], 1e9)])) as unknown as AccountStats
}

/** Starting profile from the device's guest progress (sign-up). */
function cleanProfile(raw: unknown): AccountProfile {
  const p = (raw ?? {}) as Record<string, unknown>
  return {
    name: cleanName(p.name),
    avatar: cleanAvatar(p.avatar),
    coins: int(p.coins, 100_000),
    xp: int(p.xp, 10_000_000),
    stats: cleanStats(p.stats),
  }
}

function applyGrant(profile: AccountProfile, g: Grant): void {
  profile.coins += int(g.coins, MAX_GRANT_COINS)
  profile.xp += int(g.xp, MAX_GRANT_XP)
  const s = (g.stats ?? {}) as Record<string, unknown>
  for (const k of STAT_COUNTERS) profile.stats[k] += int(s[k], 1_000)
  for (const k of STAT_MAXES) profile.stats[k] = Math.max(profile.stats[k], int(s[k], 1e9))
  if (s.currentStreak !== undefined) profile.stats.currentStreak = int(s.currentStreak, 1e9)
  profile.stats.bestStreak = Math.max(profile.stats.bestStreak, profile.stats.currentStreak)
}

export function toAccount(row: UserRow): Account {
  const profile = JSON.parse(row.profile) as AccountProfile
  profile.stats = { ...EMPTY_STATS, ...profile.stats }
  return { username: row.username, createdAt: row.created_at, profile }
}

export const saveProfile = (id: number, profile: AccountProfile) =>
  db.prepare('UPDATE users SET profile = ? WHERE id = ?').run(JSON.stringify(profile), id)

// ── brute-force guard: per IP, sliding minute ─────────────────────────

const attempts = new Map<string, number[]>()
function tooMany(ip: string): boolean {
  const now = Date.now()
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  attempts.set(ip, recent)
  return recent.length > 10
}

// ── routes ────────────────────────────────────────────────────────────

export function registerAccountRoutes(app: FastifyInstance): void {
  app.post('/api/account/signup', (req, reply) => {
    if (tooMany(req.ip)) return reply.code(429).send({ ok: false, error: 'Too many attempts — wait a minute.' })
    const body = (req.body ?? {}) as { username?: unknown; password?: unknown; profile?: unknown }
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!USERNAME_RE.test(username)) return { ok: false, error: 'Username: 3–20 letters, numbers, . _ or -' }
    if (password.length < MIN_PASSWORD || password.length > 200) return { ok: false, error: `Password: at least ${MIN_PASSWORD} characters` }
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return { ok: false, error: 'That username is taken' }
    const profile = cleanProfile(body.profile)
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (username, pass_hash, created_at, profile) VALUES (?, ?, ?, ?)')
      .run(username, hashPassword(password), Date.now(), JSON.stringify(profile))
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid) as unknown as UserRow
    console.log(`[account] signup ${username}`)
    return { ok: true, token: newSession(row.id), account: toAccount(row) }
  })

  app.post('/api/account/login', (req, reply) => {
    if (tooMany(req.ip)) return reply.code(429).send({ ok: false, error: 'Too many attempts — wait a minute.' })
    const body = (req.body ?? {}) as { username?: unknown; password?: unknown }
    const row = typeof body.username === 'string' ? (db.prepare('SELECT * FROM users WHERE username = ?').get(body.username.trim()) as UserRow | undefined) : undefined
    if (!row || typeof body.password !== 'string' || !checkPassword(body.password, row.pass_hash)) {
      return { ok: false, error: 'Wrong username or password' }
    }
    return { ok: true, token: newSession(row.id), account: toAccount(row) }
  })

  app.post('/api/account/logout', (req) => {
    const auth = req.headers.authorization
    if (auth?.startsWith('Bearer ')) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(auth.slice(7)))
    return { ok: true }
  })

  app.get('/api/account/me', (req, reply) => {
    const row = userFromRequest(req)
    if (!row) return reply.code(401).send({ ok: false, error: 'Signed out' })
    return { ok: true, account: toAccount(row) }
  })

  /** Apply queued grants (each once) and optional name/avatar changes. */
  app.post('/api/account/sync', (req, reply) => {
    const row = userFromRequest(req)
    if (!row) return reply.code(401).send({ ok: false, error: 'Signed out' })
    const body = (req.body ?? {}) as { grants?: unknown; name?: unknown; avatar?: unknown }
    const account = toAccount(row)
    const grants = (Array.isArray(body.grants) ? body.grants : []).slice(0, MAX_GRANTS_PER_SYNC) as Grant[]
    const seen = db.prepare('INSERT OR IGNORE INTO grants (id, user_id, at, xp) VALUES (?, ?, ?, ?)')
    for (const g of grants) {
      if (typeof g?.id !== 'string' || g.id.length > 64) continue
      if (seen.run(g.id, row.id, Date.now(), int(g.xp, MAX_GRANT_XP)).changes === 0) continue // already applied
      applyGrant(account.profile, g)
    }
    if (typeof body.name === 'string' && body.name.trim()) account.profile.name = cleanName(body.name)
    if (CHARACTERS.includes(body.avatar as (typeof CHARACTERS)[number])) account.profile.avatar = body.avatar as string
    saveProfile(row.id, account.profile)
    return { ok: true, account }
  })
}

// ── public views: leaderboard, city, profiles (accounts only) ─────────

/** Monday 00:00 UTC of the current week: the weekly board resets then. */
function weekStart(now = new Date()): number {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.getTime()
}

interface PublicRow {
  username: string
  profile: string
  created_at: number
  week_xp?: number
}

function publicPlayer(r: PublicRow) {
  const p = JSON.parse(r.profile) as AccountProfile
  return { username: r.username, name: p.name, avatar: p.avatar, xp: p.xp, weekXp: r.week_xp ?? 0, joinedAt: r.created_at }
}

export function registerPublicRoutes(app: FastifyInstance): void {
  /** ?period=week|all → top 50, plus the caller's own row when signed in. */
  app.get('/api/leaderboard', (req) => {
    const week = (req.query as { period?: string }).period === 'week'
    const since = weekStart()
    const rows = db
      .prepare(
        `SELECT u.username, u.profile, u.created_at,
                COALESCE((SELECT SUM(g.xp) FROM grants g WHERE g.user_id = u.id AND g.at >= ?), 0) AS week_xp
         FROM users u`,
      )
      .all(since) as unknown as PublicRow[]
    const players = rows.map(publicPlayer)
    const key = week ? 'weekXp' : 'xp'
    const ranked = players.filter((p) => p[key] > 0).sort((a, b) => b[key] - a[key] || a.joinedAt - b.joinedAt)
    const me = userFromRequest(req)
    const myIndex = me ? ranked.findIndex((p) => p.username === me.username) : -1
    return {
      ok: true,
      period: week ? 'week' : 'all',
      resetsAt: since + 7 * 86_400_000,
      top: ranked.slice(0, 50).map((p, i) => ({ ...p, rank: i + 1 })),
      me: myIndex >= 0 ? { ...ranked[myIndex], rank: myIndex + 1 } : null,
    }
  })

  /** Everyone with a home in Jerusalem, in the order they arrived (= plot number). */
  app.get('/api/city', () => {
    const rows = db.prepare('SELECT id, username, profile, created_at FROM users ORDER BY id LIMIT 1000').all() as unknown as (PublicRow & { id: number })[]
    const houses = houseLevels()
    return { ok: true, residents: rows.map((r, i) => ({ ...publicPlayer(r), plot: i + 1, house: houses.get(r.id) ?? 1 })) }
  })

  app.get('/api/players/:username', (req, reply) => {
    const { username } = req.params as { username: string }
    const row = db.prepare('SELECT id, username, profile, created_at FROM users WHERE username = ?').get(username) as
      | (PublicRow & { id: number })
      | undefined
    if (!row) return reply.code(404).send({ ok: false, error: 'No such player' })
    const plot = (db.prepare('SELECT COUNT(*) AS n FROM users WHERE id <= ?').get(row.id) as { n: number }).n
    const profile = JSON.parse(row.profile) as AccountProfile
    const levels = publicLevels(row.id)
    return {
      ok: true,
      player: { ...publicPlayer(row), plot, house: levels?.house ?? 1, levels, stats: { ...EMPTY_STATS, ...profile.stats } },
    }
  })
}
