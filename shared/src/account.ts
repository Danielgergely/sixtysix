import type { SkillState } from './skills'

/**
 * Optional accounts (REST under /api/account, see server/src/accounts.ts).
 * Guests play everything and keep XP/coins on the device; an account keeps the
 * progress on the server and unlocks the skill tree and the Jerusalem plot.
 */

export interface AccountStats {
  gamesPlayed: number
  firstPlace: number
  secondPlace: number
  thirdPlace: number
  questionsAnswered: number
  questionsCorrect: number
  bestScore: number
  currentStreak: number
  bestStreak: number
}

export interface AccountProfile {
  name: string
  avatar: string
  coins: number
  xp: number
  stats: AccountStats
  /** Skill tree (shared/skills.ts). Owned by the server: learned only through /api/skills. */
  skills?: SkillState
  /** Bumped by the server on every save, so the app can ignore stale replies. */
  rev?: number
  /** Guest progress already brought in (sign-up + sign-in merges), capped once per account. */
  merged?: { coins: number; xp: number }
}

export interface Account {
  username: string
  createdAt: number
  profile: AccountProfile
}

/** Counters in a grant's `stats` are added; best* take the max; currentStreak is set. */
export const STAT_COUNTERS = ['gamesPlayed', 'firstPlace', 'secondPlace', 'thirdPlace', 'questionsAnswered', 'questionsCorrect'] as const
export const STAT_MAXES = ['bestScore', 'bestStreak'] as const

/**
 * One reward (a finished race, an arena podium, a practice answer…). Sent at
 * most once per id, so a retry after a dropped connection can't pay twice.
 */
export interface Grant {
  id: string
  coins: number
  xp: number
  stats?: Partial<AccountStats>
  /** 'merge': guest progress brought into an account (no skill bonuses). Absent: a game or answer. */
  source?: 'merge'
}

export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,20}$/
export const MIN_PASSWORD = 8

export type AccountResponse = { ok: true; token?: string; account: Account } | { ok: false; error: string }
