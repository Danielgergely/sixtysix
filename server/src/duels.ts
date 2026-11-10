import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  DAY_MS,
  DUEL_EXPIRE_MS,
  DUEL_FINISH_MS,
  DUEL_MAX_OPEN,
  DUEL_PENNANT_MS,
  DUEL_PER_DAY,
  DUEL_QUESTIONS,
  QUESTION_TIME_MS,
  cleanLocale,
  duelScore,
  isDuelStake,
  questionIn,
  scoreAnswer,
  type Account,
  type AccountProfile,
  type DuelMark,
  type DuelQuestion,
  type DuelReveal,
  type DuelStatus,
  type DuelView,
  type Locale,
} from '@sixtysix/shared'
import { bodyOf, db, markActive, saveProfile, toAccount, userByName, userFromRequest, type UserRow } from './accounts.js'
import { pickQuestions, questionById, referenceIn, shuffle, verseFor, versesFor } from './bank.js'
import { atomic } from './tx.js'

/**
 * Duels at the gate (shared/src/duel.ts): a challenge for a stake of coins,
 * five questions played by each side on their own time, the higher score
 * takes both stakes. Plain REST, nothing polled: the app asks for its list
 * when the city opens.
 *
 * The server picks the five questions (and the order of their answers) when
 * the challenge is made, so both play the same; it serves them one at a time,
 * times each answer on receipt and gives the right answer only in the reply.
 * A question served and not answered in time scores nothing. Every money move
 * (stake taken, stakes paid, stake returned) is one SQLite transaction with
 * the duel's change of status.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS duels (
    id INTEGER PRIMARY KEY,
    a_id INTEGER NOT NULL,
    b_id INTEGER NOT NULL,
    stake INTEGER NOT NULL,
    status TEXT NOT NULL,
    questions TEXT NOT NULL,
    a_play TEXT NOT NULL,
    b_play TEXT NOT NULL,
    winner_id INTEGER,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    settled_at INTEGER,
    a_seen INTEGER NOT NULL DEFAULT 0,
    b_seen INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS duels_a ON duels(a_id, status);
  CREATE INDEX IF NOT EXISTS duels_b ON duels(b_id, status);
  CREATE INDEX IF NOT EXISTS duels_due ON duels(status, expires_at);
  CREATE INDEX IF NOT EXISTS duels_won ON duels(settled_at, winner_id);
`)

/** a = the challenger, b = the challenged. */
interface DuelRow {
  id: number
  a_id: number
  b_id: number
  stake: number
  status: DuelStatus
  questions: string
  a_play: string
  b_play: string
  winner_id: number | null
  created_at: number
  expires_at: number
  settled_at: number | null
  a_seen: number
  b_seen: number
}

/** One answer as stored: `pick` is the position tapped (null = too late), `ms` the time it took on the server's clock. */
interface Answer {
  pick: number | null
  ms: number
  right: boolean
  points: number
}
/** One side's progress: the answers so far and when the question now open was served. */
interface Play {
  answers: Answer[]
  servedAt: number | null
}
/** A question of the duel: its bank id and the order its answers are shown in (the same for both). */
interface Slot {
  id: string
  order: number[]
}

/** The network's share of an answer's time: this much past the window still counts as in time (with no speed bonus left). */
const GRACE_MS = 1500
/** Finished duels kept in a player's list. */
const HISTORY = 20

const fail = (error: string) => ({ ok: false as const, error })

function parsePlay(raw: string): Play {
  try {
    const p = JSON.parse(raw) as Partial<Play>
    const answers = (Array.isArray(p.answers) ? p.answers : []).slice(0, DUEL_QUESTIONS).map((a) => ({
      pick: Number.isInteger(a?.pick) ? (a.pick as number) : null,
      ms: Number(a?.ms) || 0,
      right: a?.right === true,
      points: Math.max(0, Math.floor(Number(a?.points) || 0)),
    }))
    return { answers, servedAt: typeof p.servedAt === 'number' ? p.servedAt : null }
  } catch {
    return { answers: [], servedAt: null }
  }
}

function parseSlots(raw: string): Slot[] {
  try {
    const s = JSON.parse(raw) as Slot[]
    return Array.isArray(s) ? s.filter((x) => typeof x?.id === 'string' && Array.isArray(x.order) && x.order.length === 4) : []
  } catch {
    return []
  }
}

