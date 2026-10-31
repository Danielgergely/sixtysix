import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { isItem, settleWardrobe, unlockOf, type Account } from '@sixtysix/shared'
import { markActive, saveProfile, toAccount, userFromRequest, type UserRow } from './accounts.js'

/**
 * Look items (shared/src/looks.ts, docs/economy.md). The wardrobe lives in the
 * account profile (`profile.wardrobe`, like the skill ranks) and changes only
 * here and in /api/account/sync (which adds rare items once they are earned).
 * Replies carry the whole account; the app adopts it (coins included).
 */

type Handler = (row: UserRow, account: Account, body: Record<string, unknown>) => unknown

function route(app: FastifyInstance, path: string, fn: Handler): void {
  app.post(path, (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const row = userFromRequest(req)
      if (!row) return reply.code(401).send({ ok: false, error: 'Signed out' })
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {}
      return fn(row, toAccount(row), body)
    } catch (err) {
      console.error(`[looks] ${path} failed`, err)
      return reply.code(500).send({ ok: false, error: 'Something went wrong' })
    }
  })
}

export function registerLookRoutes(app: FastifyInstance): void {
  /** Buy one Market item: { item }. Rare items can't be bought; they are earned. */
  route(app, '/api/looks/buy', (row, account, body) => {
    const id = body.item
    if (!isItem(id)) return { ok: false, error: 'Unknown item' }
    const unlock = unlockOf(id)
    if (unlock.kind === 'free') return { ok: false, error: 'That one is free' }
    if (unlock.kind !== 'buy') return { ok: false, error: 'This item is earned, not bought' }
    const owned = settleWardrobe(account.profile)
    if (owned.includes(id)) return { ok: false, error: 'You already have it' }
    if (account.profile.coins < unlock.price) return { ok: false, error: 'Not enough coins' }
    account.profile.coins -= unlock.price
    owned.push(id)
    saveProfile(row.id, account.profile)
    markActive(row.id)
    return { ok: true, account, spent: unlock.price }
  })
}
