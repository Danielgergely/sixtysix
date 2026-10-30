import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  DAY_MS,
  FLAG_COMMENT_MAX,
  FLAGS_PER_DAY,
  LOCALE_IDS,
  isFlagReason,
  isLocale,
  questionIn,
  type AdminFlag,
  type AdminFlagGroup,
  type AnswerSet,
  type FlagReason,
  type FlagShown,
  type FlagStatus,
  type Locale,
  type Question,
  type VerseText,
} from '@sixtysix/shared'
import { clientIp, db, userFromRequest } from './accounts.js'
import { staffRoute } from './roles.js'
import { questionById, setOutOfPlay, verseFor, versesFor } from './bank.js'

/**
 * Question flags (CLAUDE.md → Question flags). Anyone may flag a question,
 * guests included; for guests only a hash of the address is kept (for the
 * rate limit), never an identity. A question with an 'open' or 'confirmed'
 * flag is out of play: pickQuestions skips it, and the app fetches the list
 * from /api/flags/excluded. Reviewers and admins (server/src/roles.ts) review the flags; a
 * confirmed question stays out until the pipeline changes it, which turns its
 * flags 'fixed' on the next start (the bank entry's hash no longer matches).
 */

const SHOWN_TEXT_MAX = 1_000
const SHOWN_ANSWER_MAX = 300
const NOTE_MAX = 500
const ADMIN_GROUP_LIMIT = 300

