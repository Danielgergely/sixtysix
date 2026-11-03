/**
 * Looks: who you play as (one of 24 Bible characters in three skin tones) and
 * what they wear (head and neck items, a frame, a backdrop). docs/economy.md
 * has the prices and unlocks; app/src/looks/ draws them.
 *
 * A look travels everywhere the old character id did (profile, arena, board
 * games, public views) as one short string, so every payload and stored
 * profile keeps working:
 *
 *   base.tone.head.neck.frame.backdrop     e.g. "ruth.dark.flowers..gold.night"
 *
 * Empty or missing parts mean the default ("david" alone is still valid: David
 * in his own skin tone, nothing worn). `cleanLook` turns anything into a valid
 * look; unknown ids become the default.
 */
import type { AccountProfile } from './account'
import { levelForXp, pathPoints } from './skills'

export const CHARACTERS = [
  'david', 'moses', 'esther', 'ruth',
  'abraham', 'sarah', 'noah', 'rebekah', 'joseph', 'miriam', 'deborah', 'gideon', 'hannah', 'samuel',
  'elijah', 'naomi', 'daniel', 'mary', 'peter', 'john', 'martha', 'lydia', 'paul', 'priscilla',
] as const
export type CharacterId = (typeof CHARACTERS)[number]

export const SKIN_TONES = ['light', 'olive', 'dark'] as const
export type SkinTone = (typeof SKIN_TONES)[number]

/** The tone each character was first painted in: what a bare id ("david") shows. */
export const NATURAL_TONE: Record<CharacterId, SkinTone> = Object.fromEntries(
  CHARACTERS.map((c) => [c, c === 'esther' || c === 'moses' ? 'light' : 'olive']),
) as Record<CharacterId, SkinTone>

export const LOOK_SLOTS = ['head', 'neck', 'frame', 'backdrop'] as const
export type LookSlot = (typeof LOOK_SLOTS)[number]

/** What it takes to own an item. */
export type Unlock =
  | { kind: 'free' }
  | { kind: 'buy'; price: number }
  /** Earned, never bought (rare). */
  | { kind: 'stat'; stat: 'arenaWins' | 'bestDailyStreak' | 'questionsCorrect'; n: number }
  | { kind: 'level'; n: number }
  | { kind: 'path'; path: 'scholar'; points: number }

export interface LookItem {
  slot: LookSlot
  unlock: Unlock
}

const free = { kind: 'free' } as const
const buy = (price: number) => ({ kind: 'buy', price }) as const

/**
 * Every item, in picker order per slot. Painted ones (head, neck) are
 * public/art/item-<id>.webp; frames and backdrops are CSS. The first frame and
 * backdrop are the defaults (worn when the slot is empty, DEFAULT_FRAME / DEFAULT_BACKDROP).
 */
export const LOOK_ITEMS = {
  // head
  'band-red': { slot: 'head', unlock: buy(100) },
  'band-blue': { slot: 'head', unlock: buy(100) },
  'band-green': { slot: 'head', unlock: buy(150) },
  'band-purple': { slot: 'head', unlock: buy(200) },
  flowers: { slot: 'head', unlock: buy(300) },
  olive: { slot: 'head', unlock: buy(400) },
  turban: { slot: 'head', unlock: buy(500) },
  coins: { slot: 'head', unlock: buy(800) },
  circlet: { slot: 'head', unlock: { kind: 'stat', stat: 'arenaWins', n: 10 } },
  scholar: { slot: 'head', unlock: { kind: 'path', path: 'scholar', points: 6 } },
  victor: { slot: 'head', unlock: { kind: 'level', n: 20 } },
  // neck
  cord: { slot: 'neck', unlock: buy(100) },
  beads: { slot: 'neck', unlock: buy(200) },
  shells: { slot: 'neck', unlock: buy(300) },
  amber: { slot: 'neck', unlock: buy(500) },
  silver: { slot: 'neck', unlock: buy(700) },
  gold: { slot: 'neck', unlock: buy(1000) },
  pearls: { slot: 'neck', unlock: { kind: 'stat', stat: 'questionsCorrect', n: 1000 } },
  // frame
  gilt: { slot: 'frame', unlock: free },
  wood: { slot: 'frame', unlock: free },
  bronze: { slot: 'frame', unlock: buy(250) },
  'silver-frame': { slot: 'frame', unlock: buy(500) },
  'gold-frame': { slot: 'frame', unlock: buy(900) },
  jewel: { slot: 'frame', unlock: { kind: 'stat', stat: 'bestDailyStreak', n: 30 } },
  // backdrop
  crimson: { slot: 'backdrop', unlock: free },
  sand: { slot: 'backdrop', unlock: free },
  sky: { slot: 'backdrop', unlock: free },
  meadow: { slot: 'backdrop', unlock: free },
  teal: { slot: 'backdrop', unlock: buy(200) },
  royal: { slot: 'backdrop', unlock: buy(400) },
  dusk: { slot: 'backdrop', unlock: buy(600) },
  night: { slot: 'backdrop', unlock: buy(800) },
} as const satisfies Record<string, LookItem>

