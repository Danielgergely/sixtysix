import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  DECK_ANSWER_MAX,
  DECK_ID,
  DECK_MAX_PER_USER,
  DECK_MAX_QUESTIONS,
  DECK_TEXT_MAX,
  DECK_TITLE_MAX,
  deckProblem,
  hasRole,
  isLocale,
  type AnswerSet,
  type Deck,
  type DeckQuestion,
  type DeckSummary,
  type Question,
} from '@sixtysix/shared'
import { accountRoute, bodyOf, clientIp, db, roleOf, sha256, userFromRequest } from './accounts.js'
import { shuffle } from './bank.js'

/**
 * Player-made question decks. Private decks are only listed for their owner;
 * their random id is what lets a host play them. Community decks are listed
 * for everyone and hidden after REPORTS_TO_HIDE reports.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS decks (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    lang TEXT NOT NULL,
    public INTEGER NOT NULL DEFAULT 0,
    questions TEXT NOT NULL,
    plays INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS decks_owner ON decks(owner_id);
  CREATE INDEX IF NOT EXISTS decks_public ON decks(public, hidden, plays);
  CREATE TABLE IF NOT EXISTS deck_reports (
    deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    ip_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (deck_id, ip_key)
  );
`)

const REPORTS_TO_HIDE = 3

interface DeckRow {
  id: string
  owner_id: number
  title: string
  lang: string
  public: number
  questions: string
  plays: number
  hidden: number
  author: string
}

const SELECT = 'SELECT decks.*, users.username AS author FROM decks JOIN users ON users.id = decks.owner_id'

function summary(r: DeckRow): DeckSummary {
  return {
    id: r.id,
    title: r.title,
    lang: isLocale(r.lang) ? r.lang : 'en',
    public: r.public === 1,
    count: (JSON.parse(r.questions) as unknown[]).length,
    author: r.author,
    plays: r.plays,
  }
}

const rowById = (id: unknown): DeckRow | undefined =>
  typeof id === 'string' && DECK_ID.test(id) ? (db.prepare(`${SELECT} WHERE decks.id = ?`).get(id) as DeckRow | undefined) : undefined

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function cleanQuestions(raw: unknown): DeckQuestion[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, DECK_MAX_QUESTIONS + 1).map((q) => {
    const o = (q ?? {}) as Record<string, unknown>
    const answers = (Array.isArray(o.answers) ? o.answers : []).slice(0, 4)
    while (answers.length < 4) answers.push('')
    const correct = Math.floor(Number(o.correct))
    return {
      text: str(o.text, DECK_TEXT_MAX),
      answers: answers.map((a) => str(a, DECK_ANSWER_MAX)) as AnswerSet,
      correct: (correct >= 0 && correct <= 3 ? correct : 0) as DeckQuestion['correct'],
    }
  })
}

/** Title and size for a room's chips; undefined when the deck is gone or hidden. */
export function deckInfo(id: unknown): { id: string; title: string; count: number } | undefined {
  const r = rowById(id)
  if (!r || r.hidden) return undefined
  return { id: r.id, title: r.title, count: summary(r).count }
}

/** `count` questions from a deck, shuffled, as game questions (no verse, no flags). */
export function deckQuestions(id: string, count: number): Question[] {
  const r = rowById(id)
  if (!r || r.hidden) return []
  db.prepare('UPDATE decks SET plays = plays + 1 WHERE id = ?').run(r.id)
  const qs = JSON.parse(r.questions) as DeckQuestion[]
  return shuffle(qs.map((q, i) => ({ q, i })))
    .slice(0, count)
    .map(({ q, i }) => ({
      id: `deck:${r.id}:${i}`,
      reference: '',
      difficulty: 3,
      category: 'history',
      text: { en: q.text },
      answers: { en: q.answers },
      correctIndex: q.correct,
    }))
}

const reportKey = (req: FastifyRequest) => sha256(`66-decks:${clientIp(req)}`).slice(0, 32)

