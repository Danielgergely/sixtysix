import { randomUUID } from 'node:crypto'
import type { ArenaIntro, ArenaPhase, ArenaPlayer, GoliathState, LeaderboardEntry, Question, RevealPayload, RoomConfig, RoomState, TeamState } from '@sixtysix/shared'
import { MAX_ARENA_PLAYERS, cleanLook, isNameAllowed, levelForXp } from '@sixtysix/shared'

export const NAME_REFUSED = 'Please choose another name.'
export const KICKED = 'The host removed you from this game.'

/** Keyed in Room.players by the SECRET device id; `id` is the public id. */
export interface RoomPlayer extends ArenaPlayer {
  socketId: string
  /** Current-question answer; cleared between questions. */
  answer?: { index: number; ms: number }
  /** Consecutive correct answers. */
  streak: number
  /** Points from the most recent question. */
  lastGain: number
  /** Coins earned this game (paid out at the podium, so leavers forfeit them). */
  coins: number
  /** Profile XP as sent on join (cleanXp); only the level is public. */
  xp: number
}

export interface Room {
  code: string
  config: RoomConfig
  phase: ArenaPhase
  /** Stable host identity (device UUID) — survives reconnects. */
  hostId: string
  hostSocketId: string | null
  /** Device ids the host removed: they can't come back to this room. */
  banned: Set<string>
  players: Map<string, RoomPlayer>
  questions: Question[]
  questionIndex: number
  questionStartedAt: number
  /** The start intro (phase 'intro'): who it shows and when it began, for a rejoin mid-intro. */
  intro?: ArenaIntro
  introStartedAt: number
  /** Last leaderboard/podium payload, re-sent to anyone (re)joining mid-phase. */
  lastEntries: LeaderboardEntry[]
  /** Current question's reveal, re-sent to anyone (re)joining during the reveal. */
  lastReveal?: RevealPayload
  /** Previous leaderboard ranks, for delta arrows. */
  prevRanks: Map<string, number>
  /** Single pending phase timer for this room. */
  timer?: ReturnType<typeof setTimeout>
  /** Pending room-close timer while the host is disconnected. */
  hostGraceTimer?: ReturnType<typeof setTimeout>
  lastActivity: number
  /** 1 for the first game; "Play again" increments it. */
  game: number
  /** Question count the host asked for (config.questionCount becomes the number drawn). */
  requestedCount: number
  /** Mode state (see modes.ts); undefined in classic games. */
  goliath?: GoliathState
  teams?: TeamState[]
  /** Wall mode: teams whose team voice changed, and the throttle timer (modes.ts). */
  teamVotesDirty: Set<number>
  teamVotesTimer?: ReturnType<typeof setTimeout>
}

const rooms = new Map<string, Room>()

// No 0/O/1/I — codes are read aloud and typed on phones.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000 // GC rooms idle for 2h

function generateCode(): string {
  let code: string
  do {
    code = Array.from(
      { length: CODE_LENGTH },
      () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
    ).join('')
  } while (rooms.has(code))
  return code
}

export function createRoom(config: RoomConfig, hostId: string, hostSocketId: string): Room {
  const room: Room = {
    code: generateCode(),
    config,
    phase: 'lobby',
    hostId,
    hostSocketId,
    banned: new Set(),
    players: new Map(),
    questions: [],
    questionIndex: 0,
    questionStartedAt: 0,
    introStartedAt: 0,
    prevRanks: new Map(),
    lastEntries: [],
    lastActivity: Date.now(),
    game: 1,
    requestedCount: config.questionCount,
    teamVotesDirty: new Set(),
  }
  rooms.set(room.code, room)
  return room
}

export function getRoom(code: unknown): Room | undefined {
  return typeof code === 'string' ? rooms.get(code.trim().toUpperCase()) : undefined
}

export function deleteRoom(code: string): void {
  const room = rooms.get(code)
  if (room) {
    clearTimeout(room.timer)
    clearTimeout(room.hostGraceTimer)
    clearTimeout(room.teamVotesTimer)
  }
  rooms.delete(code)
}

export function touch(room: Room): void {
  room.lastActivity = Date.now()
}

/** NFC, strip control/format chars (keep ZWJ for emoji), cut by code point. */
export function cleanName(name: unknown): string {
  if (typeof name !== 'string') return 'Player'
  const cleaned = name.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\u200d' ? c : '')).trim()
  return Array.from(cleaned).slice(0, 14).join('') || 'Player'
}

/** A look string (shared/src/looks.ts): old character ids stay valid, unknown parts become the default. Worn items are trusted here (family game). */
export const cleanAvatar = (avatar: unknown): string => cleanLook(avatar)

/** Profile XP from a client: a whole number from 0 up to a sane cap; anything else counts as none. Trusted otherwise (family game). */
export function cleanXp(xp: unknown): number {
  const n = typeof xp === 'number' && Number.isFinite(xp) ? Math.floor(xp) : 0
  return Math.min(100_000_000, Math.max(0, n))
}

/** Add a new player, or rebind an existing one (reconnection). */
export function addOrRebindPlayer(
  room: Room,
  playerId: string,
  socketId: string,
  name: unknown,
  avatar: unknown,
  xp?: unknown,
): { player: RoomPlayer; rejoined: boolean } | { error: string } {
  if (room.banned.has(playerId)) return { error: KICKED }
  if (typeof name === 'string' && name.trim() && !isNameAllowed(name)) return { error: NAME_REFUSED }
  const existing = room.players.get(playerId)
  if (existing) {
    existing.socketId = socketId
    existing.connected = true
    if (typeof name === 'string' && name.trim()) existing.name = cleanName(name)
    if (avatar !== undefined) existing.avatar = cleanAvatar(avatar)
    if (xp !== undefined) {
      existing.xp = cleanXp(xp)
      existing.level = levelForXp(existing.xp)
    }
    touch(room)
    return { player: existing, rejoined: true }
  }
  if (room.players.size >= MAX_ARENA_PLAYERS) return { error: 'Room is full' }
  if (room.phase === 'podium') return { error: 'This game has ended' }
  const player: RoomPlayer = {
    id: randomUUID(),
    socketId,
    name: cleanName(name),
    avatar: cleanAvatar(avatar),
    score: 0,
    connected: true,
    streak: 0,
    lastGain: 0,
    coins: 0,
    xp: cleanXp(xp),
    level: 1,
  }
  player.level = levelForXp(player.xp)
  room.players.set(playerId, player) // late joiners enter at the next question
  touch(room)
  return { player, rejoined: false }
}

export function toPublicState(room: Room): RoomState {
  return {
    code: room.code,
    config: room.config,
    phase: room.phase,
    players: [...room.players.values()].map(({ id, name, avatar, score, connected, team, level }) => ({
      id,
      name,
      avatar,
      score,
      connected,
      team,
      level,
    })),
    hostConnected: room.hostSocketId !== null,
    questionIndex: room.questionIndex,
    questionTotal: room.config.questionCount,
    game: room.game,
    goliath: room.goliath,
    teams: room.teams,
  }
}

export function findRoomBySocket(socketId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.hostSocketId === socketId) return room
    for (const p of room.players.values()) if (p.socketId === socketId) return room
  }
  return undefined
}

/** Periodic cleanup of abandoned rooms. */
export function startRoomGC(onClose: (room: Room) => void): void {
  setInterval(() => {
    const now = Date.now()
    for (const room of rooms.values()) {
      if (now - room.lastActivity > ROOM_IDLE_MS) {
        onClose(room)
        deleteRoom(room.code)
      }
    }
  }, 60_000).unref()
}

export function roomCount(): number {
  return rooms.size
}