export type ItemId = keyof typeof LOOK_ITEMS
export const DEFAULT_FRAME: ItemId = 'gilt'
export const DEFAULT_BACKDROP: ItemId = 'crimson'
export const ITEM_IDS = Object.keys(LOOK_ITEMS) as ItemId[]
export const itemsIn = (slot: LookSlot): ItemId[] => ITEM_IDS.filter((id) => LOOK_ITEMS[id].slot === slot)
export const isItem = (v: unknown): v is ItemId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(LOOK_ITEMS, v)
export const unlockOf = (id: ItemId): Unlock => LOOK_ITEMS[id].unlock
export const isRare = (id: ItemId): boolean => !['free', 'buy'].includes(LOOK_ITEMS[id].unlock.kind)

export interface Look {
  base: CharacterId
  tone: SkinTone
  head?: ItemId
  neck?: ItemId
  frame?: ItemId
  backdrop?: ItemId
}

const isCharacter = (v: unknown): v is CharacterId => typeof v === 'string' && (CHARACTERS as readonly string[]).includes(v)

/** Any value (old character id, look string, junk) → a valid look. */
export function parseLook(raw: unknown): Look {
  const parts = typeof raw === 'string' ? raw.slice(0, 120).split('.') : []
  const base = isCharacter(parts[0]) ? parts[0] : CHARACTERS[0]
  const tone = (SKIN_TONES as readonly string[]).includes(parts[1]) ? (parts[1] as SkinTone) : NATURAL_TONE[base]
  const look: Look = { base, tone }
  LOOK_SLOTS.forEach((slot, i) => {
    const id = parts[i + 2]
    if (isItem(id) && LOOK_ITEMS[id].slot === slot) look[slot] = id
  })
  return look
}

/** Look → its string form, trailing empty parts dropped ("david.olive" stays readable). */
export function formatLook(look: Look): string {
  const parts = [look.base, look.tone, look.head ?? '', look.neck ?? '', look.frame ?? '', look.backdrop ?? '']
  while (parts.length > 2 && !parts[parts.length - 1]) parts.pop()
  return parts.join('.')
}

export const cleanLook = (raw: unknown): string => formatLook(parseLook(raw))

// ── ownership ─────────────────────────────────────────────────────────

/** What an unlock is measured against: the account's stats, XP and skill ranks. */
export interface UnlockProgress {
  stats: Partial<Record<'arenaWins' | 'bestDailyStreak' | 'questionsCorrect', number>>
  level: number
  /** Points spent per skill path. */
  pathPoints: Partial<Record<'scholar', number>>
}

/** How far along an earned item is: have / need (need 0 for items that can't be earned). */
export function unlockStatus(id: ItemId, p: UnlockProgress | null): { have: number; need: number } {
  const u = unlockOf(id)
  if (u.kind === 'stat') return { have: p?.stats[u.stat] ?? 0, need: u.n }
  if (u.kind === 'level') return { have: p?.level ?? 1, need: u.n }
  if (u.kind === 'path') return { have: p?.pathPoints[u.path] ?? 0, need: u.points }
  return { have: 0, need: 0 }
}

/** Rare items whose condition is met now (the server then keeps them for good). */
export function earnedItems(p: UnlockProgress): ItemId[] {
  return ITEM_IDS.filter((id) => {
    if (!isRare(id)) return false
    const { have, need } = unlockStatus(id, p)
    return have >= need
  })
}

/** Free items, plus whatever the account owns. */
export function canWear(id: ItemId, owned: readonly string[]): boolean {
  return unlockOf(id).kind === 'free' || owned.includes(id)
}

/** The look with every item the wearer doesn't own taken off. */
export function wearableLook(raw: unknown, owned: readonly string[]): string {
  const look = parseLook(raw)
  for (const slot of LOOK_SLOTS) {
    const id = look[slot]
    if (id && !canWear(id, owned)) delete look[slot]
  }
  return formatLook(look)
}

/** Owned items from a stored list: known ids only, no duplicates. */
export function cleanWardrobe(raw: unknown): ItemId[] {
  return Array.isArray(raw) ? [...new Set(raw.filter(isItem))] : []
}

/** Unlock progress of an account profile. */
export function progressFor(p: Pick<AccountProfile, 'stats' | 'xp' | 'skills'>): UnlockProgress {
  return {
    stats: { arenaWins: p.stats?.arenaWins ?? 0, bestDailyStreak: p.stats?.bestDailyStreak ?? 0, questionsCorrect: p.stats?.questionsCorrect ?? 0 },
    level: levelForXp(p.xp),
    pathPoints: { scholar: pathPoints(p.skills?.ranks ?? {}, 'scholar') },
  }
}

/** The profile's cleaned wardrobe plus every rare item it has earned by now. */
export function ownedItemsOf(profile: Pick<AccountProfile, 'wardrobe' | 'stats' | 'xp' | 'skills'>): ItemId[] {
  const owned = cleanWardrobe(profile.wardrobe)
  for (const id of earnedItems(progressFor(profile))) if (!owned.includes(id)) owned.push(id)
  return owned
}

/**
 * Server side: store ownedItemsOf on the profile. Earned items are kept even
 * if the condition later lapses (a re-spec).
 */
export function settleWardrobe(profile: AccountProfile): ItemId[] {
  const owned = ownedItemsOf(profile)
  profile.wardrobe = owned
  return owned
}