export function registerDeckRoutes(app: FastifyInstance): void {
  app.get('/api/decks/community', (req) => {
    const q = (req.query ?? {}) as Record<string, unknown>
    const search = str(q.q, 40).toLowerCase()
    const lang = isLocale(q.lang) ? q.lang : null
    const rows = db
      .prepare(
        `${SELECT} WHERE decks.public = 1 AND decks.hidden = 0 AND (? IS NULL OR decks.lang = ?) AND (? = '' OR lower(decks.title) LIKE ?)
         ORDER BY decks.plays DESC, decks.updated_at DESC LIMIT 50`,
      )
      .all(lang, lang, search, `%${search}%`) as unknown as DeckRow[]
    return { ok: true, decks: rows.map(summary) }
  })

  app.get('/api/decks/mine', (req, reply) => {
    const user = userFromRequest(req)
    if (!user) return reply.code(401).send({ ok: false, error: 'Signed out' })
    const rows = db.prepare(`${SELECT} WHERE decks.owner_id = ? ORDER BY decks.updated_at DESC`).all(user.id) as unknown as DeckRow[]
    return { ok: true, decks: rows.map(summary) }
  })

  app.get('/api/decks/:id', (req, reply) => {
    const r = rowById((req.params as { id?: string }).id)
    if (!r || r.hidden) return reply.code(404).send({ ok: false, error: 'Deck not found' })
    const user = userFromRequest(req)
    const deck: Deck = { ...summary(r), questions: JSON.parse(r.questions) as DeckQuestion[], mine: user?.id === r.owner_id }
    return { ok: true, deck }
  })

  accountRoute(app, '/api/decks/save', 'decks', (row, _account, body) => {
    const title = str(body.title, DECK_TITLE_MAX)
    const lang = isLocale(body.lang) ? body.lang : 'en'
    const isPublic = body.public === true
    const questions = cleanQuestions(body.questions)
    const problem = deckProblem(title, questions, isPublic, lang)
    if (problem) return { ok: false, error: problem }
    const now = Date.now()
    const existing = body.id === undefined ? undefined : rowById(body.id)
    if (existing) {
      if (existing.owner_id !== row.id) return { ok: false, error: 'Deck not found' }
      db.prepare('UPDATE decks SET title = ?, lang = ?, public = ?, questions = ?, updated_at = ? WHERE id = ?').run(
        title, lang, isPublic ? 1 : 0, JSON.stringify(questions), now, existing.id,
      )
      return { ok: true, id: existing.id }
    }
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM decks WHERE owner_id = ?').get(row.id) as { n: number }
    if (n >= DECK_MAX_PER_USER) return { ok: false, error: `You can have at most ${DECK_MAX_PER_USER} decks.` }
    const id = randomBytes(16).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 10).padEnd(10, 'x')
    db.prepare('INSERT INTO decks (id, owner_id, title, lang, public, questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, row.id, title, lang, isPublic ? 1 : 0, JSON.stringify(questions), now, now,
    )
    return { ok: true, id }
  })

  accountRoute(app, '/api/decks/delete', 'decks', (row, _account, body) => {
    const r = rowById(body.id)
    if (!r || (r.owner_id !== row.id && !hasRole(roleOf(row), 'reviewer'))) return { ok: false, error: 'Deck not found' }
    db.prepare('DELETE FROM decks WHERE id = ?').run(r.id)
    return { ok: true }
  })

  app.post('/api/decks/report', (req) => {
    const r = rowById(bodyOf(req).id)
    if (!r || !r.public) return { ok: true }
    db.prepare('INSERT OR IGNORE INTO deck_reports (deck_id, ip_key, created_at) VALUES (?, ?, ?)').run(r.id, reportKey(req), Date.now())
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM deck_reports WHERE deck_id = ?').get(r.id) as { n: number }
    if (n >= REPORTS_TO_HIDE) db.prepare('UPDATE decks SET hidden = 1 WHERE id = ?').run(r.id)
    return { ok: true }
  })
}
