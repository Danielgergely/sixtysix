import { createPublicKey, verify as verifySignature, type JsonWebKey } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { TOO_MANY, cleanProfile, clientIp, db, markActive, newSession, signInLinked, toAccount, tooMany, userFromRequest } from './accounts.js'
import { freeUsername } from './google.js'

/**
 * "Sign in with Apple". Enabled only when APPLE_SERVICES_ID is set (the
 * Services ID made for the website in the Apple Developer portal, with
 * 66.broscafe.hu as a domain and APPLE_REDIRECT_URI as a return URL). The
 * app opens Apple's popup (Sign in with Apple JS) and sends us the ID token;
 * we check Apple's signature with its published keys, then sign the player
 * in, creating an account on first use. A native iOS app would sign tokens
 * for its bundle ID: list it in APPLE_EXTRA_AUDIENCES (comma-separated).
 * No private key is needed: we never exchange codes with Apple.
 */

export const APPLE_SERVICES_ID = process.env.APPLE_SERVICES_ID ?? ''
export const APPLE_REDIRECT_URI = process.env.APPLE_REDIRECT_URI ?? 'https://66.broscafe.hu/api/account/apple/return'
const AUDIENCES = [APPLE_SERVICES_ID, ...(process.env.APPLE_EXTRA_AUDIENCES ?? '').split(',')].map((s) => s.trim()).filter(Boolean)
const ISSUER = 'https://appleid.apple.com'

// users.apple_sub (unique) is created with the other account columns in accounts.ts.

interface AppleIdentity {
  sub: string
  email: string
}

// Apple's signing keys rotate rarely; keep them for an hour.
let keys: { at: number; list: (JsonWebKey & { kid: string })[] } | null = null
async function appleKeys(): Promise<(JsonWebKey & { kid: string })[]> {
  if (keys && Date.now() - keys.at < 3600_000) return keys.list
  const res = await fetch(`${ISSUER}/auth/keys`)
  if (!res.ok) throw new Error(`apple keys ${res.status}`)
  keys = { at: Date.now(), list: ((await res.json()) as { keys: (JsonWebKey & { kid: string })[] }).keys }
  return keys.list
}

const b64json = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>

/** Verify an ID token: signed by Apple (RS256), for our Services ID (or app), unexpired. */
async function verify(idToken: unknown): Promise<AppleIdentity | null> {
  if (!AUDIENCES.length || typeof idToken !== 'string' || idToken.length > 4096) return null
  try {
    const [h, p, s] = idToken.split('.')
    if (!h || !p || !s) return null
    const header = b64json(h)
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null
    let jwk = (await appleKeys()).find((k) => k.kid === header.kid)
    if (!jwk) {
      keys = null // a new key: fetch again once
      jwk = (await appleKeys()).find((k) => k.kid === header.kid)
    }
    if (!jwk) return null
    const ok = verifySignature('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'))
    if (!ok) return null
    const t = b64json(p)
    const aud = Array.isArray(t.aud) ? t.aud : [t.aud]
    if (t.iss !== ISSUER || !aud.some((a) => AUDIENCES.includes(String(a))) || Number(t.exp) * 1000 < Date.now() || typeof t.sub !== 'string') return null
    return { sub: t.sub, email: typeof t.email === 'string' ? t.email : '' }
  } catch (err) {
    console.error('[apple] verify failed', err)
    return null
  }
}

export function registerAppleRoutes(app: FastifyInstance): void {
  /**
   * Sign in (or sign up on first use). Apple shares the name only on the very
   * first sign-in, from the popup: the app passes it along.
   */
  app.post('/api/account/apple', async (req, reply) => {
    if (tooMany(clientIp(req))) return reply.code(429).send({ ok: false, error: TOO_MANY })
    const body = (req.body ?? {}) as { idToken?: unknown; name?: unknown; profile?: unknown }
    const id = await verify(body.idToken)
    if (!id) return reply.code(401).send({ ok: false, error: 'Apple sign-in failed' })
    const signedIn = signInLinked('apple', id.sub, () => {
      const profile = cleanProfile(body.profile)
      profile.merged = { coins: profile.coins, xp: profile.xp }
      const given = typeof body.name === 'string' ? body.name.trim().slice(0, 14) : ''
      if (given && (profile.name === 'Player' || profile.name === 'You')) profile.name = given
      // Apple may hide the email behind a relay address; then the name (or "player") seeds the username.
      const hidden = !id.email || id.email.endsWith('@privaterelay.appleid.com')
      return { username: freeUsername(hidden ? `${given.replace(/\s+/g, '') || 'player'}@x` : id.email), profile }
    })
    if (!signedIn) return reply.code(500).send({ ok: false, error: 'Apple sign-in failed' })
    const { row, created } = signedIn
    markActive(row.id)
    return { ok: true, created, token: newSession(row.id), account: toAccount(row) }
  })

  /** Link Apple to the signed-in account, so either way of signing in works. */
  app.post('/api/account/apple/link', async (req, reply) => {
    const me = userFromRequest(req)
    if (!me) return reply.code(401).send({ ok: false, error: 'Signed out' })
    const id = await verify((req.body as { idToken?: unknown } | undefined)?.idToken)
    if (!id) return reply.code(401).send({ ok: false, error: 'Apple sign-in failed' })
    const other = db.prepare('SELECT id FROM users WHERE apple_sub = ?').get(id.sub) as { id: number } | undefined
    if (other && other.id !== me.id) return { ok: false, error: 'This Apple ID belongs to another player' }
    db.prepare('UPDATE users SET apple_sub = ? WHERE id = ?').run(id.sub, me.id)
    console.log(`[account] ${me.username} linked apple`)
    return { ok: true, account: toAccount({ ...me, apple_sub: id.sub }) }
  })

  /** Return URL registered with Apple. The popup flow never lands here; a full-page fallback just goes home. */
  app.post('/api/account/apple/return', (_req, reply) => reply.redirect('/'))
  app.get('/api/account/apple/return', (_req, reply) => reply.redirect('/'))
}
