import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { cleanProfile, db, hashPassword, markActive, newSession, toAccount, tooMany, userFromRequest, type UserRow } from './accounts.js'

/**
 * "Sign in with Google" (Google Identity Services). Enabled only when the
 * GOOGLE_CLIENT_ID env var is set (an OAuth "Web application" client ID; no
 * secret needed). The app gets an ID token from Google's button; we verify it
 * with Google's tokeninfo endpoint and sign the player in, creating an
 * account on first use. A signed-in username account can link Google too.
 */

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''

try {
  db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT')
} catch {
  // column exists
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users(google_sub)')

interface GoogleIdentity {
  sub: string
  email: string
  name: string
}

/** Verify an ID token: issued by Google, for our client, unexpired, verified email. */
async function verify(credential: unknown): Promise<GoogleIdentity | null> {
  if (!GOOGLE_CLIENT_ID || typeof credential !== 'string' || credential.length > 4096) return null
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`)
    if (!res.ok) return null
    const t = (await res.json()) as Record<string, string>
    const issuerOk = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com'
    if (t.aud !== GOOGLE_CLIENT_ID || !issuerOk || Number(t.exp) * 1000 < Date.now() || t.email_verified !== 'true' || !t.sub) return null
    return { sub: t.sub, email: t.email ?? '', name: t.given_name || t.name || '' }
  } catch {
    return null
  }
}

/** A free username from the email's local part, e.g. "dani.g" → "dani.g" or "dani.g27". */
export function freeUsername(email: string): string {
  const base = (email.split('@')[0] ?? '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 16).padEnd(3, '0') || 'player'
  const taken = db.prepare('SELECT 1 FROM users WHERE username = ?')
  if (!taken.get(base)) return base
  for (;;) {
    const candidate = `${base}${Math.floor(10 + Math.random() * 990)}`.slice(0, 20)
    if (!taken.get(candidate)) return candidate
  }
}

export function registerGoogleRoutes(app: FastifyInstance): void {
  /** Sign in (or sign up on first use). `created` tells the app whether to merge guest progress. */
  app.post('/api/account/google', async (req, reply) => {
    if (tooMany(req.ip)) return reply.code(429).send({ ok: false, error: 'Too many attempts — wait a minute.' })
    const body = (req.body ?? {}) as { credential?: unknown; profile?: unknown }
    const id = await verify(body.credential)
    if (!id) return reply.code(401).send({ ok: false, error: 'Google sign-in failed' })
    let row = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(id.sub) as UserRow | undefined
    let created = false
    if (!row) {
      const profile = cleanProfile(body.profile)
      profile.merged = { coins: profile.coins, xp: profile.xp }
      if (profile.name === 'Player' || profile.name === 'You') profile.name = id.name.slice(0, 14) || profile.name
      const username = freeUsername(id.email)
      try {
        const { lastInsertRowid } = db
          .prepare('INSERT INTO users (username, pass_hash, created_at, profile, google_sub) VALUES (?, ?, ?, ?, ?)')
          // Password sign-in stays possible only after the player sets one; this hash matches nothing.
          .run(username, hashPassword(randomBytes(24).toString('hex')), Date.now(), JSON.stringify(profile), id.sub)
        row = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid) as unknown as UserRow
        created = true
      } catch {
        // A second sign-in raced us and created the account first: use it.
        row = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(id.sub) as UserRow | undefined
        if (!row) return reply.code(500).send({ ok: false, error: 'Google sign-in failed' })
      }
      console.log(`[account] google signup ${username}`)
    }
    markActive(row.id)
    return { ok: true, created, token: newSession(row.id), account: toAccount(row) }
  })

  /** Link Google to the signed-in account, so either way of signing in works. */
  app.post('/api/account/google/link', async (req, reply) => {
    const me = userFromRequest(req)
    if (!me) return reply.code(401).send({ ok: false, error: 'Signed out' })
    const id = await verify((req.body as { credential?: unknown } | undefined)?.credential)
    if (!id) return reply.code(401).send({ ok: false, error: 'Google sign-in failed' })
    const other = db.prepare('SELECT id FROM users WHERE google_sub = ?').get(id.sub) as { id: number } | undefined
    if (other && other.id !== me.id) return { ok: false, error: 'This Google account belongs to another player' }
    db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(id.sub, me.id)
    return { ok: true, account: toAccount(me) }
  })
}
