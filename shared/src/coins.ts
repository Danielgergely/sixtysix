/**
 * Coins — the meta-currency, earned in every mode and spent outside matches
 * (upgrades, cosmetics; see docs/economy.md). One table so server and app
 * always agree on what an answer is worth.
 */
export const COINS_PER_CORRECT = 10
/** Extra per correct answer while on a streak of STREAK_BONUS_FROM or more. */
export const STREAK_BONUS_COINS = 5
export const STREAK_BONUS_FROM = 3
/** Practice has no clock or opponents — half rate so it can't be farmed. */
export const PRACTICE_COINS_PER_CORRECT = 5

/** `streak` counts consecutive correct answers including this one. */
export function coinsForAnswer(correct: boolean, streak: number): number {
  if (!correct) return 0
  return COINS_PER_CORRECT + (streak >= STREAK_BONUS_FROM ? STREAK_BONUS_COINS : 0)
}

const PLACEMENT_COINS = [50, 30, 20]
const FINISH_COINS = 10

/** Finishing bonus by final rank (0-based); everyone who finishes gets something. */
export function coinsForPlacement(rank: number): number {
  return PLACEMENT_COINS[rank] ?? FINISH_COINS
}
