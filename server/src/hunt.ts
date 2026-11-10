import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  DAY_MS,
  HUNT_REWARD,
  HUNT_SCROLLS,
  HUNT_TRIES,
  MATERIALS,
  addHauled,
  cleanLocale,
  isHuntPlace,
  newPlot,
  questionIn,
  utcDay,
  type HuntAnswer,
  type HuntFind,
  type HuntPlace,
  type HuntScroll,
  type HuntView,
  type Locale,
  type Material,
  type Materials,
  type ScrollQuestion,
} from '@sixtysix/shared'
import { cluesFor } from '@sixtysix/shared/huntClues'
import { bodyOf, db, markActive, userFromRequest, type UserRow } from './accounts.js'
import { pickQuestions, referenceIn, shuffle } from './bank.js'
import { parsePlot } from './plot.js'
import { atomic } from './tx.js'

/**
 * The scroll hunt in Jerusalem (shared/src/hunt.ts): three scrolls a day,
 * hidden at places of the city, the same for everyone. The clues come from
 * shared/src/huntClues.ts; where one lies is told only once it is found.
 * Finding a scroll puts building materials into the player's plot at once;
 * one quiz question follows, and a right answer gives the same again. No
 * coins change hands, so the daily coin caps are untouched.
 *
 * One row per player and day; older days are dropped now and then.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS hunt_days (
    user_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    state TEXT NOT NULL,
    PRIMARY KEY (user_id, day)
  );
`)

const KEEP_DAYS = 7
function prune(): void {
  db.prepare('DELETE FROM hunt_days WHERE day < ?').run(utcDay(Date.now() - KEEP_DAYS * DAY_MS))
}
prune()
setInterval(prune, DAY_MS).unref()

/** What a player found on one day, by scroll (0…2). */
interface Found {
  at: number
  material: Material
  /** Given so far (doubled by a right answer). */
  amount: number
  answered: boolean
  right: boolean
}
interface DayState {
  found: Record<string, Found>
  /** The wrong places tried, by scroll. */
  missed: Record<string, HuntPlace[]>
  bonus: boolean
}

function readDay(userId: number, day: string): DayState {
  const row = db.prepare('SELECT state FROM hunt_days WHERE user_id = ? AND day = ?').get(userId, day) as { state: string } | undefined
  const out: DayState = { found: {}, missed: {}, bonus: false }
  if (!row) return out
  try {
    const raw = JSON.parse(row.state) as Partial<DayState>
    for (const [k, f] of Object.entries(raw.found ?? {})) {
      if (!f || !MATERIALS.includes(f.material)) continue
      out.found[k] = { at: Number(f.at) || 0, material: f.material, amount: Math.max(0, Math.floor(Number(f.amount) || 0)), answered: f.answered === true, right: f.right === true }
    }
    for (const [k, places] of Object.entries(raw.missed ?? {})) if (Array.isArray(places)) out.missed[k] = places.filter(isHuntPlace).slice(0, HUNT_TRIES)
    out.bonus = raw.bonus === true
  } catch {
    // An unreadable row counts as nothing found.
  }
  return out
}

function writeDay(userId: number, day: string, state: DayState): void {
  db.prepare('INSERT INTO hunt_days (user_id, day, state) VALUES (?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET state = excluded.state').run(userId, day, JSON.stringify(state))
}

/** Materials straight into the player's plot inventory (the plot is created if they never opened My Home). */
function give(userId: number, gift: Materials, now: number): void {
  const stored = db.prepare('SELECT state FROM plots WHERE user_id = ?').get(userId) as { state: string } | undefined
  const plot = stored ? parsePlot(stored.state, now) : newPlot(now)
  addHauled(plot, gift)
  if (stored) db.prepare('UPDATE plots SET state = ? WHERE user_id = ?').run(JSON.stringify(plot), userId)
  else db.prepare('INSERT INTO plots (user_id, state, created_at) VALUES (?, ?, ?)').run(userId, JSON.stringify(plot), now)
}

/** Today's hunt as this player (or a guest) sees it: a place only with a found scroll. */
function viewOf(day: string, locale: Locale, state: DayState | null): HuntView {
  const scrolls: HuntScroll[] = cluesFor(day).map((c, i) => {
    const f = state?.found[i]
    const tries = HUNT_TRIES - (state?.missed[i]?.length ?? 0)
    const base = { text: c.text[locale], ref: c.ref[locale], tries }
    return f ? { ...base, found: true, place: c.place, material: f.material, amount: f.amount, answered: f.answered, right: f.right } : { ...base, found: false, ...(tries <= 0 ? { lost: true } : {}) }
  })
  return { ok: true, day, scrolls, bonus: state?.bonus === true, signedIn: state !== null }
}

/** The question that came with a found scroll, waiting for its answer (in memory: a restart only loses the doubling). */
interface Pending {
  day: string
  scroll: number
  correct: number
  expiresAt: number
}
const pending = new Map<number, Pending>()
const QUESTION_TTL_MS = 10 * 60_000

