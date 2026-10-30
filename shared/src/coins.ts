/**
 * Coins — the meta-currency, earned in every mode and spent outside matches
 * (Jerusalem plot, cosmetics; see docs/economy.md). One table so server and app
 * always agree on what an answer is worth.
 *
 * Playing together pays best: Open Arena > Bible Blitz (solo vs bots, offline)
 * > Practice (no clock, so it can't be farmed).
 */
export type CoinMode = 'arena' | 'blitz' | 'practice'

const RATES: Record<CoinMode, { perCorrect: number; streakBonus: number; placement: number[]; finish: number }> = {
  arena: { perCorrect: 10, streakBonus: 5, placement: [50, 30, 20], finish: 10 },
  blitz: { perCorrect: 3, streakBonus: 1, placement: [15, 10, 5], finish: 2 },
  practice: { perCorrect: 2, streakBonus: 0, placement: [], finish: 0 },
}

/** Daily Scroll: arena rate per answer (it's capped at five a day) + a bonus for all five. */
export const DAILY_COINS_PER_CORRECT = 10
export const DAILY_PERFECT_BONUS = 25
/**
 * XP per right answer where there is no clock and so no points to copy:
 * Practice and the Daily Scroll (docs/skill-tree.md §1).
 */
export const UNTIMED_XP_PER_CORRECT = 50

/** Streak bonus applies from this many consecutive correct answers. */
export const STREAK_BONUS_FROM = 3

/** `streak` counts consecutive correct answers including this one. */
export function coinsForAnswer(correct: boolean, streak: number, mode: CoinMode): number {
  if (!correct) return 0
  const r = RATES[mode]
  return r.perCorrect + (streak >= STREAK_BONUS_FROM ? r.streakBonus : 0)
}

/** Finishing bonus by final rank (0-based); everyone who finishes gets something. */
export function coinsForPlacement(rank: number, mode: CoinMode): number {
  const r = RATES[mode]
  return r.placement[rank] ?? r.finish
}

/** David vs Goliath / Rebuild the Wall: shared result instead of a placement. */
export const TEAM_WIN_COINS = 40
export const TEAM_LOSS_COINS = 15

/**
 * Board games: paid once, when a game is played to the end (leaving forfeits it,
 * as in the arena). Rated like a quiz game of the same length.
 */
export const BOARD_REWARDS = {
  /** Wolf in the Flock: one word, a few minutes; by side (sheep or wolves). */
  flock: { winCoins: 20, lossCoins: 8, winXp: 1200, lossXp: 600 },
  /** Twelve Spies: by result. In co-op the players win or lose together. */
  spies: { winCoins: TEAM_WIN_COINS, lossCoins: TEAM_LOSS_COINS, winXp: 3000, lossXp: 1500 },
} as const

export function flockReward(won: boolean): { coins: number; xp: number } {
  const r = BOARD_REWARDS.flock
  return won ? { coins: r.winCoins, xp: r.winXp } : { coins: r.lossCoins, xp: r.lossXp }
}

export function spiesReward(won: boolean): { coins: number; xp: number } {
  const r = BOARD_REWARDS.spies
  return won ? { coins: r.winCoins, xp: r.winXp } : { coins: r.lossCoins, xp: r.lossXp }
}
