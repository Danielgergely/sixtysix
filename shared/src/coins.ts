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
  blitz: { perCorrect: 6, streakBonus: 3, placement: [25, 15, 10], finish: 5 },
  practice: { perCorrect: 3, streakBonus: 0, placement: [], finish: 0 },
}

/** Daily Scroll: arena rate per answer (it's capped at five a day) + a bonus for all five. */
export const DAILY_COINS_PER_CORRECT = 10
export const DAILY_PERFECT_BONUS = 25
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
