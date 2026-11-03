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
 * as in the arena). Rated like a quiz game of the same length; winning pays 4× losing.
 */
export const BOARD_REWARDS = {
  /** Wolf in the Flock: one word, a few minutes; by side (sheep or wolves). */
  flock: { winCoins: 20, lossCoins: 5, winXp: 1200, lossXp: 300 },
  /** Twelve Spies: by result. In co-op the players win or lose together. */
  spies: { winCoins: 40, lossCoins: 10, winXp: 3000, lossXp: 750 },
  /**
   * Mission (docs/mission.md → Rewards): every right multiple-choice answer, every
   * tie-breaker won, and the final place (halved in Blitz; knocked-out seats get
   * the last place's amount).
   */
  mission: {
    perRight: { coins: 5, xp: 250 },
    tieCoins: 5,
    place: [
      { coins: 60, xp: 3000 },
      { coins: 30, xp: 1500 },
      { coins: 15, xp: 750 },
    ],
  },
} as const

type WinLossReward = { winCoins: number; lossCoins: number; winXp: number; lossXp: number }
const byResult = (r: WinLossReward, won: boolean) => (won ? { coins: r.winCoins, xp: r.winXp } : { coins: r.lossCoins, xp: r.lossXp })

export const flockReward = (won: boolean): { coins: number; xp: number } => byResult(BOARD_REWARDS.flock, won)
export const spiesReward = (won: boolean): { coins: number; xp: number } => byResult(BOARD_REWARDS.spies, won)

export interface MissionRewardParts {
  right: number
  tiesWon: number
  /** 1-based final place. */
  place: number
  blitz: boolean
}

/** A Mission seat's reward, with its parts for the result screen. */
export function missionReward(parts: MissionRewardParts): { coins: number; xp: number; rightCoins: number; tieCoins: number; placeCoins: number; placeXp: number } {
  const r = BOARD_REWARDS.mission
  const place = r.place[Math.min(r.place.length, Math.max(1, parts.place)) - 1]
  const scale = parts.blitz ? 0.5 : 1
  const rightCoins = parts.right * r.perRight.coins
  const tieCoins = parts.tiesWon * r.tieCoins
  const placeCoins = Math.round(place.coins * scale)
  const placeXp = Math.round(place.xp * scale)
  return { coins: rightCoins + tieCoins + placeCoins, xp: parts.right * r.perRight.xp + placeXp, rightCoins, tieCoins, placeCoins, placeXp }
}
