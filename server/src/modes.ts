import { TEAM_LOSS_COINS, TEAM_WIN_COINS, coinsForPlacement } from '@sixtysix/shared'
import type { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents, TeamState, TeamVotes } from '@sixtysix/shared'
import { shuffle } from './bank.js'
import type { Room, RoomPlayer } from './rooms.js'

type IO = Server<ClientToServerEvents, ServerToClientEvents>

/**
 * Arena game modes on top of the shared question loop (see RoomConfig.mode):
 * - goliath: the room's points are damage against one giant; he falls at 0 HP
 *   and the game ends early (victory for everyone).
 * - wall: players are split into gate teams (Neh 3) already in the lobby; a
 *   team's wall height is its AVERAGE score, so uneven teams stay fair. While
 *   answering, each team hears its own "team voice" (queueTeamVotes below).
 */

/** The gates of Nehemiah 3, one per team. */
export const GATES = ['Sheep Gate', 'Fish Gate', 'Valley Gate', 'Fountain Gate']
/**
 * Giant's health per player per question, in points. A correct answer scores
 * 500–1000, so ~45 % right at average speed brings him down on the last question.
 */
const GOLIATH_HP_PER_PLAYER_QUESTION = 330

function countMembers(room: Room): void {
  if (!room.teams) return
  for (const t of room.teams) t.members = [...room.players.values()].filter((p) => p.team === t.id).length
}

const teamCount = (players: number): number => (players < 8 ? 2 : players < 15 ? 3 : 4)

/**
 * Wall mode, lobby: keep everyone's team where possible and balance the sizes
 * (they differ by at most one). New players go to the smallest team; when the
 * room grows past 8 / 15 players a gate is added, and the last joiners of the
 * biggest teams move over. Any other mode clears the teams.
 */
export function formTeams(room: Room, reshuffle = false): void {
  const players = [...room.players.values()]
  if (room.config.mode !== 'wall') {
    room.teams = undefined
    for (const p of players) p.team = undefined
    return
  }
  const n = teamCount(players.length)
  const teams: TeamState[] = GATES.slice(0, n).map((name, id) => ({ id, name, stones: 0, lastGain: 0, members: 0 }))
  room.teams = teams
  if (reshuffle) shuffle([...players]).forEach((p, i) => (p.team = i % n))
  const size = (id: number) => players.filter((p) => p.team === id).length
  const bySize = () => teams.map((t) => t.id).sort((a, b) => size(a) - size(b) || a - b)
  for (const p of players) if (p.team !== undefined && p.team >= n) p.team = undefined
  for (const p of players) if (p.team === undefined) p.team = bySize()[0]
  for (;;) {
    const ids = bySize()
    const small = ids[0]
    const big = ids[ids.length - 1]
    if (size(big) - size(small) <= 1) break
    const mover = players.filter((p) => p.team === big).at(-1)!
    mover.team = small
  }
  countMembers(room)
}

/** Called once the questions are drawn, before the first question. */
export function setupMode(room: Room): void {
  room.goliath = undefined
  formTeams(room) // wall: the lobby's teams with fresh walls; other modes: no teams
  if (room.config.mode === 'goliath') {
    const maxHp = Math.max(1, room.players.size) * room.questions.length * GOLIATH_HP_PER_PLAYER_QUESTION
    room.goliath = { hp: maxHp, maxHp, lastHit: 0, lastStones: 0, lastSlingers: [], fallen: false }
  }
}

/** Lobby: (re)balance the teams. A player joining mid-game goes to the smallest team. */
export function assignLateJoiner(room: Room, player: RoomPlayer): void {
  if (room.phase === 'lobby') return formTeams(room)
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

/**
 * Team voice: each team sees how its own members have answered so far, live.
 * Only that team's sockets get it (never other teams' picks, never the answer),
 * at most every TEAM_VOTES_MS: the first change goes out at once, later ones
 * are batched.
 */
const TEAM_VOTES_MS = 250

/** What `viewer` hears: their teammates' answers so far, their own left out. */
export function teamVotesFor(room: Room, viewer: RoomPlayer): TeamVotes {
  const counts: [number, number, number, number] = [0, 0, 0, 0]
  for (const p of room.players.values()) {
    if (p !== viewer && p.team === viewer.team && p.answer) counts[p.answer.index as 0 | 1 | 2 | 3]++
  }
  return { questionIndex: room.questionIndex, counts, answered: counts[0] + counts[1] + counts[2] + counts[3] }
}

function flushTeamVotes(io: IO, room: Room): void {
  const dirty = [...room.teamVotesDirty]
  room.teamVotesDirty.clear()
  if (room.phase !== 'question') return
  for (const p of room.players.values()) {
    if (p.team !== undefined && p.connected && dirty.includes(p.team)) io.to(p.socketId).emit('game:teamVotes', teamVotesFor(room, p))
  }
}

export function queueTeamVotes(io: IO, room: Room, team: number | undefined): void {
  if (!room.teams || team === undefined) return
  room.teamVotesDirty.add(team)
  if (room.teamVotesTimer) return
  flushTeamVotes(io, room)
  const tick = () => {
    room.teamVotesTimer = undefined
    if (room.teamVotesDirty.size === 0) return
    flushTeamVotes(io, room)
    room.teamVotesTimer = setTimeout(tick, TEAM_VOTES_MS)
  }
  room.teamVotesTimer = setTimeout(tick, TEAM_VOTES_MS)
}
