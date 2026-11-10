import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { normalizeUsername, usernameKey } from '@sixtysix/shared'
import {
  bodyOf,
  checkPassword,
  clientIp,
  db,
  hashPassword,
  isAdminName,
  passwordError,
  sha256,
  toAccount,
  TOO_MANY,
  tooMany,
  userByName,
  userFromRequest,
  usernameError,
  type UserRow,
} from './accounts.js'
import { dropDuelsOf } from './duels.js'
import { dropHuntOf } from './hunt.js'

/**
 * Account settings for a signed-in player (Profile → Account settings in the
 * app): change or set the password, change the username, unlink Google/Apple
 * (linking lives in google.ts / apple.ts), sign out everywhere, delete the
 * account. Wrong current passwords count towards the same per-IP limit as
 * sign-in (accounts.ts → tooMany). Errors are English; the app translates them.
 */


type Handler = (me: UserRow, body: Record<string, unknown>, req: FastifyRequest, reply: FastifyReply) => unknown

/** POST route for the signed-in player, with the per-IP limit checked first (only failures are counted). */
function settingsRoute(app: FastifyInstance, path: string, fn: Handler): void {
  app.post(path, (req, reply) => {
    if (tooMany(clientIp(req), false)) return reply.code(429).send({ ok: false, error: TOO_MANY })
    const me = userFromRequest(req)
    if (!me) return reply.code(401).send({ ok: false, error: 'Signed out' })
    return fn(me, bodyOf(req), req, reply)
  })
}

/** Has this account a password that works? null = not known (older account with Google/Apple linked). */
function hasPassword(me: UserRow): boolean | null {
  return toAccount(me).logins!.password
}

/** The current password is right (counts a wrong one towards the limit). */
function passwordOk(me: UserRow, given: unknown, req: FastifyRequest): boolean {
  if (typeof given === 'string' && given && checkPassword(given, me.pass_hash)) return true
  tooMany(clientIp(req))
  return false
}

const fresh = (id: number) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow
const tokenHash = (req: FastifyRequest) => sha256((req.headers.authorization ?? '').slice(7))

export function registerAccountSettingsRoutes(app: FastifyInstance): void {
  /**
   * { current?, password }. With a password: `current` must match. A Google/Apple-only account sets one
   * without. An older linked account (not known) may leave `current` empty; if given, it must match.
   * Other devices are signed out; this one stays.
   */
  settingsRoute(app, '/api/account/password', (me, body, req) => {
    const password = typeof body.password === 'string' ? body.password : ''
    const refused = passwordError(password)
    if (refused) return { ok: false, error: refused }
    const has = hasPassword(me)
    const current = typeof body.current === 'string' ? body.current : ''
    if ((has === true || (has === null && current)) && !passwordOk(me, current, req)) return { ok: false, error: 'Current password is wrong' }
    db.prepare('UPDATE users SET pass_hash = ?, pass_set = 1 WHERE id = ?').run(hashPassword(password), me.id)
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(me.id, tokenHash(req))
    console.log(`[account] ${me.username} ${has === false ? 'set' : 'changed'} the password`)
    return { ok: true, account: toAccount(fresh(me.id)) }
  })

  /** { username }: a new name (same rules as sign-up). Staff names come from ADMIN_USERNAMES, so admins can't rename. */
  settingsRoute(app, '/api/account/username', (me, body, req) => {
    const username = typeof body.username === 'string' ? normalizeUsername(body.username) : ''
    const refused = usernameError(username)
    if (refused) return { ok: false, error: refused }
    if (isAdminName(me.username)) return { ok: false, error: 'Admins are set on the server' }
    const other = userByName(username)
    if ((other && other.id !== me.id) || isAdminName(username)) return { ok: false, error: 'That username is taken' }
    if (username === me.username) return { ok: true, account: toAccount(me) }
    tooMany(clientIp(req)) // renames count towards the limit too: no rapid name cycling
    try {
      db.prepare('UPDATE users SET username = ?, username_key = ? WHERE id = ?').run(username, usernameKey(username), me.id)
    } catch {
      return { ok: false, error: 'That username is taken' }
    }
    console.log(`[account] ${me.username} is now ${username}`)
    return { ok: true, account: toAccount(fresh(me.id)) }
  })

  /** { provider: 'google' | 'apple' }. Refused when it is the last way to sign in (a password not known to work doesn't count). */
  settingsRoute(app, '/api/account/unlink', (me, body) => {
    const provider = body.provider
    if (provider !== 'google' && provider !== 'apple') return { ok: false, error: 'Bad request' }
    const logins = toAccount(me).logins!
    if (!logins[provider]) return { ok: true, account: toAccount(me) }
    const others = (logins.password === true ? 1 : 0) + (provider === 'google' ? +logins.apple : +logins.google)
    if (!others) return { ok: false, error: 'Set a password first, so you can still sign in' }
    db.prepare(`UPDATE users SET ${provider}_sub = NULL WHERE id = ?`).run(me.id)
    console.log(`[account] ${me.username} unlinked ${provider}`)
    return { ok: true, account: toAccount(fresh(me.id)) }
  })

  /** Signs out every device, this one included. */
  settingsRoute(app, '/api/account/logout-all', (me) => {
    const { changes } = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(me.id)
    console.log(`[account] ${me.username} signed out everywhere (${changes} session${changes === 1 ? '' : 's'})`)
    return { ok: true }
  })

  /**
   * { confirm, password? }: `confirm` is the username typed again; with a password, `password` must match.
   * Removes the account and everything it owns. SQLite foreign keys aren't enforced here, so each
   * table is cleared explicitly, in one transaction. Flags stay (anonymous); the city lot frees with the row.
   */
  settingsRoute(app, '/api/account/delete', (me, body, req) => {
    if (typeof body.confirm !== 'string' || usernameKey(body.confirm) !== usernameKey(me.username)) {
      return { ok: false, error: 'Type your username to confirm' }
    }
    if (hasPassword(me) === true && !passwordOk(me, body.password, req)) return { ok: false, error: 'Current password is wrong' }
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(me.id)
      db.prepare('DELETE FROM grants WHERE user_id = ?').run(me.id)
      db.prepare('DELETE FROM plots WHERE user_id = ?').run(me.id)
      db.prepare('DELETE FROM exodus_runs WHERE user_id = ?').run(me.id)
      db.prepare('DELETE FROM hunt_days WHERE user_id = ?').run(me.id)
      // Duels still running: the other side gets their stake back, then the rows go.
      dropDuelsOf(me.id)
      db.prepare('UPDATE question_flags SET user_id = NULL WHERE user_id = ?').run(me.id)
      db.prepare('DELETE FROM users WHERE id = ?').run(me.id)
      db.exec('COMMIT')
      dropHuntOf(me.id) // and the question waiting in memory
    } catch (err) {
      db.exec('ROLLBACK')
      console.error('[account] delete failed', err)
      return { ok: false, error: 'Something went wrong' }
    }
    console.log(`[account] ${me.username} deleted their account`)
    return { ok: true }
  })
}

