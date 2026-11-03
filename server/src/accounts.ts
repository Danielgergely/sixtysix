import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  DAY_MS,
  IDLE_DAYS,
  MAX_PASSWORD,
  MIN_PASSWORD,
  STAT_COUNTERS,
  STAT_MAXES,
  EMPTY_SKILLS,
  normalizePassword,
  normalizeUsername,
  usernameKey,
  usernameProblem,
  cleanSkills,
  coinBonus,
  settleWardrobe,
  wearableLook,
  xpBonus,
  type Account,
  type AccountProfile,
  type AccountStats,
  type Grant,
  type StaffRole,
} from '@sixtysix/shared'
import { LOTS, lotOpen } from '@sixtysix/shared/cityLayout'
import { cleanName } from './rooms.js'
import { publicLevels } from './plot.js'

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
  -- Question flags from players, guests included (server/src/flags.ts).
  CREATE TABLE IF NOT EXISTS question_flags (
    id INTEGER PRIMARY KEY,
    question_id TEXT NOT NULL,
    locale TEXT NOT NULL,
    reason TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    shown_text TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ip_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    content_hash TEXT NOT NULL,
    resolved_at INTEGER,
    resolved_by TEXT,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS question_flags_status ON question_flags(status, question_id);
  CREATE INDEX IF NOT EXISTS question_flags_ip ON question_flags(ip_key, created_at);
`)

// v2: grants remember their XP, for the weekly leaderboard.
try {
  db.exec('ALTER TABLE grants ADD COLUMN xp INTEGER NOT NULL DEFAULT 0')
} catch {
  // column exists
}
// v3: grants remember their coins, for the daily ceiling.
try {
  db.exec('ALTER TABLE grants ADD COLUMN coins INTEGER NOT NULL DEFAULT 0')
} catch {
  // column exists
}
// v4: Jerusalem keeps each family's lot and when they were last active (shared/src/city.ts).
// Each step checks for itself, so a half-finished upgrade simply completes on the next start.
const userColumns = new Set((db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name))
for (const col of ['lot', 'last_active', 'last_move_at']) if (!userColumns.has(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} INTEGER`)
// v5: staff roles granted in the app ('reviewer'; server/src/roles.ts).
if (!userColumns.has('role')) db.exec('ALTER TABLE users ADD COLUMN role TEXT')
// v6: account settings. google_sub / apple_sub used to be added by google.ts / apple.ts (same columns, so
// existing databases are unchanged). username_key = NFC lower case in every alphabet (COLLATE NOCASE folds
// ASCII only): unique, so "Ős" and "ős" are one name. pass_set: 1 = the player chose a password, 0 = a
// Google/Apple account whose hash matches nothing, NULL = not known (an older account with a link).
for (const col of ['google_sub', 'apple_sub', 'username_key']) if (!userColumns.has(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT`)
if (!userColumns.has('pass_set')) {
  db.exec('ALTER TABLE users ADD COLUMN pass_set INTEGER')
  // Before Google/Apple existed every account had a password; one with neither linked still has only that.
  db.exec('UPDATE users SET pass_set = 1 WHERE google_sub IS NULL AND apple_sub IS NULL')
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users(google_sub)')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_apple_sub ON users(apple_sub)')
{
  const missing = db.prepare('SELECT id, username FROM users WHERE username_key IS NULL').all() as { id: number; username: string }[]
  const setKey = db.prepare('UPDATE users SET username_key = ? WHERE id = ?')
  for (const r of missing) setKey.run(usernameKey(r.username), r.id)
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users(username_key)')
db.exec('UPDATE users SET last_active = MAX(created_at, COALESCE((SELECT MAX(at) FROM grants WHERE grants.user_id = users.id), 0)) WHERE last_active IS NULL')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_lot ON users(lot)')
/**
 * Families without a lot get the first free ones, in sign-up order (existing families keep their old place).
 * Once the city has residents, a family whose lot was taken over while away is skipped: it gets a lot when it
 * comes back (markActive), not at every server start.
 */
function settleHomeless(): void {
  const fresh = !db.prepare('SELECT 1 FROM users WHERE lot IS NOT NULL').get()
  const homeless = db
    .prepare('SELECT id FROM users WHERE lot IS NULL AND (? OR last_active >= ?) ORDER BY id')
    .all(fresh ? 1 : 0, Date.now() - IDLE_DAYS.forSale * DAY_MS) as { id: number }[]
  let settled = 0
  for (const { id } of homeless) {
    const lot = freeLot()
    if (lot === null) break
    db.prepare('UPDATE users SET lot = ? WHERE id = ?').run(lot, id)
    settled++
  }
  if (settled) console.log(`[city] settled ${settled} famil${settled === 1 ? 'y' : 'ies'} without a lot`)
}

// ── Jerusalem: lots and activity ──────────────────────────────────────

/** The first free lot (inside the wall first), or null when the city is full (they camp outside the walls until it grows). */
function freeLot(): number | null {
  const taken = new Set((db.prepare('SELECT lot FROM users WHERE lot IS NOT NULL').all() as { lot: number }[]).map((r) => r.lot))
  // Retired lots (a road or a landmark of the 3D city took their place) are never given out.
  for (let n = 1; n <= LOTS.length; n++) if (!taken.has(n) && lotOpen(n)) return n
  return null
}

/** Playing, building or signing in: the home is tended (weeds go), and a family without a lot gets one. */
export function markActive(userId: number): void {
  const now = Date.now()
  db.prepare('UPDATE users SET last_active = ? WHERE id = ?').run(now, userId)
  const row = db.prepare('SELECT lot FROM users WHERE id = ?').get(userId) as { lot: number | null } | undefined
  if (!row || row.lot !== null) return
  const lot = freeLot()
  if (lot !== null) db.prepare('UPDATE users SET lot = ? WHERE id = ?').run(lot, userId)
}
settleHomeless()

export interface UserRow {
  id: number
  username: string
  pass_hash: string
  created_at: number
  profile: string
  /** 'reviewer' when an admin granted it (server/src/roles.ts); admins come from ADMIN_USERNAMES. */
  role?: string | null
  google_sub?: string | null
  apple_sub?: string | null
  username_key?: string | null
  /** 1 = has a password, 0 = Google/Apple only, null = not known (see the v6 migration). */
  pass_set?: number | null
}

/** Whole days since the family was last active (weeds and "For sale", shared/src/city.ts). */
export const idleDaysOf = (r: { last_active: number | null; created_at: number }, now = Date.now()): number =>
  Math.max(0, Math.floor((now - (r.last_active ?? r.created_at)) / DAY_MS))

/** The account with this username, any case and however its letters were composed. */
export function userByName(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username_key = ?').get(usernameKey(username)) as UserRow | undefined
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
  arenaWins: 0,
  bestDailyStreak: 0,
}

// Sanity caps: one grant is one game or answer, never more than this.
const MAX_GRANT_COINS = 1_000
const MAX_GRANT_XP = 50_000
/**
 * Grants are client-reported, so they are bounded per account and UTC day:
 * well above a big game day (~5 arena games ≈ 750 coins) but no free mint.
 */
const DAILY_MAX_COINS = 1_500
const DAILY_MAX_XP = 300_000
/** What a guest may bring into a new account. */
const SIGNUP_MAX_COINS = 2_000
const SIGNUP_MAX_XP = 200_000
const MAX_GRANTS_PER_SYNC = 200

// ── passwords & tokens ────────────────────────────────────────────────

/** Hashes the NFC form, so "ő" typed either way is the same password. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(normalizePassword(password), salt, 32).toString('hex')}`
}

function matches(password: string, stored: string): boolean {
  const [, saltHex, hashHex] = stored.split('$')
  if (!saltHex || !hashHex) return false
  const hash = Buffer.from(hashHex, 'hex')
  return timingSafeEqual(hash, scryptSync(password, Buffer.from(saltHex, 'hex'), hash.length))
}

/**
 * NFC first. Hashes made before passwords were normalised used the raw string, so that is tried too,
 * and the decomposed form (a password first typed where "ő" came as o + ˝). Only non-ASCII passwords
 * ever need more than one try.
 */
export function checkPassword(password: string, stored: string): boolean {
  const tries = [...new Set([normalizePassword(password), password, password.normalize('NFD')])]
  return tries.some((p) => matches(p, stored))
}

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')

export function newSession(userId: number): string {
  const token = randomBytes(32).toString('base64url')
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)').run(sha256(token), userId, Date.now())
  return token
}

