import { DUEL_EXPIRE_MS, DUEL_QUESTIONS, DUEL_STAKES, DAY_MS, EXODUS_REWARDS, HUNT_REWARD, HUNT_SCROLLS, FLOCK_MAX_LAPS, FLOCK_TWO_WOLVES_FROM, MOVE_COST, QUESTION_TIME_MS, RESPEC_COST, IDLE_DAYS } from '@sixtysix/shared'
import type { Vars } from '../i18n'

/**
 * Every tutorial in one table. A guide is a few cards (an emoji, a short
 * title, one or two sentences): shown once as the intro (IntroSheet, or a
 * Spotlight tour when the cards name `target`s), and again as the "How to
 * play" sheet behind every ⓘ and in Profile. Texts: `tutorial.<id>.name`,
 * `tutorial.<id>.c<n>.title` / `.text` (i18n/<locale>/tutorial.ts).
 *
 * Adding a game = one entry here + its texts + a `useIntro(id)` (or
 * `introThen`) where it starts and an `<InfoButton id>` on its card.
 */

export interface GuideCard {
  icon: string
  /** Spotlight: the `data-tour` value of the element this card points at (a centred card when it isn't on screen). */
  target?: string
  vars?: Vars
}

export interface Guide {
  icon: string
  cards: GuideCard[]
  /** Extra lines under the cards in the How to play sheet (full i18n keys; `<b>` allowed). */
  details?: { key: string; vars?: Vars }[]
  /** The intro rings real elements (Jerusalem) instead of a card stack. */
  tour?: boolean
}

const SECS = QUESTION_TIME_MS / 1000

export type GuideId = 'blitz' | 'arena' | 'daily' | 'practice' | 'exodus' | 'flock' | 'spies' | 'mission' | 'home' | 'city' | 'hunt' | 'duel' | 'skills' | 'looks'

export const GUIDES: Record<GuideId, Guide> = {
  blitz: { icon: '🏇', cards: [{ icon: '🏇' }, { icon: '⚡' }, { icon: '🎁' }] },
  arena: { icon: '🏟️', cards: [{ icon: '📺' }, { icon: '🎭' }, { icon: '⏱️', vars: { n: SECS } }, { icon: '🔁' }] },
  daily: { icon: '📜', cards: [{ icon: '📜' }, { icon: '🔥' }] },
  practice: { icon: '📖', cards: [{ icon: '📖' }, { icon: '🔄' }] },
  exodus: { icon: '🏃', cards: [{ icon: '👆' }, { icon: '📜' }, { icon: '✨', vars: { cap: EXODUS_REWARDS.runCoinCap } }, { icon: '🏺' }] },
  flock: {
    icon: '🐺',
    cards: [{ icon: '🐺' }, { icon: '💬' }, { icon: '🗳️' }, { icon: '🎯' }, { icon: '📱' }],
    details: [
      { key: 'flock.rules.r1', vars: { n: FLOCK_TWO_WOLVES_FROM } },
      { key: 'flock.rules.r2' },
      { key: 'flock.rules.r3', vars: { max: FLOCK_MAX_LAPS } },
      { key: 'flock.rules.r4' },
      { key: 'flock.rules.r5' },
      { key: 'flock.rules.r6' },
    ],
  },
  spies: {
    icon: '🦁',
    cards: [{ icon: '🗺️' }, { icon: '💡' }, { icon: '👆' }, { icon: '⚔️' }],
    details: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((r) => ({ key: `spies.rules.${r}` })),
  },
  mission: {
    icon: '🏰',
    cards: [{ icon: '🏰' }, { icon: '⚑' }, { icon: '⚔️' }, { icon: '📍' }, { icon: '👑' }],
    details: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'].map((r) => ({ key: `mission.rules.${r}` })),
  },
  home: {
    icon: '🏡',
    tour: true,
    cards: [{ icon: '🏡' }, { icon: '🔨', target: 'home-house' }, { icon: '🧺', target: 'home-collect' }, { icon: '📜', target: 'home-scroll' }, { icon: '⚖️', target: 'home-market' }, { icon: '🌾', target: 'home-views' }],
  },
  city: {
    icon: '🏘️',
    tour: true,
    cards: [
      { icon: '🏘️', target: 'city-me' },
      { icon: '🌿', vars: { weeds: IDLE_DAYS.weeds, sale: IDLE_DAYS.forSale } },
      { icon: '🚚', target: 'city-free', vars: { outer: MOVE_COST.outer, inner: MOVE_COST.inner } },
    ],
  },
  hunt: { icon: '📜', cards: [{ icon: '📜', vars: { n: HUNT_SCROLLS } }, { icon: '👆' }, { icon: '🧱', vars: { n: HUNT_REWARD.amount } }] },
  duel: {
    icon: '⚔️',
    cards: [
      { icon: '⚔️', vars: { low: DUEL_STAKES[0], high: DUEL_STAKES[DUEL_STAKES.length - 1] } },
      { icon: '⏱️', vars: { n: DUEL_QUESTIONS, secs: SECS } },
      { icon: '👑', vars: { days: DUEL_EXPIRE_MS / DAY_MS } },
    ],
  },
  skills: { icon: '🌳', cards: [{ icon: '⭐' }, { icon: '🌳' }, { icon: '🔁', vars: { coins: RESPEC_COST } }] },
  looks: { icon: '🎨', cards: [{ icon: '🎨' }] },
}

export const guide = (id: GuideId): Guide => GUIDES[id]

/** The order of the Profile → How to play list. */
export const GUIDE_ORDER: GuideId[] = ['blitz', 'arena', 'daily', 'practice', 'exodus', 'flock', 'spies', 'mission', 'home', 'city', 'hunt', 'duel', 'skills', 'looks']

/** One-time hints (`<Hint id>`); texts: tutorial.hints.<id>. Listed so the i18n keys stay complete. */
export const HINT_IDS = ['daily', 'wall', 'siege', 'nehemiah', 'tie'] as const
export type HintId = (typeof HINT_IDS)[number]
