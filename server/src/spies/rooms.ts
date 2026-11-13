import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GameLocale, SpiesColour, SpiesMode, SpiesPhase, SpiesResult, SpiesState, SpiesTeam, SpiesTurn, SpiesVacancy } from '@sixtysix/shared'
import { GAME_LOCALES, SPIES_FORCE_MS, SPIES_GRID, SPIES_SM_WAIT_MS, SPIES_TEAMS } from '@sixtysix/shared'

/**
 * Twelve Spies rooms: an in-memory registry with its own codes and GC,
 * separate from the arena's and the flock's so the games never interact.
 */

const here = dirname(fileURLToPath(import.meta.url))
/** The English words: the ids of the cards. */
export const WORDS: string[] = JSON.parse(readFileSync(join(here, 'words.json'), 'utf8'))
if (WORDS.length < SPIES_GRID * 3) throw new Error('[spies] not enough words')
/** Each card in every language (words.<lang>.json maps the English word to its translation). */
export const TRANSLATIONS: Record<string, Record<GameLocale, string>> = (() => {
  const maps = Object.fromEntries(
    GAME_LOCALES.filter((l) => l !== 'en').map((l) => [l, JSON.parse(readFileSync(join(here, `words.${l}.json`), 'utf8')) as Record<string, string>]),
  )
  const out: Record<string, Record<GameLocale, string>> = {}
  for (const w of WORDS) {
    out[w] = { en: w } as Record<GameLocale, string>
    for (const l of GAME_LOCALES) {
      if (l === 'en') continue
      const t = maps[l][w]
      if (typeof t !== 'string' || !t.trim()) throw new Error(`[spies] no ${l} word for "${w}"`)
      out[w][l] = t
    }
  }
  return out
})()
/** A card's word in a language. */
export const wordIn = (word: string, locale: GameLocale): string => TRANSLATIONS[word]?.[locale] ?? word

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
  /** The player's app language: the grid is dealt and clues are checked for every language seated. */
  locale: GameLocale
}

export interface SProposal {
  pick: number
  proposer: string
  backers: Set<string>
  at: number
}

/** A tribe waiting for a spy master (see SpiesVacancy). */
export interface SVacancy {
  /** The missing spy master's device id (null once they left for good). */
  secret: string | null
  name: string
  avatar: string
  left: boolean
  /** Date.now() when the wait for their return ends (0 = over / left). */
  until: number
}

export interface SRoom {
  code: string
  phase: SpiesPhase
  mode: SpiesMode
  /** Keyed by the SECRET device id; `id` inside is the public id. */
  /** Device ids the leader removed: they can't come back to this room. */
  banned: Set<string>
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
  /** What the turn timer does when it runs out (kept so a pause can resume it). */
  timerFn?: () => void
  /** Turn time left while the turn is paused (a tribe without its spy master); null = not paused. */
  frozenMs: number | null
  /** Tribes whose spy master is offline or gone mid-game; nobody is promoted automatically. */
  vacancies: Partial<Record<SpiesTeam, SVacancy>>
  /** Per tribe: ends the wait for an offline spy master (the choices stay offered after it). */
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
    banned: new Set(),
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
    frozenMs: null,
    vacancies: {},
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

/** Every language seated in the room (English first when present). */
export function roomLocales(room: SRoom): GameLocale[] {
  const present = new Set([...room.players.values()].map((p) => p.locale))
  const out = GAME_LOCALES.filter((l) => present.has(l))
  return out.length ? out : ['en']
}

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
    cards: room.words.map((word, i) => ({ word, words: TRANSLATIONS[word] ?? { en: word, de: word, hu: word }, revealed: room.revealed[i] ?? null })),
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
    vacancies: Object.fromEntries(
      SPIES_TEAMS.flatMap((t) => {
        const v = room.vacancies[t]
        if (!v || (room.phase !== 'clue' && room.phase !== 'guess')) return []
        const pv: SpiesVacancy = {
          playerId: pub(v.secret),
          name: v.name,
          avatar: v.avatar,
          left: v.left,
          waitInMs: v.until ? Math.max(0, v.until - Date.now()) : 0,
          waitMs: SPIES_SM_WAIT_MS,
        }
        return [[t, pv]]
      }),
    ),
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
