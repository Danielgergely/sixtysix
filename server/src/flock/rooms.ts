import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FlockCategory, FlockClue, FlockPhase, FlockRoundResult, FlockState } from '@sixtysix/shared'
import { FLOCK_CATEGORIES } from '@sixtysix/shared'

/**
 * Wolf in the Flock rooms: an in-memory registry with its own codes and GC,
 * separate from the arena's (rooms.ts) so the two games never interact.
 */

export interface FlockWord {
  word: string
  hint: string
  ref: string
}

export const WORDS: Record<FlockCategory, FlockWord[]> = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'words.json'), 'utf8'),
)
for (const c of FLOCK_CATEGORIES) if (!WORDS[c]?.length) throw new Error(`[flock] no words for ${c}`)

export interface FPlayer {
  id: string
  name: string
  avatar: string
  score: number
  connected: boolean
  socketId: string | null
}

export interface FRoom {
  code: string
  phase: FlockPhase
  /** Keyed by the SECRET device id; `id` inside is the public id. */
  players: Map<string, FPlayer>
  leaderSecret: string | null
  totalRounds: number
  clueLaps: number
  round: number
  category: FlockCategory | null
  word: FlockWord | null
  wolfSecret: string | null
  /** Players dealt a card this round (late joiners wait for the next one). */
  dealt: Set<string>
  /** Clue order (secrets); a turn index walks it clueLaps times. */
  turnOrder: string[]
  turnIdx: number
  clues: FlockClue[]
  /** 'secret': who has looked; 'vote': who has voted. */
  done: Set<string>
  /** voter secret → target public id */
  votes: Map<string, string>
  accusedId: string | null
  guessOptions: string[]
  result: FlockRoundResult | null
  usedWords: Set<string>
  phaseEndsAt: number
  phaseMs: number
  timer?: ReturnType<typeof setTimeout>
  lastActivity: number
}

const rooms = new Map<string, FRoom>()
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 5
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000
const EMPTY_ROOM_MS = 10 * 60 * 1000

/** socket.io channel; prefixed so it can never collide with an arena room code. */
export const channel = (room: FRoom): string => `flock:${room.code}`

function generateCode(): string {
  let code: string
  do {
    code = Array.from({ length: CODE_LENGTH }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
  } while (rooms.has(code))
  return code
}

export function createFlockRoom(): FRoom {
  const room: FRoom = {
    code: generateCode(),
    phase: 'lobby',
    players: new Map(),
    leaderSecret: null,
    totalRounds: 5,
    clueLaps: 2,
    round: 0,
    category: null,
    word: null,
    wolfSecret: null,
    dealt: new Set(),
    turnOrder: [],
    turnIdx: 0,
    clues: [],
    done: new Set(),
    votes: new Map(),
    accusedId: null,
    guessOptions: [],
    result: null,
    usedWords: new Set(),
    phaseEndsAt: 0,
    phaseMs: 0,
    lastActivity: Date.now(),
  }
  rooms.set(room.code, room)
  return room
}

export function getFlockRoom(code: unknown): FRoom | undefined {
  return typeof code === 'string' ? rooms.get(code.trim().toUpperCase()) : undefined
}

export function deleteFlockRoom(room: FRoom): void {
  clearTimeout(room.timer)
  rooms.delete(room.code)
}

export function findFlockRoomBySocket(socketId: string): { room: FRoom; secret: string | null } | undefined {
  for (const room of rooms.values()) {
    for (const [secret, p] of room.players) if (p.socketId === socketId) return { room, secret }
  }
  return undefined
}

export const touch = (room: FRoom): void => {
  room.lastActivity = Date.now()
}

export const newPlayerId = (): string => randomUUID()

export function toFlockState(room: FRoom): FlockState {
  const turnSecret =
    room.phase === 'clues' && room.turnOrder.length ? room.turnOrder[room.turnIdx % room.turnOrder.length] : null
  const pub = (secret: string | null) => (secret && room.players.get(secret)?.id) || null
  return {
    code: room.code,
    phase: room.phase,
    players: [...room.players.entries()].map(([secret, p]) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      connected: p.connected,
      done: room.done.has(secret),
    })),
    leaderId: pub(room.leaderSecret),
    round: room.round,
    totalRounds: room.totalRounds,
    clueLaps: room.clueLaps,
    category: room.category,
    // Left players drop out of the public order; their skipped clues stay.
    turnOrder: room.turnOrder.map(pub).filter((x): x is string => x !== null),
    turnPlayerId: pub(turnSecret),
    clues: room.clues,
    endsInMs: room.phaseEndsAt ? Math.max(0, room.phaseEndsAt - Date.now()) : 0,
    phaseMs: room.phaseMs,
    result: room.phase === 'result' || room.phase === 'final' ? room.result : null,
    accusedId: room.phase === 'guess' ? room.accusedId : null,
  }
}

export function startFlockGC(onClose: (room: FRoom) => void): void {
  setInterval(() => {
    const now = Date.now()
    for (const room of rooms.values()) {
      // Nobody connected (e.g. created and abandoned): gone after 10 minutes.
      const empty = ![...room.players.values()].some((p) => p.connected)
      if (now - room.lastActivity > (empty ? EMPTY_ROOM_MS : ROOM_IDLE_MS)) {
        onClose(room)
        deleteFlockRoom(room)
      }
    }
  }, 60_000).unref()
}

export const flockRoomCount = (): number => rooms.size