const marks = (p: Play): DuelMark[] => p.answers.map((a) => ({ right: a.right, points: a.points }))
const NO_ANSWER: Answer = { pick: null, ms: 0, right: false, points: 0 }

const rowOf = (id: number) => db.prepare('SELECT * FROM duels WHERE id = ?').get(id) as unknown as DuelRow | undefined
const userOf = (id: number) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined
const savePlay = (id: number, side: 'a' | 'b', play: Play) => db.prepare(`UPDATE duels SET ${side}_play = ? WHERE id = ?`).run(JSON.stringify(play), id)

/** Adds (or takes) coins on the account as it is now; never below zero. Call it inside `atomic`. */
function pay(userId: number, delta: number): void {
  const row = userOf(userId)
  if (!row) return // the account is gone: nobody to pay
  const profile: AccountProfile = toAccount(row).profile
  profile.coins = Math.max(0, profile.coins + delta)
  saveProfile(userId, profile)
}

const accountOf = (userId: number): Account | undefined => {
  const row = userOf(userId)
  return row ? toAccount(row) : undefined
}

/** The duel as `meId` may see it: the other side's answers only once mine are in (or it is over). */
function viewFor(d: DuelRow, meId: number): DuelView {
  const mine = d.a_id === meId
  const other = userOf(mine ? d.b_id : d.a_id)
  const profile = other ? (JSON.parse(other.profile) as AccountProfile) : undefined
  const me = parsePlay(mine ? d.a_play : d.b_play)
  const them = parsePlay(mine ? d.b_play : d.a_play)
  const over = d.status !== 'open' && d.status !== 'accepted'
  const view: DuelView = {
    id: d.id,
    mine,
    other: { username: other?.username ?? '', name: profile?.name ?? '', avatar: profile?.avatar ?? '' },
    stake: d.stake,
    status: d.status,
    createdAt: d.created_at,
    expiresAt: d.expires_at,
    me: marks(me),
    them: over || me.answers.length >= DUEL_QUESTIONS ? marks(them) : null,
    themDone: them.answers.length,
  }
  if (d.status === 'done') view.outcome = d.winner_id === null ? 'tie' : d.winner_id === meId ? 'won' : 'lost'
  if (over && !(mine ? d.a_seen : d.b_seen)) view.unseen = true
  return view
}

/**
 * Both have played (or time is up): what is unanswered scores nothing, the
 * higher score takes both stakes, a tie returns them. `actor` is whoever
 * caused it, if anyone: they see the result at once.
 */
function settle(d: DuelRow, now: number, actor?: number): void {
  const fill = (raw: string): Play => {
    const p = parsePlay(raw)
    while (p.answers.length < DUEL_QUESTIONS) p.answers.push({ ...NO_ANSWER })
    return { answers: p.answers, servedAt: null }
  }
  const a = fill(d.a_play)
  const b = fill(d.b_play)
  const [sa, sb] = [duelScore(a.answers), duelScore(b.answers)]
  const winner = sa === sb ? null : sa > sb ? d.a_id : d.b_id
  atomic(() => {
    if (winner === null) {
      pay(d.a_id, d.stake)
      pay(d.b_id, d.stake)
    } else pay(winner, 2 * d.stake)
    db.prepare("UPDATE duels SET status = 'done', winner_id = ?, settled_at = ?, a_play = ?, b_play = ?, a_seen = ?, b_seen = ? WHERE id = ?").run(
      winner,
      now,
      JSON.stringify(a),
      JSON.stringify(b),
      actor === d.a_id ? 1 : 0,
      actor === d.b_id ? 1 : 0,
      d.id,
    )
  })
}

/** An unanswered or declined challenge: the challenger gets the stake back. */
function refund(d: DuelRow, status: 'declined' | 'expired', now: number): void {
  atomic(() => {
    pay(d.a_id, d.stake)
    db.prepare('UPDATE duels SET status = ?, settled_at = ?, a_seen = 0, b_seen = 1 WHERE id = ?').run(status, now, d.id)
  })
}

/** Duels whose time is up: an unanswered challenge is returned, an accepted one settled as it stands. */
function sweep(now = Date.now()): void {
  const due = db.prepare("SELECT * FROM duels WHERE status IN ('open', 'accepted') AND expires_at <= ?").all(now) as unknown as DuelRow[]
  for (const d of due) {
    try {
      if (d.status === 'open') refund(d, 'expired', now)
      else settle(d, now)
    } catch (err) {
      console.error(`[duels] could not close duel ${d.id}`, err)
    }
  }
}
sweep()
// Hourly is plenty: every duel route sweeps first, this only catches duels nobody looks at.
setInterval(sweep, 3_600_000).unref()