/**
 * Google / Apple sign-in: the account linked to `sub`, or a new one made by `fresh()` (`created`).
 * Its password hash matches nothing: password sign-in works only after the player sets one (Account settings).
 * Null only when the insert failed and no racing sign-in created the account either.
 */
export function signInLinked(
  provider: 'google' | 'apple',
  sub: string,
  fresh: () => { username: string; profile: AccountProfile },
): { row: UserRow; created: boolean } | null {
  const linked = () => db.prepare(`SELECT * FROM users WHERE ${provider}_sub = ?`).get(sub) as UserRow | undefined
  const row = linked()
  if (row) return { row, created: false }
  const { username, profile } = fresh()
  let result: { row: UserRow; created: boolean } | null
  try {
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO users (username, username_key, pass_hash, pass_set, created_at, profile, ${provider}_sub) VALUES (?, ?, ?, 0, ?, ?, ?)`)
      .run(username, usernameKey(username), hashPassword(randomBytes(24).toString('hex')), Date.now(), JSON.stringify(profile), sub)
    result = { row: db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid) as unknown as UserRow, created: true }
  } catch {
    // A second sign-in raced us and created the account first: use it.
    const raced = linked()
    result = raced ? { row: raced, created: false } : null
  }
  if (result) console.log(`[account] ${provider} signup ${username}`)
  return result
}

export function userFromRequest(req: FastifyRequest): UserRow | undefined {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return undefined
  return db
    .prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?')
    .get(sha256(auth.slice(7))) as UserRow | undefined
}

// ── validation ────────────────────────────────────────────────────────

/** A JSON object body, or {} for anything else (missing, an array, a string). */
export const bodyOf = (req: FastifyRequest): Record<string, unknown> =>
  req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {}

export type AccountHandler = (row: UserRow, account: Account, body: Record<string, unknown>) => unknown

/** POST route for the signed-in player (skills.ts, looks.ts); errors are logged under `tag` and answered with a 500. */
export function accountRoute(app: FastifyInstance, path: string, tag: string, fn: AccountHandler): void {
  app.post(path, (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const row = userFromRequest(req)
      if (!row) return reply.code(401).send({ ok: false, error: 'Signed out' })
      return fn(row, toAccount(row), bodyOf(req))
    } catch (err) {
      console.error(`[${tag}] ${path} failed`, err)
      return reply.code(500).send({ ok: false, error: 'Something went wrong' })
    }
  })
}

const int = (v: unknown, max: number): number => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0
}

function cleanStats(raw: unknown): AccountStats {
  const s = (raw ?? {}) as Record<string, unknown>
  return Object.fromEntries(Object.keys(EMPTY_STATS).map((k) => [k, int(s[k], 1e9)])) as unknown as AccountStats
}

/** Tutorial ids seen (app/src/tutorial/): short ids like "intro.blitz" or "hint.mission.siege", at most MAX_TUTORIALS. */
const MAX_TUTORIALS = 120
const TUTORIAL_ID = /^[a-z][a-zA-Z0-9.:-]{0,47}$/
export function cleanTutorials(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  return [...new Set(raw.filter((s): s is string => typeof s === 'string' && TUTORIAL_ID.test(s)))].slice(0, MAX_TUTORIALS)
}

/** Starting profile from the device's guest progress (sign-up). */
export function cleanProfile(raw: unknown): AccountProfile {
  const p = (raw ?? {}) as Record<string, unknown>
  const tutorials = cleanTutorials(p.tutorials)
  return {
    name: cleanName(p.name),
    avatar: wearableLook(p.avatar, []), // a new account owns no items yet
    coins: int(p.coins, SIGNUP_MAX_COINS),
    xp: int(p.xp, SIGNUP_MAX_XP),
    stats: cleanStats(p.stats),
    skills: { ...EMPTY_SKILLS }, // the tree is learned on the server only, never uploaded
    ...(tutorials?.length && { tutorials }),
  }
}

/** Apply one grant whose coins/xp were already clamped to today's allowance. */
function applyGrant(profile: AccountProfile, g: Grant, coins: number, xp: number): void {
  profile.coins += coins
  profile.xp += xp
  const s = (g.stats ?? {}) as Record<string, unknown>
  for (const k of STAT_COUNTERS) profile.stats[k] += int(s[k], 1_000)
  for (const k of STAT_MAXES) profile.stats[k] = Math.max(profile.stats[k], int(s[k], 1e9))
  if (s.currentStreak !== undefined) profile.stats.currentStreak = int(s.currentStreak, 1e9)
  profile.stats.bestStreak = Math.max(profile.stats.bestStreak, profile.stats.currentStreak)
}

/** Admins: ADMIN_USERNAMES, comma-separated, any case. Set on the server only; never granted or revoked in the app. */
const ADMINS = new Set(
  (process.env.ADMIN_USERNAMES ?? '')
    .split(',')
    .map((s) => usernameKey(s))
    .filter(Boolean),
)
export const isAdminName = (username: string): boolean => ADMINS.has(usernameKey(username))

/** The account's staff role: admin from the env, reviewer from users.role (server/src/roles.ts). */
export function roleOf(row: Pick<UserRow, 'username' | 'role'> | undefined): StaffRole | null {
  if (!row) return null
  if (isAdminName(row.username)) return 'admin'
  return row.role === 'reviewer' ? 'reviewer' : null
}

export function toAccount(row: UserRow): Account {
  const profile = JSON.parse(row.profile) as AccountProfile
  profile.stats = { ...EMPTY_STATS, ...profile.stats }
  profile.skills = cleanSkills(profile.skills)
  const logins = {
    password: row.pass_set === undefined || row.pass_set === null ? (row.google_sub || row.apple_sub ? null : true) : row.pass_set === 1,
    google: !!row.google_sub,
    apple: !!row.apple_sub,
  }
  return { username: row.username, createdAt: row.created_at, profile, logins, ...(roleOf(row) && { role: roleOf(row)! }) }
}

export function saveProfile(id: number, profile: AccountProfile): void {
  profile.rev = (profile.rev ?? 0) + 1
  db.prepare('UPDATE users SET profile = ? WHERE id = ?').run(JSON.stringify(profile), id)
}

// ── brute-force guard: per IP, sliding minute ─────────────────────────

/**
 * The player's address behind a proxy, for rate limits. Coolify's Traefik
 * replaces any X-Forwarded-For sent by the client with the real address, and
 * the nearest proxy's entry is the last one; Fly sets Fly-Client-IP. Without
 * a proxy (local dev) it is the socket address.
 */
export function clientIp(req: FastifyRequest): string {
  const fly = req.headers['fly-client-ip']
  if (typeof fly === 'string' && fly) return fly
  const xff = req.headers['x-forwarded-for']
  const last = (Array.isArray(xff) ? xff.join(',') : (xff ?? '')).split(',').map((s) => s.trim()).filter(Boolean).pop()
  return last || req.ip
}

const ATTEMPT_WINDOW_MS = 60_000
export const TOO_MANY = 'Too many attempts — wait a minute.'
const attempts = new Map<string, number[]>()
/** Counts this attempt (unless `record` is false) and says whether the caller has had too many this minute. */
export function tooMany(ip: string, record = true): boolean {
  const now = Date.now()
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < ATTEMPT_WINDOW_MS)
  if (record) recent.push(now)
  if (recent.length) attempts.set(ip, recent)
  else attempts.delete(ip)
  return recent.length > 10
}
// An address that never comes back would otherwise keep its entry for good.
setInterval(() => {
  const now = Date.now()
  for (const [ip, times] of attempts) if (times.every((t) => now - t >= ATTEMPT_WINDOW_MS)) attempts.delete(ip)
}, 10 * ATTEMPT_WINDOW_MS).unref()

// ── validation messages (English; the app translates them with tServer) ──

export function usernameError(username: string): string | null {
  switch (usernameProblem(username)) {
    case 'short':
      return 'Username: at least 3 characters'
    case 'long':
      return 'Username: at most 20 characters'
    case 'spaces':
      return 'Username: only single spaces between words'
    case 'chars':
      return 'Username: letters, numbers, spaces and . _ - only'
    default:
      return null
  }
}

export function passwordError(password: string): string | null {
  const len = [...normalizePassword(password)].length
  if (len < MIN_PASSWORD) return `Password: at least ${MIN_PASSWORD} characters`
  if (len > MAX_PASSWORD) return `Password: at most ${MAX_PASSWORD} characters`
  return null
}

// ── routes ────────────────────────────────────────────────────────────

export function registerAccountRoutes(app: FastifyInstance): void {
  app.post('/api/account/signup', (req, reply) => {
    if (tooMany(clientIp(req))) return reply.code(429).send({ ok: false, error: TOO_MANY })
    const body = (req.body ?? {}) as { username?: unknown; password?: unknown; profile?: unknown }
    const username = typeof body.username === 'string' ? normalizeUsername(body.username) : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const refused = usernameError(username) ?? passwordError(password)
    if (refused) return { ok: false, error: refused }
    if (userByName(username)) return { ok: false, error: 'That username is taken' }
    const profile = cleanProfile(body.profile)
    profile.merged = { coins: profile.coins, xp: profile.xp }
    let lastInsertRowid: number | bigint
    try {
      ;({ lastInsertRowid } = db
        .prepare('INSERT INTO users (username, username_key, pass_hash, pass_set, created_at, profile) VALUES (?, ?, ?, 1, ?, ?)')
        .run(username, usernameKey(username), hashPassword(password), Date.now(), JSON.stringify(profile)))
    } catch {
      return { ok: false, error: 'That username is taken' } // a parallel sign-up won the race
    }
    markActive(Number(lastInsertRowid))
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid) as unknown as UserRow
    console.log(`[account] signup ${username}`)
    return { ok: true, token: newSession(row.id), account: toAccount(row) }
  })

  app.post('/api/account/login', (req, reply) => {
    // Only wrong passwords count, so a family signing in behind one router isn't locked out.
    if (tooMany(clientIp(req), false)) return reply.code(429).send({ ok: false, error: TOO_MANY })
    const body = (req.body ?? {}) as { username?: unknown; password?: unknown }
    const row = typeof body.username === 'string' ? userByName(body.username) : undefined
    if (!row || typeof body.password !== 'string' || !checkPassword(body.password, row.pass_hash)) {
      tooMany(clientIp(req))
      return { ok: false, error: 'Wrong username or password' }
    }
    markActive(row.id)
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
    const body = (req.body ?? {}) as { grants?: unknown; name?: unknown; avatar?: unknown; tutorials?: unknown; tutorialsReset?: unknown }
    const account = toAccount(row)
    const grants = (Array.isArray(body.grants) ? body.grants : []).slice(0, MAX_GRANTS_PER_SYNC) as Grant[]
    const seen = db.prepare('INSERT OR IGNORE INTO grants (id, user_id, at, xp, coins) VALUES (?, ?, ?, ?, ?)')
    const now = Date.now()
    const today = (db
      .prepare('SELECT COALESCE(SUM(coins), 0) AS coins, COALESCE(SUM(xp), 0) AS xp FROM grants WHERE user_id = ? AND at >= ?')
      .get(row.id, now - (now % DAY_MS)) ?? { coins: 0, xp: 0 }) as { coins: number; xp: number }
    // Skill bonuses (Diligent student, Faithful in little) are added here, on the
    // server, inside the daily ceiling; guest progress merged at sign-in gets none.
    const bonus = { xp: 0, coins: 0 }
    let applied = 0
    for (const g of grants) {
      if (typeof g?.id !== 'string' || g.id.length > 64) continue
      const merge = g.source === 'merge'
      const baseCoins = int(g.coins, MAX_GRANT_COINS)
      const baseXp = int(g.xp, MAX_GRANT_XP)
      const wantCoins = merge ? baseCoins : Math.round(baseCoins * (1 + coinBonus(account.profile.skills?.ranks)))
      const wantXp = merge ? baseXp : Math.round(baseXp * (1 + xpBonus(account.profile.skills?.ranks)))
      // Guest progress brought in at sign-in uses a one-off allowance per account
      // (shared with sign-up), not the daily ceiling, so it can't eat today's games.
      const merged = (account.profile.merged ??= { coins: 0, xp: 0 })
      const coins = merge
        ? Math.min(wantCoins, Math.max(0, SIGNUP_MAX_COINS - merged.coins))
        : Math.min(wantCoins, Math.max(0, DAILY_MAX_COINS - today.coins))
      const xp = merge ? Math.min(wantXp, Math.max(0, SIGNUP_MAX_XP - merged.xp)) : Math.min(wantXp, Math.max(0, DAILY_MAX_XP - today.xp))
      // Merge grants are stored with 0 so they don't count towards the daily sums.
      if (seen.run(g.id, row.id, now, merge ? 0 : xp, merge ? 0 : coins).changes === 0) continue // already applied
      if (merge) {
        merged.coins += coins
        merged.xp += xp
      } else {
        today.coins += coins
        today.xp += xp
      }
      bonus.coins += Math.max(0, Math.min(coins, wantCoins - baseCoins))
      bonus.xp += Math.max(0, Math.min(xp, wantXp - baseXp))
      applyGrant(account.profile, g, coins, xp)
      applied++
    }
    if (applied) markActive(row.id) // a game played tends the home
    if (typeof body.name === 'string' && body.name.trim()) account.profile.name = cleanName(body.name)
    // Rare look items earned by now join the wardrobe; only owned items can be worn (shared/src/looks.ts).
    const wardrobe = settleWardrobe(account.profile)
    if (body.avatar !== undefined) account.profile.avatar = wearableLook(body.avatar, wardrobe)
    // Tutorials seen: added to the account's list; "Show tips again" (tutorialsReset) replaces it.
    const tutorials = cleanTutorials(body.tutorials)
    if (tutorials) {
      const seenIds = body.tutorialsReset === true ? tutorials : cleanTutorials([...(account.profile.tutorials ?? []), ...tutorials])!
      if (seenIds.length) account.profile.tutorials = seenIds
      else delete account.profile.tutorials
    }
    saveProfile(row.id, account.profile)
    return { ok: true, account, bonus }
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

export { publicPlayer, type PublicRow }

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
      resetsAt: since + 7 * DAY_MS,
      top: ranked.slice(0, 50).map((p, i) => ({ ...p, rank: i + 1 })),
      me: myIndex >= 0 ? { ...ranked[myIndex], rank: myIndex + 1 } : null,
    }
  })

  app.get('/api/players/:username', (req, reply) => {
    const { username } = req.params as { username: string }
    const row = db
      .prepare('SELECT id, username, profile, created_at, lot, last_active FROM users WHERE username_key = ?')
      .get(usernameKey(username)) as (PublicRow & { id: number; lot: number | null; last_active: number | null }) | undefined
    if (!row) return reply.code(404).send({ ok: false, error: 'No such player' })
    const profile = JSON.parse(row.profile) as AccountProfile
    const levels = publicLevels(row.id)
    return {
      ok: true,
      player: {
        ...publicPlayer(row),
        lot: row.lot,
        idleDays: idleDaysOf(row),
        house: levels?.house ?? 1,
        levels,
        stats: { ...EMPTY_STATS, ...profile.stats },
      },
    }
  })
}
