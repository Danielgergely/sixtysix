/**
 * Jerusalem: who lives where, and what inactivity does to a home
 * (docs/jerusalem-growth.md). The server is the authority (server/src/city.ts);
 * the app uses the same numbers to draw weeds and explain the rules.
 *
 * - Every account owns at most one lot (1…LOTS.length, see cityLayout.ts).
 *   New families take the first free lot, inside the wall first.
 * - Inactivity shows on the map (weeds at 20 days, overgrown at 40).
 * - Places inside the wall are the prize: when an inner lot's family has been
 *   away 60+ days, an active player with a well-built home (INNER_MIN_HOUSE)
 *   may take it over. Lots outside the wall are never taken from anyone.
 * - A lot is the place, not the homestead: buildings stay with the player
 *   when they move, and a family that lost its lot gets the next free one
 *   when it comes back.
 * - Anyone may also move to a free lot (a week between moves).
 */

export const IDLE_DAYS = { weeds: 20, overgrown: 40, forSale: 60 } as const
export const DAY_MS = 86_400_000

/** 0 = tended, 1 = weeds, 2 = overgrown, 3 = for sale. */
export type IdleStage = 0 | 1 | 2 | 3

export function idleStage(idleDays: number): IdleStage {
  if (idleDays >= IDLE_DAYS.forSale) return 3
  if (idleDays >= IDLE_DAYS.overgrown) return 2
  if (idleDays >= IDLE_DAYS.weeds) return 1
  return 0
}

/** Taking over an inner lot needs at least this house level (Courtyard house). */
export const INNER_MIN_HOUSE = 4
/** Coins to move to (or take over) a lot. */
export const MOVE_COST = { outer: 50, inner: 250 } as const
/** One move per week. */
export const MOVE_COOLDOWN_MS = 7 * DAY_MS

export type MoveError = 'signed-out' | 'no-lot' | 'same' | 'taken' | 'house' | 'coins' | 'cooldown'

/** Why the player can't move to a lot right now (null = they can). */
export function moveError(o: {
  inner: boolean
  /** The lot's owner and how long they've been away; null = free land. */
  owner: { idleDays: number; isMe: boolean } | null
  house: number
  coins: number
  lastMoveAt: number | null
  now: number
}): MoveError | null {
  if (o.owner?.isMe) return 'same'
  // Only an inner lot whose family has been away long enough can change hands.
  if (o.owner && (!o.inner || idleStage(o.owner.idleDays) < 3)) return 'taken'
  if (o.owner && o.house < INNER_MIN_HOUSE) return 'house'
  if (o.lastMoveAt && o.now - o.lastMoveAt < MOVE_COOLDOWN_MS) return 'cooldown'
  if (o.coins < (o.inner ? MOVE_COST.inner : MOVE_COST.outer)) return 'coins'
  return null
}