/** A served question whose time ran out counts as answered wrong. */
function tick(play: Play, now: number): boolean {
  if (play.servedAt === null || now <= play.servedAt + QUESTION_TIME_MS + GRACE_MS) return false
  play.answers.push({ ...NO_ANSWER, ms: now - play.servedAt })
  play.servedAt = null
  return true
}

type Handler = (me: UserRow, body: Record<string, unknown>, now: number) => unknown

/** POST for the signed-in player; due duels are closed first. A malformed request gets an error, never a crash. */
function route(app: FastifyInstance, path: string, fn: Handler): void {
  app.post(path, (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const me = userFromRequest(req)
      if (!me) return reply.code(401).send(fail('Signed out'))
      const now = Date.now()
      sweep(now)
      return fn(me, bodyOf(req), now)
    } catch (err) {
      console.error(`[duels] ${path} failed`, err)
      return reply.code(500).send(fail('Something went wrong'))
    }
  })
}

/** The duel in the body's `id` and which side the player is on. */
function mineOf(me: UserRow, body: Record<string, unknown>): { d: DuelRow; side: 'a' | 'b' } | undefined {
  const id = Number(body.id)
  if (!Number.isInteger(id) || id < 1) return undefined
  const d = rowOf(id)
  if (!d || (d.a_id !== me.id && d.b_id !== me.id)) return undefined
  return { d, side: d.a_id === me.id ? 'a' : 'b' }
}

/** A side's five are in: settle when the other's are too. Returns the duel as it stands then. */
function afterPlay(d: DuelRow, me: UserRow, now: number): DuelRow {
  const fresh = rowOf(d.id)!
  if (fresh.status !== 'accepted') return fresh
  if (parsePlay(fresh.a_play).answers.length < DUEL_QUESTIONS || parsePlay(fresh.b_play).answers.length < DUEL_QUESTIONS) return fresh
  settle(fresh, now, me.id)
  return rowOf(d.id)!
}

