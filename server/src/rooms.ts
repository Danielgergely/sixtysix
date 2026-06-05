import type { ArenaPhase, ArenaPlayer, RoomConfig, RoomState } from '@sixtysix/shared'
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
  hostSocketId: string | null
  players: Map<string, RoomPlayer>
  questionIndex: number
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

export function createRoom(config: RoomConfig, hostSocketId: string): Room {
  const room: Room = {
    code: generateCode(),
    config,
    phase: 'lobby',
    hostSocketId,
    players: new Map(),
    questionIndex: 0,
    lastActivity: Date.now(),
  }
  rooms.set(room.code, room)
  return room
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase())
}

export function deleteRoom(code: string): void {
  rooms.delete(code)
}

export function touch(room: Room): void {
  room.lastActivity = Date.now()
}

export function addPlayer(
  room: Room,
  socketId: string,
  name: string,
  avatar: string,
): RoomPlayer | { error: string } {
  if (room.players.size >= MAX_ARENA_PLAYERS) return { error: 'Room is full' }
  if (room.phase !== 'lobby') return { error: 'Game already started' }
  const cleanName = name.trim().slice(0, 14) || 'Player'
  const player: RoomPlayer = {
    id: socketId, // reconnection tokens come later
    socketId,
    name: cleanName,
    avatar,
    score: 0,
    connected: true,
  }
  room.players.set(player.id, player)
  touch(room)
  return player
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
        rooms.delete(room.code)
      }
    }
  }, 60_000).unref()
}

export function roomCount(): number {
  return rooms.size
}