interface FlagRow {
  id: number
  question_id: string
  locale: string
  reason: string
  comment: string
  shown_text: string
  user_id: number | null
  ip_key: string
  created_at: number
  status: FlagStatus
  content_hash: string
  resolved_at: number | null
  resolved_by: string | null
  note: string
  username?: string | null
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** The rate-limit key: a hash of the address, never the address itself. */
const ipKey = (req: FastifyRequest) => sha256(`66-flags:${clientIp(req)}`).slice(0, 32)

/** Hash of everything a fix in the pipeline could change: text and answers in every language, the right answer, the reference. */
export function contentHash(q: Question): string {
  const langs = [...LOCALE_IDS].sort()
  const canon = {
    text: langs.map((l) => [l, q.text[l] ?? null]),
    answers: langs.map((l) => [l, q.answers[l] ?? null]),
    correctIndex: q.correctIndex,
    reference: q.reference,
  }
  return sha256(JSON.stringify(canon))
}

/** Push the current out-of-play set to the bank (pickQuestions). */
function refreshOutOfPlay(): string[] {
  const ids = (db.prepare("SELECT DISTINCT question_id FROM question_flags WHERE status IN ('open', 'confirmed')").all() as { question_id: string }[]).map(
    (r) => r.question_id,
  )
  setOutOfPlay(ids)
  excludedCache = null
  return ids
}

/**
 * A flagged question that changed in the bank (or left it) since it was flagged
 * is back in play: its open and confirmed flags become 'fixed'.
 */
export function releaseFixed(now = Date.now()): number {
  const rows = db.prepare("SELECT id, question_id, content_hash FROM question_flags WHERE status IN ('open', 'confirmed')").all() as unknown as Pick<
    FlagRow,
    'id' | 'question_id' | 'content_hash'
  >[]
  const fix = db.prepare("UPDATE question_flags SET status = 'fixed', resolved_at = ?, resolved_by = 'auto' WHERE id = ?")
  let fixed = 0
  for (const r of rows) {
    const q = questionById(r.question_id)
    if (!q || contentHash(q) !== r.content_hash) {
      fix.run(now, r.id)
      fixed++
    }
  }
  if (fixed) console.log(`[flags] ${fixed} flag${fixed === 1 ? '' : 's'} released: the question changed in the bank`)
  refreshOutOfPlay()
  return fixed
}

// ── validation ────────────────────────────────────────────────────────

const str = (v: unknown, max: number): string | null => (typeof v === 'string' ? v.trim().slice(0, max) : null)

function cleanShown(raw: unknown, fallback: FlagShown): FlagShown {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const text = str(s.text, SHOWN_TEXT_MAX)
  const answers = Array.isArray(s.answers) && s.answers.length === 4 ? s.answers.map((a) => str(a, SHOWN_ANSWER_MAX)) : null
  if (!text || !answers || answers.some((a) => a === null)) return fallback
  return { text, answers: answers as AnswerSet }
}

function parseShown(json: string): FlagShown | null {
  try {
    const v = JSON.parse(json) as FlagShown
    return v && typeof v.text === 'string' && Array.isArray(v.answers) ? v : null
  } catch {
    return null
  }
}

const bodyOf = (req: FastifyRequest): Record<string, unknown> =>
  req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {}

/** Every language's verse for the admin view; the English reference is the question's own. */
function allVerses(q: Question): Partial<Record<Locale, VerseText>> {
  return { en: { ref: q.reference, text: verseFor(q.id) }, ...versesFor(q.id) }
}

function toAdminFlag(r: FlagRow): AdminFlag {
  return {
    id: r.id,
    reason: (isFlagReason(r.reason) ? r.reason : 'other') as FlagReason,
    comment: r.comment,
    locale: isLocale(r.locale) ? r.locale : 'en',
    shown: parseShown(r.shown_text),
    createdAt: r.created_at,
    username: r.username ?? null,
    status: r.status,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
    note: r.note,
  }
}

/** Flags grouped by question, newest first. `open` / `confirmed`: questions with a flag in that state (all their flags shown). */
function adminGroups(status: 'open' | 'confirmed' | 'all'): AdminFlagGroup[] {
  const where = status === 'all' ? '' : 'WHERE f.question_id IN (SELECT question_id FROM question_flags WHERE status = ?)'
  const rows = db
    .prepare(`SELECT f.*, u.username FROM question_flags f LEFT JOIN users u ON u.id = f.user_id ${where} ORDER BY f.created_at DESC, f.id DESC`)
    .all(...(status === 'all' ? [] : [status])) as unknown as FlagRow[]
  const groups = new Map<string, AdminFlagGroup>()
  for (const r of rows) {
    let g = groups.get(r.question_id)
    if (!g) {
      if (groups.size >= ADMIN_GROUP_LIMIT) continue
      const q = questionById(r.question_id) ?? null
      g = { questionId: r.question_id, question: q, verses: q ? allVerses(q) : {}, flags: [], latestAt: r.created_at }
      groups.set(r.question_id, g)
    }
    g.flags.push(toAdminFlag(r))
  }
  return [...groups.values()]
}

const adminStatus = (v: unknown): 'open' | 'confirmed' | 'all' => (v === 'confirmed' || v === 'all' ? v : 'open')

// ── routes ────────────────────────────────────────────────────────────

let excludedCache: { ids: string[]; etag: string } | null = null

function excludedIds(): { ids: string[]; etag: string } {
  if (!excludedCache) {
    const ids = refreshOutOfPlay().sort()
    excludedCache = { ids, etag: `"${sha256(ids.join(',')).slice(0, 16)}"` }
  }
  return excludedCache
}

export function registerFlagRoutes(app: FastifyInstance): void {
  releaseFixed()

  /**
   * Flag a question: { questionId, locale, reason, comment?, shown: { text, answers } }.
   * The same sender flagging the same question again updates their open flag.
   */
  app.post('/api/flags', (req, reply) => {
    try {
      const body = bodyOf(req)
      const q = typeof body.questionId === 'string' && body.questionId.length <= 64 ? questionById(body.questionId) : undefined
      if (!q) return reply.code(400).send({ ok: false, error: 'Unknown question' })
      if (!isFlagReason(body.reason)) return reply.code(400).send({ ok: false, error: 'Pick a reason' })
      if (body.comment !== undefined && body.comment !== null && typeof body.comment !== 'string') {
        return reply.code(400).send({ ok: false, error: 'Bad request' })
      }
      const locale: Locale = isLocale(body.locale) ? body.locale : 'en'
      const comment = str(body.comment, FLAG_COMMENT_MAX) ?? ''
      const shown = cleanShown(body.shown, questionIn(q, locale))
      const user = userFromRequest(req)
      const key = ipKey(req)
      const now = Date.now()

      // One open flag per question and sender: a second one updates it.
      const mine = user
        ? db.prepare("SELECT id FROM question_flags WHERE question_id = ? AND user_id = ? AND status IN ('open', 'confirmed')").get(q.id, user.id)
        : db
            .prepare("SELECT id FROM question_flags WHERE question_id = ? AND user_id IS NULL AND ip_key = ? AND status IN ('open', 'confirmed')")
            .get(q.id, key)
      if (mine) {
        db.prepare('UPDATE question_flags SET reason = ?, comment = ?, locale = ?, shown_text = ? WHERE id = ?').run(
          body.reason,
          comment,
          locale,
          JSON.stringify(shown),
          (mine as { id: number }).id,
        )
        return { ok: true, updated: true }
      }

      const { n } = db.prepare('SELECT COUNT(*) AS n FROM question_flags WHERE ip_key = ? AND created_at >= ?').get(key, now - DAY_MS) as { n: number }
      if (n >= FLAGS_PER_DAY) return reply.code(429).send({ ok: false, error: 'That’s a lot of flags for one day — thank you! Try again tomorrow.' })

      db.prepare(
        `INSERT INTO question_flags (question_id, locale, reason, comment, shown_text, user_id, ip_key, created_at, status, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      ).run(q.id, locale, body.reason, comment, JSON.stringify(shown), user?.id ?? null, key, now, contentHash(q))
      refreshOutOfPlay()
      console.log(`[flags] ${q.id} flagged (${body.reason}, ${locale}${user ? `, ${user.username}` : ', guest'})`)
      return { ok: true, updated: false }
    } catch (err) {
      console.error('[flags] flag failed', err)
      return reply.code(500).send({ ok: false, error: 'Something went wrong' })
    }
  })

  /** Ids out of play (open or confirmed flags). Public and small; the app caches it for offline play. */
  app.get('/api/flags/excluded', (req, reply) => {
    const { ids, etag } = excludedIds()
    reply.header('cache-control', 'public, max-age=60').header('etag', etag)
    if (req.headers['if-none-match'] === etag) return reply.code(304).send()
    return { ok: true, ids }
  })

  /** For the Profile link: how many questions wait for a decision. */
  staffRoute(app, 'get', '/api/admin/flags/summary', 'reviewer', () => {
    const count = (status: string) =>
      (db.prepare('SELECT COUNT(DISTINCT question_id) AS n FROM question_flags WHERE status = ?').get(status) as { n: number }).n
    return { ok: true, open: count('open'), confirmed: count('confirmed') }
  })

  /** ?status=open|confirmed|all → flags grouped by question, newest first. */
  staffRoute(app, 'get', '/api/admin/flags', 'reviewer', (_row, req) => {
    return { ok: true, groups: adminGroups(adminStatus((req.query as { status?: unknown }).status)) }
  })

  /** The same groups as a download, for fixing confirmed questions in question-pipeline/. */
  staffRoute(app, 'get', '/api/admin/flags/export', 'reviewer', (_row, req, reply) => {
    const status = adminStatus((req.query as { status?: unknown }).status ?? 'confirmed')
    const groups = adminGroups(status).map((g) => ({ ...g, contentHash: g.question ? contentHash(g.question) : null }))
    reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('content-disposition', `attachment; filename="question-flags-${status}-${new Date().toISOString().slice(0, 10)}.json"`)
    return JSON.stringify({ exportedAt: new Date().toISOString(), status, groups }, null, 2)
  })

  /**
   * { questionId, action: 'dismiss' | 'confirm', note? }
   * dismiss: the question is fine — its open and confirmed flags are dismissed and it is back in play.
   * confirm: it needs fixing in the pipeline — its open flags are confirmed; it stays out until fixed.
   */
  staffRoute(app, 'post', '/api/admin/flags/resolve', 'reviewer', (row, req, reply) => {
    const body = bodyOf(req)
    const questionId = typeof body.questionId === 'string' && body.questionId.length <= 64 ? body.questionId : ''
    const action = body.action
    if (!questionId || (action !== 'dismiss' && action !== 'confirm')) return reply.code(400).send({ ok: false, error: 'Bad request' })
    const note = str(body.note, NOTE_MAX) ?? ''
    const now = Date.now()
    const { changes } =
      action === 'dismiss'
        ? db
            .prepare(
              "UPDATE question_flags SET status = 'dismissed', resolved_at = ?, resolved_by = ?, note = ? WHERE question_id = ? AND status IN ('open', 'confirmed')",
            )
            .run(now, row.username, note, questionId)
        : db
            .prepare("UPDATE question_flags SET status = 'confirmed', resolved_at = ?, resolved_by = ?, note = ? WHERE question_id = ? AND status = 'open'")
            .run(now, row.username, note, questionId)
    refreshOutOfPlay()
    console.log(`[flags] ${questionId}: ${action} by ${row.username} (${changes} flag${changes === 1 ? '' : 's'})`)
    return { ok: true, changed: Number(changes) }
  })
}
