import type { Material } from './plot'
import type { ScrollQuestion } from './plot'

/**
 * The scroll hunt in Jerusalem: every UTC day three scrolls are hidden at
 * places of the city, the same for everyone. Each has a riddle from a Bible
 * passage; tapping the right place finds it, one quiz question doubles what
 * was in it. The clues and where they lie are in huntClues.ts, which only the
 * server imports: a place reaches the app once its scroll is found.
 */

/** The places a scroll can lie. The 3D city has them all; the painted map only the five landmarks. */
export const HUNT_PLACES = ['temple', 'porch', 'antonia', 'pool', 'market', 'governor', 'sheepGate', 'pen', 'fishGate', 'valleyGate', 'fountainGate', 'towers'] as const
export type HuntPlace = (typeof HUNT_PLACES)[number]
export const isHuntPlace = (v: unknown): v is HuntPlace => HUNT_PLACES.includes(v as HuntPlace)

/** The city map's landmarks (cityLayout.ts LandmarkId) as hunt places. */
export const LANDMARK_PLACE: Record<'temple' | 'market' | 'governor' | 'gate' | 'pool', HuntPlace> = {
  temple: 'temple',
  market: 'market',
  governor: 'governor',
  gate: 'sheepGate',
  pool: 'pool',
}

/** Scrolls hidden each day. */
export const HUNT_SCROLLS = 3

/**
 * What a scroll holds: `amount` of one of `materials` (picked at random), the
 * same again for a right answer, and `bonus` once all of a day's scrolls are
 * found. Materials only: the daily coin caps are untouched.
 */
export const HUNT_REWARD = {
  materials: ['stone', 'wood', 'bricks'] as readonly Material[],
  amount: 15,
  bonus: { material: 'cedar' as Material, amount: 1 },
}

/** One of today's scrolls as a player sees it. */
export interface HuntScroll {
  /** The riddle and its passage, in the player's language. */
  text: string
  ref: string
  found: boolean
  /** Only once found. */
  place?: HuntPlace
  material?: Material
  /** What it gave, the doubling included. */
  amount?: number
  /** The question was answered (right or wrong). */
  answered?: boolean
  right?: boolean
}

export interface HuntView {
  ok: true
  /** The UTC day, YYYY-MM-DD. */
  day: string
  scrolls: HuntScroll[]
  /** All found today: the bonus was given. */
  bonus: boolean
  signedIn: boolean
}

/** The reply to a tap on a place. */
export type HuntFind =
  | { ok: true; found: false }
  | {
      ok: true
      found: true
      /** Which of today's scrolls (0…2). */
      scroll: number
      hunt: HuntView
      /** One question; a right answer doubles the scroll. Missing when the bank had none. */
      question?: ScrollQuestion
      /** This was the day's last scroll: the bonus came with it. */
      bonus: boolean
    }
  | { ok: false; error: string }

export type HuntAnswer = { ok: true; right: boolean; correct: number; hunt: HuntView } | { ok: false; error: string }
