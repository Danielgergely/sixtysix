import { TEAM_LOSS_COINS, TEAM_WIN_COINS, coinsForPlacement } from '@sixtysix/shared'
import type { Room, RoomPlayer } from './rooms.js'

/**
 * Arena game modes on top of the shared question loop (see RoomConfig.mode):
 * - goliath: the room's points are damage against one giant; he falls at 0 HP
 *   and the game ends early (victory for everyone).
 * - wall: players are split into gate teams (Neh 3); a team's wall height is
 *   its AVERAGE score, so uneven teams stay fair.
 */

/** The gates of Nehemiah 3, one per team. */
export const GATES = ['Sheep Gate', 'Fish Gate', 'Valley Gate', 'Fountain Gate']
/**
 * Giant's health per player per question, in points. A correct answer scores
 * 500–1000, so ~45 % right at average speed brings him down on the last question.
 */
const GOLIATH_HP_PER_PLAYER_QUESTION = 330

function shuffled<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function countMembers(room: Room): void {
  if (!room.teams) return
  for (const t of room.teams) t.members = [...room.players.values()].filter((p) => p.team === t.id).length
}

/** Called once the questions are drawn, before the first question. */
export function setupMode(room: Room): void {
  room.goliath = undefined
  room.teams = undefined
  const players = [...room.players.values()]
  for (const p of players) p.team = undefined
  if (room.config.mode === 'goliath') {
    const maxHp = Math.max(1, players.length) * room.questions.length * GOLIATH_HP_PER_PLAYER_QUESTION
    room.goliath = { hp: maxHp, maxHp, lastHit: 0, lastStones: 0, lastSlingers: [], fallen: false }
  } else if (room.config.mode === 'wall') {
    const n = players.length < 8 ? 2 : players.length < 15 ? 3 : 4
    room.teams = GATES.slice(0, n).map((name, id) => ({ id, name, stones: 0, lastGain: 0, members: 0 }))
    shuffled(players).forEach((p, i) => (p.team = i % n))
    countMembers(room)
  }
}

/** A player joining mid-game goes to the smallest team. */
export function assignLateJoiner(room: Room, player: RoomPlayer): void {
  if (!room.teams || player.team !== undefined) return
  countMembers(room)
  player.team = [...room.teams].sort((a, b) => a.members - b.members || a.id - b.id)[0].id
  countMembers(room)
}

/** After a question's scores are applied: hit the giant / raise the walls. */
export function applyModeRound(room: Room): void {
  const players = [...room.players.values()]
  const g = room.goliath
  if (g) {
    const hitters = players.filter((p) => p.lastGain > 0).sort((a, b) => b.lastGain - a.lastGain)
    const hit = hitters.reduce((n, p) => n + p.lastGain, 0)
    g.lastHit = Math.min(g.hp, hit)
    g.hp = Math.max(0, g.hp - hit)
    g.lastStones = hitters.length
    g.lastSlingers = hitters.slice(0, 3).map((p) => p.id)
    g.fallen = g.hp === 0
  }
  if (room.teams) {
    for (const t of room.teams) {
      const members = players.filter((p) => p.team === t.id)
      const stones = members.length ? Math.round(members.reduce((n, p) => n + p.score, 0) / members.length / 100) : 0
      t.lastGain = Math.max(0, stones - t.stones)
      t.stones = stones
      t.members = members.length
    }
  }
}

/** The giant fell before the last question: straight to the finale. */
export const endsEarly = (room: Room): boolean => room.goliath?.fallen === true

/** Finishing coins: placement in classic, the shared result in the team modes. */
export function finalBonus(room: Room, player: RoomPlayer, rank: number): number {
  if (room.goliath) return room.goliath.fallen ? TEAM_WIN_COINS : TEAM_LOSS_COINS
  if (room.teams) {
    const best = Math.max(...room.teams.map((t) => t.stones))
    const mine = room.teams.find((t) => t.id === player.team)
    return mine && mine.stones === best ? TEAM_WIN_COINS : TEAM_LOSS_COINS
  }
  return coinsForPlacement(rank, 'arena')
}
