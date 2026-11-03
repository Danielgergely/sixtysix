import { flockReward, missionReward, spiesReward, type FlockState, type MissionState, type SpiesState } from '@sixtysix/shared'
import { useGameStore } from './store'
import { paidLedger } from './paidLedger'

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

const paid = paidLedger('sixtysix.boardPaid.v1')

function payOnce(key: string, reward: BoardReward): void {
  if (paid.has(key)) return
  paid.add(key)
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

const SPIES_PLAYED_KEY = 'sixtysix.spiesPlayed.v1'
const spiesGame = (state: SpiesState) => `${state.code}:${state.game}`

/** Remember the running game this device sat in, so joining one that is already over pays nothing. */
export function markSpiesPlayed(state: SpiesState): void {
  if (state.phase !== 'clue' && state.phase !== 'guess') return
  try {
    localStorage.setItem(SPIES_PLAYED_KEY, spiesGame(state))
  } catch {
    // storage unavailable — the reward check below lets it through
  }
}

function playedSpies(state: SpiesState): boolean {
  try {
    return localStorage.getItem(SPIES_PLAYED_KEY) === spiesGame(state)
  } catch {
    return true
  }
}

/** My reward for a finished Twelve Spies game (abandoned games and games joined after the end pay nothing). */
export function spiesRewardFor(state: SpiesState, myId: string | null): BoardReward | null {
  const me = state.phase === 'over' && state.result?.winner ? state.players.find((p) => p.id === myId) : undefined
  if (!me || !playedSpies(state)) return null
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

const MISSION_PLAYED_KEY = 'sixtysix.missionPlayed.v1'
const missionGame = (state: MissionState) => `${state.code}:${state.game}`

/** Remember the running Mission game this device sat in (joining one that is already over pays nothing). */
export function markMissionPlayed(state: MissionState): void {
  if (state.phase === 'lobby' || state.phase === 'over') return
  try {
    localStorage.setItem(MISSION_PLAYED_KEY, missionGame(state))
  } catch {
    // storage unavailable — the reward check below lets it through
  }
}

function playedMission(state: MissionState): boolean {
  try {
    return localStorage.getItem(MISSION_PLAYED_KEY) === missionGame(state)
  } catch {
    return true
  }
}

export type MissionRewardBreakdown = ReturnType<typeof missionReward> & { right: number; tiesWon: number; place: number }

/** My reward for a finished Mission game, with its parts (right answers, tie-breakers, place). */
export function missionRewardFor(state: MissionState, myId: string | null): MissionRewardBreakdown | null {
  const r = state.phase === 'over' ? state.result : null
  const me = state.seats.find((s) => s.id === myId)
  if (!r?.rewarded || !me || !playedMission(state)) return null
  const place = r.places[me.seat] ?? state.seats.length
  return { ...missionReward({ right: me.right, tiesWon: me.tiesWon, place, blitz: state.options.map === 'blitz' }), right: me.right, tiesWon: me.tiesWon, place }
}

export function payMission(state: MissionState, myId: string | null): void {
  const r = missionRewardFor(state, myId)
  if (r) payOnce(`mission:${state.code}:${state.game}`, { coins: r.coins, xp: r.xp })
}
