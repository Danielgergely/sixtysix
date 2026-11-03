import type { FastifyInstance } from 'fastify'
import { MOVE_COST, moveError, type MoveError } from '@sixtysix/shared'
import { INNER_LOTS, LOTS, lotOpen } from '@sixtysix/shared/cityLayout'
import { db, idleDaysOf, markActive, publicPlayer, saveProfile, toAccount, userFromRequest, type PublicRow, type UserRow } from './accounts.js'
import { cityLevels } from './plot.js'

/**
 * Jerusalem's residents and moving house (rules in shared/src/city.ts). Lots
 * are stored per account (`users.lot`); the homestead itself stays in `plots`
 * and goes wherever its family lives.
 */

type CityRow = PublicRow & { id: number; lot: number | null; last_active: number | null }

const MOVE_MESSAGES: Record<MoveError, string> = {
  'signed-out': 'Sign in to build in Jerusalem',
  'no-lot': 'There is no such lot',
  same: 'You already live here',
  taken: 'Someone lives here',
  house: 'Taking over a place inside the wall needs a Courtyard house (level 4)',
  coins: 'Not enough coins',
  cooldown: 'You moved this week already — wait a few days',
}

export function registerCityRoutes(app: FastifyInstance): void {
  /** Everyone with an account: their lot (null = camping outside the walls until the city grows) and how long they've been away. */
  app.get('/api/city', () => {
    const now = Date.now()
    const rows = db.prepare('SELECT id, username, profile, created_at, lot, last_active FROM users ORDER BY lot IS NULL, lot').all() as unknown as CityRow[]
    const levels = cityLevels()
    return {
      ok: true,
      lots: LOTS.length,
      innerLots: INNER_LOTS,
      residents: rows.map((r) => ({ ...publicPlayer(r), lot: r.lot, idleDays: idleDaysOf(r, now), house: levels.get(r.id)?.house ?? 1, wall: levels.get(r.id)?.wall ?? 0 })),
    }
  })

  /** Move your homestead to a free lot, or take over one whose family has been away 60+ days. */
  app.post('/api/city/move', (req, reply) => {
    const me = userFromRequest(req)
    if (!me) return reply.code(401).send({ ok: false, error: MOVE_MESSAGES['signed-out'] })
    const lot = Number((req.body as { lot?: unknown } | undefined)?.lot)
    // A retired lot is no place to live (shared/src/cityLayout.ts RETIRED_LOTS).
    if (!lotOpen(lot)) return { ok: false, error: MOVE_MESSAGES['no-lot'] }
    const now = Date.now()
    const inner = lot <= INNER_LOTS
    const owner = db.prepare('SELECT id, created_at, last_active FROM users WHERE lot = ?').get(lot) as
      | { id: number; created_at: number; last_active: number | null }
      | undefined
    const account = toAccount(me)
    const mine = db.prepare('SELECT last_move_at FROM users WHERE id = ?').get(me.id) as { last_move_at: number | null }
    const err = moveError({
      inner,
      owner: owner ? { idleDays: idleDaysOf(owner, now), isMe: owner.id === me.id } : null,
      house: cityLevels().get(me.id)?.house ?? 1,
      coins: account.profile.coins,
      lastMoveAt: mine.last_move_at,
      now,
    })
    if (err) return { ok: false, error: MOVE_MESSAGES[err] }
    // The family that was away loses the place but keeps its homestead; it gets a free lot when it comes back.
    db.exec('BEGIN')
    try {
      if (owner) db.prepare('UPDATE users SET lot = NULL WHERE id = ?').run(owner.id)
      db.prepare('UPDATE users SET lot = ?, last_move_at = ? WHERE id = ?').run(lot, now, me.id)
      account.profile.coins -= inner ? MOVE_COST.inner : MOVE_COST.outer
      saveProfile(me.id, account.profile)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
    markActive(me.id)
    console.log(`[city] ${me.username} moved to lot ${lot}${owner ? ' (taken over)' : ''}`)
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id) as unknown as UserRow
    return { ok: true, lot, account: toAccount(row) }
  })
}
