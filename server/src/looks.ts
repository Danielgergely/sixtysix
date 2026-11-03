import type { FastifyInstance } from 'fastify'
import { isItem, settleWardrobe, unlockOf } from '@sixtysix/shared'
import { accountRoute, markActive, saveProfile } from './accounts.js'

/**
 * Look items (shared/src/looks.ts, docs/economy.md). The wardrobe lives in the
 * account profile (`profile.wardrobe`, like the skill ranks) and changes only
 * here and in /api/account/sync (which adds rare items once they are earned).
 * Replies carry the whole account; the app adopts it (coins included).
 */

export function registerLookRoutes(app: FastifyInstance): void {
  /** Buy one Market item: { item }. Rare items can't be bought; they are earned. */
  accountRoute(app, '/api/looks/buy', 'looks', (row, account, body) => {
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
