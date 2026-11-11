import { MATERIAL_INFO, sellable, type Material } from './plot'

/**
 * The families' stall at the Market: a player puts a lot of one material up
 * for a price in coins, any other player buys the whole lot. The goods leave
 * the seller's storehouse when the lot goes up and come back if it is taken
 * down. The price must lie between what the Market pays for the lot and what
 * the Market asks for it, so both sides do better than at the Market and a
 * lot can't be used to hand coins over for nothing.
 */

/** Open lots one family may have. */
export const STALL_MAX = 5
/** Lots the stall lists (newest first; your own always). */
export const STALL_LIST = 60

export interface StallLot {
  id: number
  seller: string
  material: Material
  qty: number
  /** Coins for the whole lot. */
  price: number
  mine: boolean
}

/** May this material be put on the stall? (What the Market buys, it also lets families trade.) */
export const stallable = (m: Material) => sellable(m)

/** The lowest and highest price for a lot: the Market's own sell and buy prices, without skills. */
export const stallRange = (m: Material, qty: number) => ({ min: MATERIAL_INFO[m].sell * qty, max: MATERIAL_INFO[m].buy * qty })
