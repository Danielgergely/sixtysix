import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SpiesColour, SpiesMode, SpiesPhase, SpiesResult, SpiesState, SpiesTeam, SpiesTurn } from '@sixtysix/shared'
import { SPIES_FORCE_MS, SPIES_GRID } from '@sixtysix/shared'

/**
 * Twelve Spies rooms: an in-memory registry with its own codes and GC,
 * separate from the arena's and the flock's so the games never interact.
 */

export const WORDS: string[] = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'words.json'), 'utf8'))
if (WORDS.length < SPIES_GRID * 3) throw new Error('[spies] not enough words')

export interface SPlayer {
  id: string
  name: string
  avatar: string
  team: SpiesTeam
  connected: boolean
  socketId: string | null
  wins: number
  /** Games served as spy master — the least-served teammate is picked next. */
  served: number
  /** Game number this player last served as spy master (0 = never). */
  lastServed: number
  /** Join order (ties when picking spy masters, colour of the token ring). */
  seq: number
}

export interface SProposal {
  pick: number
  proposer: string
  backers: Set<string>
  at: number
}

export interface SRoom {
  code: string
  phase: SpiesPhase
  mode: SpiesMode
  /** Keyed by the SECRET device id; `id` inside is the public id. */
  players: Map<string, SPlayer>
  leaderSecret: string | null
  spymasters: Record<SpiesTeam, string | null>
  turnSeconds: number
  game: number
  startingTeam: SpiesTeam | null
  turn: SpiesTeam | null
  words: string[]
  /** THE SECRET: never in public state before 'over'. */
  key: SpiesColour[]
  revealed: (SpiesColour | null)[]
  clue: { team: SpiesTeam; word: string; number: number } | null
  guessesLeft: number
  guessesMade: number
  proposal: SProposal | null
  history: SpiesTurn[]
  result: SpiesResult | null
  usedWords: Set<string>
  seq: number
  phaseEndsAt: number
  phaseMs: number
  timer?: ReturnType<typeof setTimeout>
  /** Grace timers for an offline spy master before a teammate takes over. */
  smTimers: Partial<Record<SpiesTeam, ReturnType<typeof setTimeout>>>
  lastActivity: number
}

const rooms = new Map<string, SRoom>()
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 5
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000

/** socket.io channel; prefixed so it can never collide with another game's room code. */
export const channel = (room: SRoom): string => `spies:${room.code}`

function generateCode(): string {
  let code: string
  do {
    code = Array.from({ length: CODE_LENGTH }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
  } while (rooms.has(code))
  return code
}

export function createSpiesRoom(): SRoom {
  const room: SRoom = {
    code: generateCode(),
    phase: 'lobby',
    mode: 'versus',
    players: new Map(),
    leaderSecret: null,
    spymasters: { judah: null, ephraim: null },
    turnSeconds: 0,
    game: 0,
    startingTeam: null,
    turn: null,
    words: [],
    key: [],
    revealed: [],
    clue: null,
    guessesLeft: 0,
    guessesMade: 0,
    proposal: null,
    history: [],
    result: null,
    usedWords: new Set(),
    seq: 0,
    phaseEndsAt: 0,
    phaseMs: 0,
    smTimers: {},
    lastActivity: Date.now(),
  }
  rooms.set(room.code, room)
  return room
}

export function getSpiesRoom(code: unknown): SRoom | undefined {
  return typeof code === 'string' ? rooms.get(code.trim().toUpperCase()) : undefined
}

export function deleteSpiesRoom(room: SRoom): void {
  clearTimeout(room.timer)
  for (const t of Object.values(room.smTimers)) clearTimeout(t)
  rooms.delete(room.code)
}

export function findSpiesRoomBySocket(socketId: string): { room: SRoom; secret: string } | undefined {
  for (const room of rooms.values()) {
    for (const [secret, p] of room.players) if (p.socketId === socketId) return { room, secret }
  }
  return undefined
}

export const touch = (room: SRoom): void => {
  room.lastActivity = Date.now()
}

export const newPlayerId = (): string => randomUUID()

/** Field agents of a tribe (everyone but its spy master). */
export function agents(room: SRoom, team: SpiesTeam, connectedOnly = true): string[] {
  return [...room.players]
    .filter(([s, p]) => p.team === team && room.spymasters[team] !== s && (!connectedOnly || p.connected))
    .map(([s]) => s)
}

/** Backers needed for a reveal: a majority of the tribe's connected agents. */
export const backersNeeded = (room: SRoom, team: SpiesTeam): number => Math.floor(agents(room, team).length / 2) + 1

export const remaining = (room: SRoom, team: SpiesTeam): number =>
  room.key.reduce((n, c, i) => n + (c === team && !room.revealed[i] ? 1 : 0), 0)

export function toSpiesState(room: SRoom): SpiesState {
  const pub = (secret: string | null) => (secret && room.players.get(secret)?.id) || null
  const over = room.phase === 'over'
  const prop = room.proposal
  return {
    code: room.code,
    phase: room.phase,
    mode: room.mode,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      team: p.team,
      connected: p.connected,
      wins: p.wins,
    })),
    leaderId: pub(room.leaderSecret),
    spymasters: { judah: pub(room.spymasters.judah), ephraim: pub(room.spymasters.ephraim) },
    turnSeconds: room.turnSeconds,
    game: room.game,
    startingTeam: room.startingTeam,
    turn: room.phase === 'clue' || room.phase === 'guess' ? room.turn : null,
    // Only revealed colours — the key itself stays on the server until the end.
    cards: room.words.map((word, i) => ({ word, revealed: room.revealed[i] ?? null })),
    remaining: { judah: remaining(room, 'judah'), ephraim: remaining(room, 'ephraim') },
    clue: room.phase === 'guess' ? room.clue : null,
    guessesLeft: room.phase === 'guess' ? room.guessesLeft : 0,
    proposal:
      prop && room.phase === 'guess' && room.turn
        ? {
            pick: prop.pick,
            proposerId: pub(prop.proposer) ?? '',
            backers: [...prop.backers].map(pub).filter((x): x is string => x !== null),
            needed: backersNeeded(room, room.turn),
            forceInMs: Math.max(0, prop.at + SPIES_FORCE_MS - Date.now()),
          }
        : null,
    history: room.history,
    endsInMs: room.phaseEndsAt ? Math.max(0, room.phaseEndsAt - Date.now()) : 0,
    phaseMs: room.phaseMs,
    result: over ? room.result : null,
  }
}

export function startSpiesGC(onClose: (room: SRoom) => void): void {
  setInterval(() => {
    const now = Date.now()
    for (const room of rooms.values()) {
      if (now - room.lastActivity > ROOM_IDLE_MS) {
        onClose(room)
        deleteSpiesRoom(room)
      }
    }
  }, 60_000).unref()
}

export const spiesRoomCount = (): number => rooms.size
