/**
 * Life on the homestead: some of the people walking about the yard carry
 * something (app/src/world/yard.ts). Tapping one on your own plot gets
 * you one of it: the woodcutter's log, the shepherd's wool, the mason's stone,
 * the picker's olive oil. A small daily treat, not an income: GIFTS_PER_DAY
 * in all per UTC day, and each carrier only once every GIFT_COOLDOWN_MS.
 *
 * The server is the authority (POST /api/plot/gift in server/src/plot.ts);
 * the app uses the same rules to show who has something to give.
 */
import { DAY_MS } from './city'
import type { BuildingId, Material, PlotState } from './plot'

export const GIFT_FIGURES = ['woodcutter', 'shepherd', 'mason', 'picker'] as const
export type GiftFigure = (typeof GIFT_FIGURES)[number]

/** What each carrier gives, and the building that brings them to the plot. */
export const GIFTS: Record<GiftFigure, { material: Material; qty: number; building: BuildingId; level: number }> = {
  woodcutter: { material: 'wood', qty: 1, building: 'workshop', level: 1 },
  shepherd: { material: 'wool', qty: 1, building: 'fold', level: 1 },
  mason: { material: 'stone', qty: 1, building: 'kiln', level: 1 },
  picker: { material: 'oil', qty: 1, building: 'grove', level: 1 },
}

export const GIFTS_PER_DAY = 6
export const GIFT_COOLDOWN_MS = 3 * 60 * 60_000

/** Stored on the plot: today's count and when each carrier last gave. */
export interface GiftLog {
  /** UTC day number (ms / DAY_MS) the count belongs to. */
  day: number
  n: number
  last: Partial<Record<GiftFigure, number>>
}

export const isGiftFigure = (v: unknown): v is GiftFigure => GIFT_FIGURES.includes(v as GiftFigure)

/** Gifts given today (0 on a new day). */
export const giftsToday = (s: Pick<PlotState, 'gifts'>, now: number) => (s.gifts && s.gifts.day === Math.floor(now / DAY_MS) ? s.gifts.n : 0)

export type GiftError = 'absent' | 'cooldown' | 'daily'

/** Why this carrier can't give right now (null = it can). */
export function giftError(s: Pick<PlotState, 'gifts' | 'levels'>, figure: GiftFigure, now: number): GiftError | null {
  const g = GIFTS[figure]
  if ((s.levels[g.building] ?? 0) < g.level) return 'absent'
  if (giftsToday(s, now) >= GIFTS_PER_DAY) return 'daily'
  const last = s.gifts?.last[figure] ?? 0
  if (now - last < GIFT_COOLDOWN_MS) return 'cooldown'
  return null
}

/** Hand over the gift (call only when giftError is null). */
export function takeGift(s: PlotState, figure: GiftFigure, now: number): { material: Material; qty: number } {
  const g = GIFTS[figure]
  const day = Math.floor(now / DAY_MS)
  const log: GiftLog = s.gifts && s.gifts.day === day ? s.gifts : { day, n: 0, last: s.gifts?.last ?? {} }
  log.n += 1
  log.last[figure] = now
  s.gifts = log
  s.inventory[g.material] += g.qty
  return { material: g.material, qty: g.qty }
}