/** One question from the clue's book (any book when the bank has none), answers shuffled, no bank id. */
function ask(book: string, locale: Locale): { question: ScrollQuestion; correct: number } | undefined {
  const q = pickQuestions(1, { book })[0] ?? pickQuestions(1)[0]
  if (!q) return undefined
  const order = shuffle([0, 1, 2, 3])
  const { text, answers } = questionIn(q, locale)
  return { question: { id: '0', reference: referenceIn(q, locale), text, answers: order.map((k) => answers[k]) as ScrollQuestion['answers'] }, correct: order.indexOf(q.correctIndex) }
}

const fail = (error: string) => ({ ok: false as const, error })

type Handler<T> = (me: UserRow, body: Record<string, unknown>) => T

/** POST for the signed-in player: a malformed request gets an error, never a crash. */
function route<T>(app: FastifyInstance, path: string, fn: Handler<T>): void {
  app.post(path, (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const me = userFromRequest(req)
      if (!me) return reply.code(401).send(fail('Signed out'))
      return fn(me, bodyOf(req))
    } catch (err) {
      console.error(`[hunt] ${path} failed`, err)
      return reply.code(500).send(fail('Something went wrong'))
    }
  })
}

export function registerHuntRoutes(app: FastifyInstance): void {
  /** Today's three clues; guests see them too. `?locale=` picks the language. */
  app.get('/api/hunt', (req, reply) => {
    try {
      const locale = cleanLocale((req.query as { locale?: unknown } | undefined)?.locale)
      const me = userFromRequest(req)
      const day = utcDay()
      return viewOf(day, locale, me ? readDay(me.id, day) : null)
    } catch (err) {
      console.error('[hunt] /api/hunt failed', err)
      return reply.code(500).send(fail('Something went wrong'))
    }
  })

  /**
   * A guess: { scroll, place, locale }. The player searches for one riddle's
   * scroll and taps a place. Right: it is found (its materials given at once)
   * and comes with a question. Wrong: one of its `HUNT_TRIES` guesses is gone
   * (the same wrong place twice counts once); out of guesses, it stays hidden
   * for the day.
   */
  route<HuntFind>(app, '/api/hunt/find', (me, body) => {
    if (!isHuntPlace(body.place)) return fail('Unknown place')
    const scroll = Number(body.scroll)
    if (!Number.isInteger(scroll) || scroll < 0 || scroll >= HUNT_SCROLLS) return fail('Unknown scroll')
    const locale = cleanLocale(body.locale)
    const now = Date.now()
    const day = utcDay(now)
    const clues = cluesFor(day)
    const state = readDay(me.id, day)
    if (state.found[scroll]) return fail('That scroll has been read already')
    const missed = (state.missed[scroll] ??= [])
    if (missed.length >= HUNT_TRIES) return fail('That scroll stays hidden today')
    if (clues[scroll].place !== body.place) {
      if (!missed.includes(body.place)) {
        missed.push(body.place)
        writeDay(me.id, day, state)
      }
      return { ok: true, found: false, hunt: viewOf(day, locale, state) }
    }
    const material = HUNT_REWARD.materials[Math.floor(Math.random() * HUNT_REWARD.materials.length)]
    state.found[scroll] = { at: now, material, amount: HUNT_REWARD.amount, answered: false, right: false }
    const gift: Materials = { [material]: HUNT_REWARD.amount }
    // The day's last scroll brings the bonus with it.
    const bonus = !state.bonus && clues.every((_, i) => state.found[i])
    if (bonus) {
      state.bonus = true
      gift[HUNT_REWARD.bonus.material] = (gift[HUNT_REWARD.bonus.material] ?? 0) + HUNT_REWARD.bonus.amount
    }
    atomic(() => {
      give(me.id, gift, now)
      writeDay(me.id, day, state)
    })
    markActive(me.id) // going round the city tends the home
    const asked = ask(clues[scroll].book, locale)
    if (asked) pending.set(me.id, { day, scroll, correct: asked.correct, expiresAt: now + QUESTION_TTL_MS })
    else pending.delete(me.id)
    return { ok: true, found: true, scroll, hunt: viewOf(day, locale, state), question: asked?.question, bonus }
  })

  /** The found scroll's question: { scroll, pick, locale }. Right gives the scroll's materials a second time. */
  route<HuntAnswer>(app, '/api/hunt/answer', (me, body) => {
    const p = pending.get(me.id)
    const now = Date.now()
    const pick = Number(body.pick)
    if (!p || p.scroll !== Number(body.scroll) || p.expiresAt < now || p.day !== utcDay(now)) return fail('That scroll has been read already')
    if (!Number.isInteger(pick) || pick < 0 || pick > 3) return fail('Pick an answer')
    pending.delete(me.id)
    const state = readDay(me.id, p.day)
    const f = state.found[p.scroll]
    if (!f || f.answered) return fail('That scroll has been read already')
    const right = pick === p.correct
    f.answered = true
    f.right = right
    atomic(() => {
      if (right) {
        give(me.id, { [f.material]: HUNT_REWARD.amount }, now)
        f.amount += HUNT_REWARD.amount
      }
      writeDay(me.id, p.day, state)
    })
    return { ok: true, right, correct: p.correct, hunt: viewOf(p.day, cleanLocale(body.locale), state) }
  })
}

/** Inside the delete-account transaction (accountSettings.ts). */
export function dropHuntOf(userId: number): void {
  db.prepare('DELETE FROM hunt_days WHERE user_id = ?').run(userId)
  pending.delete(userId)
}
