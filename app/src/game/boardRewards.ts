import { flockReward, spiesReward, type FlockState, type SpiesState } from '@sixtysix/shared'
import { useGameStore } from './store'

/**
 * Board game rewards (shared/src/coins.ts → BOARD_REWARDS). Paid once per game
 * when it is played to the end; leaving earlier forfeits them, as in the arena.
 * The end state is re-sent after a reload, so paid games are remembered (6 h,
 * room codes get reused).
 */

export interface BoardReward {
  coins: number
  xp: number
}

const PAID_KEY = 'sixtysix.boardPaid.v1'
const PAID_TTL_MS = 6 * 3600_000

function loadPaid(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(PAID_KEY) ?? '{}') as Record<string, number>
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => typeof t === 'number' && Date.now() - t < PAID_TTL_MS))
  } catch {
    return {}
  }
}

function payOnce(key: string, reward: BoardReward): void {
  const paid = loadPaid()
  if (key in paid) return
  try {
    localStorage.setItem(PAID_KEY, JSON.stringify({ ...paid, [key]: Date.now() }))
  } catch {
    // storage unavailable — worst case a reload pays twice
  }
  useGameStore.getState().addCoins(reward.coins, reward.xp)
}

/**
 * My reward for a finished Wolf in the Flock game (abandoned games, onlookers and
 * practice games with fewer than FLOCK_REWARD_HUMANS people get nothing).
 */
export function flockRewardFor(state: FlockState, myId: string | null): BoardReward | null {
  const r = state.phase === 'over' ? state.result : null
  const me = state.players.find((p) => p.id === myId)
  if (!r?.winner || !r.rewarded || !me?.playing) return null
  // A wolf caught earlier (wrong guess) has lost, even if the other wolf wins.
  const side = r.wolfIds.includes(me.id) ? 'wolves' : 'sheep'
  return flockReward(side === r.winner && !r.lostIds.includes(me.id))
}

/** My reward for a finished Twelve Spies game (abandoned games pay nothing). */
export function spiesRewardFor(state: SpiesState, myId: string | null): BoardReward | null {
  const me = state.phase === 'over' && state.result?.winner ? state.players.find((p) => p.id === myId) : undefined
  if (!me) return null
  return spiesReward(me.team === state.result!.winner)
}

export function payFlock(state: FlockState, myId: string | null): void {
  const r = flockRewardFor(state, myId)
  if (r) payOnce(`flock:${state.code}:${state.game}`, r)
}

export function paySpies(state: SpiesState, myId: string | null): void {
  const r = spiesRewardFor(state, myId)
  if (r) payOnce(`spies:${state.code}:${state.game}`, r)
}
