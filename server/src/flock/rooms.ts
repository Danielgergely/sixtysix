import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FlockCategory, FlockClue, FlockOut, FlockPhase, FlockResult, FlockState } from '@sixtysix/shared'
import { FLOCK_CATEGORIES } from '@sixtysix/shared'

/**
 * Wolf in the Flock rooms: an in-memory registry with its own codes and GC,
 * separate from the arena's (rooms.ts) so the two games never interact.
 */

export interface FlockWord {
  word: string
  hint: string
  ref: string
  /** Shown to a wolf who has to give the first clue: associated, never the word. */
  wolfHint: string
}

export const WORDS: Record<FlockCategory, FlockWord[]> = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'words.json'), 'utf8'),
)
for (const c of FLOCK_CATEGORIES) {
  if (!WORDS[c]?.length) throw new Error(`[flock] no words for ${c}`)
  for (const w of WORDS[c]) if (!w.wolfHint) throw new Error(`[flock] no wolfHint for ${w.word}`)
}

export interface FPlayer {
  id: string
  name: string
  avatar: string
  wins: number
  connected: boolean
  socketId: string | null
}

export interface FRoom {
  code: string
  phase: FlockPhase
  /** Keyed by the SECRET device id; `id` inside is the public id. */
  players: Map<string, FPlayer>
  leaderSecret: string | null
  /** Games started in this room (rewards are paid once per game). */
  game: number
  category: FlockCategory | null
  word: FlockWord | null
  /** This game's wolves (secrets), out or not. */
  wolves: string[]
  /** Players dealt into this game (late joiners wait for the next one). */
  dealt: Set<string>
  /** Voted out / guessed wrong this game. */
  out: Set<string>
  /** Clue order (secrets); the turn index walks it lap after lap. */
  turnOrder: string[]
  turnIdx: number
  /** Current clue lap (1-based); a lap is one pass over turnOrder. */
  lap: number
  clues: FlockClue[]
  /** 'secret': who has looked; 'decide': choice per player; 'vote': who has voted. */
  done: Set<string>
  decide: Map<string, boolean>
  /** voter secret → target public id */
  votes: Map<string, string>
  finalVote: boolean
  guessOptions: string[]
  lastOut: FlockOut | null
  result: FlockResult | null
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
    game: 0,
    category: null,
    word: null,
    wolves: [],
    dealt: new Set(),
    out: new Set(),
    turnOrder: [],
    turnIdx: 0,
    lap: 1,
    clues: [],
    done: new Set(),
    decide: new Map(),
    votes: new Map(),
    finalVote: false,
    guessOptions: [],
    lastOut: null,
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
  const ids = (secrets: Iterable<string>) => [...secrets].map(pub).filter((x): x is string => x !== null)
  return {
    code: room.code,
    phase: room.phase,
    players: [...room.players.entries()].map(([secret, p]) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      wins: p.wins,
      connected: p.connected,
      playing: room.phase !== 'lobby' && room.dealt.has(secret),
      out: room.phase !== 'lobby' && room.out.has(secret),
      done: room.done.has(secret),
    })),
    leaderId: pub(room.leaderSecret),
    game: room.game,
    lap: room.lap,
    category: room.category,
    wolfCount: room.wolves.length,
    wolvesLeft: room.wolves.filter((s) => !room.out.has(s) && room.players.has(s)).length,
    // Left players drop out of the public order; their clues stay.
    turnOrder: ids(room.turnOrder),
    turnPlayerId: pub(turnSecret),
    clues: room.clues,
    decide:
      room.phase === 'decide'
        ? { vote: ids([...room.decide].filter(([, v]) => v).map(([s]) => s)), more: ids([...room.decide].filter(([, v]) => !v).map(([s]) => s)) }
        : null,
    finalVote: room.finalVote,
    endsInMs: room.phaseEndsAt ? Math.max(0, room.phaseEndsAt - Date.now()) : 0,
    phaseMs: room.phaseMs,
    lastOut: room.phase === 'out' ? room.lastOut : null,
    result: room.phase === 'over' ? room.result : null,
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
