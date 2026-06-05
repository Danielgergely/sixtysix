import type { ArenaPhase, ArenaPlayer, Question, RoomConfig, RoomState } from '@sixtysix/shared'
import { MAX_ARENA_PLAYERS } from '@sixtysix/shared'

export interface RoomPlayer extends ArenaPlayer {
  socketId: string
  /** Current-question answer; cleared between questions. */
  answer?: { index: number; ms: number }
}

export interface Room {
  code: string
  config: RoomConfig
  phase: ArenaPhase
  /** Stable host identity (device UUID) — survives reconnects. */
  hostId: string
  hostSocketId: string | null
  players: Map<string, RoomPlayer>
  questions: Question[]
  questionIndex: number
  questionStartedAt: number
  /** Previous leaderboard ranks, for delta arrows. */
  prevRanks: Map<string, number>
  /** Single pending phase timer for this room. */
  timer?: ReturnType<typeof setTimeout>
  /** Pending room-close timer while the host is disconnected. */
  hostGraceTimer?: ReturnType<typeof setTimeout>
  lastActivity: number
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
    players: new Map(),
    questions: [],
    questionIndex: 0,
    questionStartedAt: 0,
    prevRanks: new Map(),
    lastActivity: Date.now(),
  }
  rooms.set(room.code, room)
  return room
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase())
}

export function deleteRoom(code: string): void {
  const room = rooms.get(code)
  if (room) {
    clearTimeout(room.timer)
    clearTimeout(room.hostGraceTimer)
  }
  rooms.delete(code)
}

export function touch(room: Room): void {
  room.lastActivity = Date.now()
}

const cleanName = (name: string) => name.trim().slice(0, 14) || 'Player'

/** Add a new player, or rebind an existing one (reconnection). */
export function addOrRebindPlayer(
  room: Room,
  playerId: string,
  socketId: string,
  name: string,
  avatar: string,
): { player: RoomPlayer; rejoined: boolean } | { error: string } {
  const existing = room.players.get(playerId)
  if (existing) {
    existing.socketId = socketId
    existing.connected = true
    existing.name = cleanName(name || existing.name)
    existing.avatar = avatar || existing.avatar
    touch(room)
    return { player: existing, rejoined: true }
  }
  if (room.players.size >= MAX_ARENA_PLAYERS) return { error: 'Room is full' }
  if (room.phase === 'podium') return { error: 'This game has ended' }
  const player: RoomPlayer = {
    id: playerId,
    socketId,
    name: cleanName(name),
    avatar,
    score: 0,
    connected: true,
  }
  room.players.set(player.id, player) // late joiners enter at the next question
  touch(room)
  return { player, rejoined: false }
}

export function toPublicState(room: Room): RoomState {
  return {
    code: room.code,
    config: room.config,
    phase: room.phase,
    players: [...room.players.values()].map(({ id, name, avatar, score, connected }) => ({
      id,
      name,
      avatar,
      score,
      connected,
    })),
    hostConnected: room.hostSocketId !== null,
    questionIndex: room.questionIndex,
    questionTotal: room.config.questionCount,
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