export function registerDuelRoutes(app: FastifyInstance): void {
  /**
   * My duels: everything still open, then the latest finished ones. `?seen=1` (the list is on
   * screen) marks the results as looked at; this reply still flags them.
   */
  app.get('/api/duels', (req, reply) => {
    try {
      const me = userFromRequest(req)
      if (!me) return reply.code(401).send(fail('Signed out'))
      sweep()
      const open = db.prepare("SELECT * FROM duels WHERE (a_id = ? OR b_id = ?) AND status IN ('open', 'accepted') ORDER BY created_at DESC").all(me.id, me.id) as unknown as DuelRow[]
      const closed = db
        .prepare("SELECT * FROM duels WHERE (a_id = ? OR b_id = ?) AND status NOT IN ('open', 'accepted') ORDER BY settled_at DESC LIMIT ?")
        .all(me.id, me.id, HISTORY) as unknown as DuelRow[]
      const duels = [...open, ...closed].map((d) => viewFor(d, me.id))
      if ((req.query as { seen?: string } | undefined)?.seen === '1') {
        db.prepare("UPDATE duels SET a_seen = 1 WHERE a_id = ? AND status NOT IN ('open', 'accepted') AND a_seen = 0").run(me.id)
        db.prepare("UPDATE duels SET b_seen = 1 WHERE b_id = ? AND status NOT IN ('open', 'accepted') AND b_seen = 0").run(me.id)
      }
      // Stakes won or returned while away: the account comes along so the app shows today's coins.
      return { ok: true, duels, account: accountOf(me.id) }
    } catch (err) {
      console.error('[duels] /api/duels failed', err)
      return reply.code(500).send(fail('Something went wrong'))
    }
  })

  /** { username, stake }: the stake is taken now; the five questions are drawn for both. */
  route(app, '/api/duels/challenge', (me, body, now) => {
    const other = typeof body.username === 'string' ? userByName(body.username) : undefined
    if (!other) return fail('No such player')
    if (other.id === me.id) return fail('You can’t duel yourself')
    if (!isDuelStake(body.stake)) return fail('Pick a stake')
    const stake = body.stake
    const pair = db.prepare("SELECT 1 FROM duels WHERE status IN ('open', 'accepted') AND ((a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?))").get(me.id, other.id, other.id, me.id)
    if (pair) return fail('You two already have a duel going')
    const sent = db.prepare("SELECT COUNT(*) AS n FROM duels WHERE a_id = ? AND status = 'open'").get(me.id) as { n: number }
    if (sent.n >= DUEL_MAX_OPEN) return fail(`You already have ${DUEL_MAX_OPEN} open challenges`)
    const today = db.prepare('SELECT COUNT(*) AS n FROM duels WHERE a_id = ? AND created_at >= ?').get(me.id, Math.floor(now / DAY_MS) * DAY_MS) as { n: number }
    if (today.n >= DUEL_PER_DAY) return fail('That’s enough duels for today — come back tomorrow')
    if (toAccount(me).profile.coins < stake) return fail('Not enough coins')
    const picked = pickQuestions(DUEL_QUESTIONS)
    if (picked.length < DUEL_QUESTIONS) return fail('Something went wrong')
    const slots: Slot[] = picked.map((q) => ({ id: q.id, order: shuffle([0, 1, 2, 3]) }))
    const empty = JSON.stringify({ answers: [], servedAt: null } satisfies Play)
    const id = atomic(() => {
      pay(me.id, -stake)
      const { lastInsertRowid } = db
        .prepare("INSERT INTO duels (a_id, b_id, stake, status, questions, a_play, b_play, created_at, expires_at, a_seen, b_seen) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, 1, 0)")
        .run(me.id, other.id, stake, JSON.stringify(slots), empty, empty, now, now + DUEL_EXPIRE_MS)
      return Number(lastInsertRowid)
    })
    markActive(me.id)
    console.log(`[duels] ${me.username} challenged ${other.username} for ${stake}`)
    return { ok: true, duel: viewFor(rowOf(id)!, me.id), account: accountOf(me.id) }
  })

  /** { id }: the challenged player puts in the same stake; then both have at least a day to finish. */
  route(app, '/api/duels/accept', (me, body, now) => {
    const found = mineOf(me, body)
    if (!found || found.side !== 'b') return fail('No such duel')
    const { d } = found
    if (d.status !== 'open') return fail('This duel is no longer open')
    if (toAccount(me).profile.coins < d.stake) return fail('Not enough coins')
    atomic(() => {
      pay(me.id, -d.stake)
      db.prepare("UPDATE duels SET status = 'accepted', expires_at = ? WHERE id = ?").run(Math.max(d.expires_at, now + DUEL_FINISH_MS), d.id)
    })
    markActive(me.id)
    return { ok: true, duel: viewFor(rowOf(d.id)!, me.id), account: accountOf(me.id) }
  })

  /** { id }: the challenged player says no; the challenger gets the stake back. */
  route(app, '/api/duels/decline', (me, body, now) => {
    const found = mineOf(me, body)
    if (!found || found.side !== 'b') return fail('No such duel')
    if (found.d.status !== 'open') return fail('This duel is no longer open')
    refund(found.d, 'declined', now)
    return { ok: true, duel: viewFor(rowOf(found.d.id)!, me.id) }
  })

  /**
   * { id, locale }: my next question (or the one still open, with the time it has left). The
   * clock for it starts here. `done: true` once my five are in.
   */
  route(app, '/api/duels/question', (me, body, now) => {
    const found = mineOf(me, body)
    if (!found) return fail('No such duel')
    const { d, side } = found
    const play = parsePlay(side === 'a' ? d.a_play : d.b_play)
    // A duel that ended with my five in (my last answer settled it) has nothing more to ask: that is "done", not an error.
    if (d.status !== 'open' && d.status !== 'accepted') return play.answers.length >= DUEL_QUESTIONS ? { ok: true, done: true, duel: viewFor(d, me.id), account: accountOf(me.id) } : fail('This duel is over')
    if (side === 'b' && d.status === 'open') return fail('Accept the challenge first')
    const slots = parseSlots(d.questions)
    let changed = tick(play, now)
    if (play.answers.length >= DUEL_QUESTIONS) {
      if (changed) savePlay(d.id, side, play)
      return { ok: true, done: true, duel: viewFor(afterPlay(d, me, now), me.id), account: accountOf(me.id) }
    }
    const slot = slots[play.answers.length]
    const q = slot && questionById(slot.id)
    if (!q) return fail('Something went wrong')
    if (play.servedAt === null) {
      play.servedAt = now
      changed = true
    }
    if (changed) savePlay(d.id, side, play)
    const { text, answers } = questionIn(q, cleanLocale(body.locale))
    const question: DuelQuestion = {
      index: play.answers.length,
      total: DUEL_QUESTIONS,
      text,
      answers: slot.order.map((k) => answers[k]) as DuelQuestion['answers'],
      endsInMs: Math.max(0, play.servedAt + QUESTION_TIME_MS - now),
    }
    return { ok: true, done: false, question, duel: viewFor(rowOf(d.id)!, me.id) }
  })

  /**
   * { id, pick, locale }: my answer to the open question (`pick` null = time ran out), timed here
   * on receipt. The reply is the first time the right answer leaves the server.
   */
  route(app, '/api/duels/answer', (me, body, now) => {
    const found = mineOf(me, body)
    if (!found) return fail('No such duel')
    const { d, side } = found
    if (d.status !== 'open' && d.status !== 'accepted') return fail('This duel is over')
    const play = parsePlay(side === 'a' ? d.a_play : d.b_play)
    if (play.servedAt === null || play.answers.length >= DUEL_QUESTIONS) return fail('No question is waiting')
    const pick = body.pick === null || body.pick === undefined ? null : Number(body.pick)
    if (pick !== null && (!Number.isInteger(pick) || pick < 0 || pick > 3)) return fail('Pick an answer')
    const index = play.answers.length
    const slot = parseSlots(d.questions)[index]
    const q = slot && questionById(slot.id)
    if (!q) return fail('Something went wrong')
    const ms = now - play.servedAt
    const late = ms > QUESTION_TIME_MS + GRACE_MS
    const correct = slot.order.indexOf(q.correctIndex)
    const right = !late && pick !== null && pick === correct
    const points = scoreAnswer(right, QUESTION_TIME_MS - ms)
    play.answers.push({ pick: late ? null : pick, ms, right, points })
    play.servedAt = null
    savePlay(d.id, side, play)
    const locale: Locale = cleanLocale(body.locale)
    const reveal: DuelReveal = { index, correct, right, points, reference: referenceIn(q, locale), verse: versesFor(q.id)[locale]?.text ?? verseFor(q.id) }
    const done = play.answers.length >= DUEL_QUESTIONS
    const after = done ? afterPlay(d, me, now) : rowOf(d.id)!
    return { ok: true, reveal, done, duel: viewFor(after, me.id), ...(after.status === 'done' && { account: accountOf(me.id) }) }
  })

  /** { id, locale }: the five questions with their right answers, once my own five are in (question by question on the result). */
  route(app, '/api/duels/rounds', (me, body) => {
    const found = mineOf(me, body)
    if (!found) return fail('No such duel')
    const { d, side } = found
    if (parsePlay(side === 'a' ? d.a_play : d.b_play).answers.length < DUEL_QUESTIONS && (d.status === 'open' || d.status === 'accepted')) return fail('Play your questions first')
    const locale = cleanLocale(body.locale)
    const rounds = parseSlots(d.questions).map((slot) => {
      const q = questionById(slot.id)
      if (!q) return { text: '', answer: '', reference: '' }
      const { text, answers } = questionIn(q, locale)
      return { text, answer: answers[q.correctIndex], reference: referenceIn(q, locale) }
    })
    return { ok: true, rounds }
  })
}

/** The families that won a duel in the last day: they fly a pennant in the city (/api/city). */
export function recentDuelWinners(now = Date.now()): Set<number> {
  const rows = db.prepare("SELECT DISTINCT winner_id FROM duels WHERE status = 'done' AND winner_id IS NOT NULL AND settled_at > ?").all(now - DUEL_PENNANT_MS) as { winner_id: number }[]
  return new Set(rows.map((r) => r.winner_id))
}

/**
 * Inside the delete-account transaction (accountSettings.ts): the other side of every duel
 * still running gets their own stake back, then the player's duels go.
 */
export function dropDuelsOf(userId: number): void {
  const running = db.prepare("SELECT * FROM duels WHERE (a_id = ? OR b_id = ?) AND status IN ('open', 'accepted')").all(userId, userId) as unknown as DuelRow[]
  for (const d of running) {
    const other = d.a_id === userId ? d.b_id : d.a_id
    // The challenged player has a stake in only once they accepted; the challenger always has.
    if (d.status === 'accepted' || other === d.a_id) pay(other, d.stake)
  }
  db.prepare('DELETE FROM duels WHERE a_id = ? OR b_id = ?').run(userId, userId)
}
