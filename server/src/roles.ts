import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { USERNAME_RE, hasRole, type StaffRole } from '@sixtysix/shared'
import { db, isAdminName, roleOf, userFromRequest, type UserRow } from './accounts.js'

/**
 * Staff roles. Admins come from ADMIN_USERNAMES (env only; they can't be
 * revoked in the app). Admins grant or revoke 'reviewer' for any account by
 * username (users.role). Reviewers review flagged questions (flags.ts); the
 * same role will review player-submitted questions.
 */

/**
 * The signed-in user when they hold `need` (an admin holds every role).
 * Otherwise replies 401 / 403 itself and returns undefined.
 */
export function requireRole(req: FastifyRequest, reply: FastifyReply, need: StaffRole): UserRow | undefined {
  const row = userFromRequest(req)
  if (!row) {
    void reply.code(401).send({ ok: false, error: 'Signed out' })
    return undefined
  }
  if (!hasRole(roleOf(row), need)) {
    void reply.code(403).send({ ok: false, error: need === 'admin' ? 'Admins only' : 'Reviewers only' })
    return undefined
  }
  return row
}

export type StaffHandler = (row: UserRow, req: FastifyRequest, reply: FastifyReply) => unknown

/** A route only `need` (or an admin) may use; errors are caught and logged, never crash the server. */
export function staffRoute(app: FastifyInstance, method: 'get' | 'post', path: string, need: StaffRole, fn: StaffHandler): void {
  app[method](path, (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const row = requireRole(req, reply, need)
      if (!row) return reply
      return fn(row, req, reply)
    } catch (err) {
      console.error(`[roles] ${path} failed`, err)
      return reply.code(500).send({ ok: false, error: 'Something went wrong' })
    }
  })
}

const listReviewers = () =>
  (db.prepare("SELECT username FROM users WHERE role = 'reviewer' ORDER BY username COLLATE NOCASE").all() as { username: string }[]).map(
    (r) => r.username,
  )

export function registerRoleRoutes(app: FastifyInstance): void {
  /** Admins: the accounts holding the reviewer role. */
  staffRoute(app, 'get', '/api/admin/reviewers', 'admin', () => ({ ok: true, reviewers: listReviewers() }))

  /** Admins: { username, action: 'add' | 'remove' } grants or revokes the reviewer role. */
  staffRoute(app, 'post', '/api/admin/reviewers', 'admin', (row, req, reply) => {
    const body = (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}) as Record<string, unknown>
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    if ((body.action !== 'add' && body.action !== 'remove') || !USERNAME_RE.test(username)) {
      return reply.code(400).send({ ok: false, error: 'Bad request' })
    }
    const target = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username) as { id: number; username: string } | undefined
    if (!target) return reply.code(404).send({ ok: false, error: 'No such player' })
    if (isAdminName(target.username)) return reply.code(400).send({ ok: false, error: 'Admins are set on the server' })
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.action === 'add' ? 'reviewer' : null, target.id)
    console.log(`[roles] ${target.username}: reviewer ${body.action === 'add' ? 'granted' : 'revoked'} by ${row.username}`)
    return { ok: true, reviewers: listReviewers() }
  })
}
