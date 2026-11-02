import { randomUUID } from 'node:crypto'
import type {
  GameLocale,
  MissionAttack,
  MissionBotLevel,
  MissionOptions,
  MissionPhase,
  MissionQuestion,
  MissionResult,
  MissionReveal,
  MissionSeat,
  MissionStage,
  MissionState,
  MissionTie,
  MissionWish,
  MissionRegion,
  Question,
} from '@sixtysix/shared'
import { CAPITAL_VALUE, MISSION_DEFAULT_OPTIONS } from '@sixtysix/shared'
import { MISSION_MAP } from '@sixtysix/shared/missionMaps/campaign'
import type { NumberEntry, PlaceEntry } from './content.js'

/**
 * Mission rooms: an in-memory registry with its own codes and GC, separate
 * from the arena's and the other board games' (docs/mission.md).
 */

export interface MPlayer {
  /** Public id (broadcast); the map key is the secret device id. */
  id: string
  name: string
  avatar: string
  wins: number
  connected: boolean
  socketId: string | null
  /** A server-side bot (bots.ts): always connected, no socket, a `bot-…` secret. */
  bot: boolean
  locale: GameLocale
  botTimer?: ReturnType<typeof setTimeout>
  /** The step (room.step) the bot's timer is for. */
  botStep?: number
  /** Test only (bot simulations): this bot's level instead of the room's. */
  botLevelOverride?: MissionBotLevel
}

/** Per-seat game data, by seat index. */
export interface SeatData {
  capital: string | null
  walls: number
  defence: number
  streak: number
  out: boolean
  /** Every multiple-choice answer time (ms; no answer = the full time). */
  times: number[]
  right: number
  tiesWon: number
}

export interface TieInternal {
  kind: 'number' | 'pin'
  number?: NumberEntry
  place?: PlaceEntry
  startedAt: number
  answers: Map<number, { value: number | null; lat: number | null; lon: number | null; ms: number }>
}

export interface MRoom {
  code: string
  phase: MissionPhase
  stage: MissionStage | null
  /** Keyed by the SECRET device id; `id` inside is the public id. */
  players: Map<string, MPlayer>
  leaderSecret: string | null
  botLevel: MissionBotLevel
  options: MissionOptions
  game: number
  /** Seat index → secret. In the lobby it follows the players' order; fixed when a game starts. */
  seats: string[]
  sd: SeatData[]
  /** People (not bots) dealt in, counted at the start. */
  dealtHumans: number
  regions: MissionRegion[]
  byId: Map<string, MissionRegion>
  owners: Map<string, number | null>
  /** Regions picked as capitals this game (worth CAPITAL_VALUE whoever holds them). */
  capitalSites: Set<string>
  pickOrder: number[]
  /** Snake base: the last capital picker first, then the pick order. */
  base: number[]
  claimRound: number
  battleRound: number
  battleRounds: number
  turnOrder: number[]
  turnIdx: number
  activeSeat: number | null
  choices: string[]
  wishes: MissionWish[]
  attack: MissionAttack | null
  siegeWins: number
  /** The current multiple-choice question (with its answer: server only). */
  question: Question | null
  qPub: MissionQuestion | null
  qStartedAt: number
  qCount: number
  answers: Map<number, { index: number; ms: number }>
  reveal: MissionReveal | null
  tie: MissionTie | null
  tieInt: TieInternal | null
  /** Seats in the order they were knocked out. */
  outOrder: number[]
  /** Question pool for this room (drawn in batches, no repeats). */
  pool: Question[]
  used: Set<string>
  usedNumbers: Set<string>
  usedPlaces: Set<string>
  result: MissionResult | null
  /** Bumped on every phase change: bots plan per step, a stale timer does nothing. */
  step: number
  phaseEndsAt: number
  /** Bots wait until then: the clients show a phase banner (a new stage or battle round). */
  holdUntil: number
  phaseMs: number
  timer?: ReturnType<typeof setTimeout>
  lastActivity: number
}

const rooms = new Map<string, MRoom>()
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 5
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000
const EMPTY_ROOM_MS = 10 * 60 * 1000

/** socket.io channel; prefixed so it never collides with another game's code. */
export const channel = (room: MRoom): string => `mission:${room.code}`

function generateCode(): string {
  let code: string
  do {
    code = Array.from({ length: CODE_LENGTH }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
  } while (rooms.has(code))
  return code
}

export function resetGame(room: MRoom): void {
  room.stage = null
  room.sd = []
  room.regions = []
  room.byId = new Map()
  room.owners = new Map()
  room.capitalSites = new Set()
  room.pickOrder = []
  room.base = []
  room.claimRound = 0
  room.battleRound = 0
  room.battleRounds = 0
  room.turnOrder = []
  room.turnIdx = 0
  room.activeSeat = null
  room.choices = []
  room.wishes = []
  room.attack = null
  room.siegeWins = 0
  room.question = null
  room.qPub = null
  room.qStartedAt = 0
  room.qCount = 0
  room.answers = new Map()
  room.reveal = null
  room.tie = null
  room.tieInt = null
  room.outOrder = []
  room.result = null
}

export function createMissionRoom(): MRoom {
  const room = {
    code: generateCode(),
    phase: 'lobby',
    players: new Map(),
    leaderSecret: null,
    botLevel: 'normal',
    options: { ...MISSION_DEFAULT_OPTIONS },
    game: 0,
    seats: [],
    dealtHumans: 0,
    pool: [],
    used: new Set(),
    usedNumbers: new Set(),
    usedPlaces: new Set(),
    step: 0,
    phaseEndsAt: 0,
    holdUntil: 0,
    phaseMs: 0,
    lastActivity: Date.now(),
  } as unknown as MRoom
  resetGame(room)
  rooms.set(room.code, room)
  return room
}

export function getMissionRoom(code: unknown): MRoom | undefined {
  return typeof code === 'string' ? rooms.get(code.trim().toUpperCase()) : undefined
}

export function deleteMissionRoom(room: MRoom): void {
  clearTimeout(room.timer)
  for (const p of room.players.values()) clearTimeout(p.botTimer)
  rooms.delete(room.code)
}

export function findMissionRoomBySocket(socketId: string): { room: MRoom; secret: string } | undefined {
  for (const room of rooms.values()) {
    for (const [secret, p] of room.players) if (p.socketId === socketId) return { room, secret }
  }
  return undefined
}

export const touch = (room: MRoom): void => {
  room.lastActivity = Date.now()
}

export const newPlayerId = (): string => randomUUID()

/** A seat's language; bots speak the leader's. */
export function localeOf(room: MRoom, p: MPlayer): GameLocale {
  if (!p.bot) return p.locale
  const leader = room.leaderSecret ? room.players.get(room.leaderSecret) : undefined
  return leader && !leader.bot ? leader.locale : p.locale
}

/** Lobby seats follow the players' order; a running game keeps its own. */
export function seatSecrets(room: MRoom): string[] {
  return room.phase === 'lobby' ? [...room.players.keys()] : room.seats
}

export const seatOf = (room: MRoom, secret: string): number => seatSecrets(room).indexOf(secret)

/** A region's worth: a capital site picked this game counts CAPITAL_VALUE. */
export const valueOf = (room: MRoom, id: string): number =>
  room.capitalSites.has(id) ? CAPITAL_VALUE : (room.byId.get(id)?.value ?? 0)

export function landOf(room: MRoom, seat: number): { land: number; regions: number } {
  let land = 0
  let regions = 0
  for (const [id, owner] of room.owners) {
    if (owner !== seat) continue
    land += valueOf(room, id)
    regions++
  }
  return { land, regions }
}

export const avgMs = (sd: SeatData | undefined): number =>
  sd && sd.times.length ? Math.round(sd.times.reduce((a, b) => a + b, 0) / sd.times.length) : 0

export function toMissionState(room: MRoom): MissionState {
  const pub = (secret: string | null) => (secret && room.players.get(secret)?.id) || null
  const secrets = seatSecrets(room)
  const seats: MissionSeat[] = secrets.map((secret, seat) => {
    const p = room.players.get(secret)
    const sd = room.sd[seat]
    const { land, regions } = room.phase === 'lobby' ? { land: 0, regions: 0 } : landOf(room, seat)
    const defence = sd?.defence ?? 0
    return {
      id: p?.id ?? '',
      seat,
      name: p?.name ?? '?',
      avatar: p?.avatar ?? '',
      bot: p?.bot ?? false,
      connected: p?.connected ?? false,
      out: sd?.out ?? false,
      capital: sd?.capital ?? null,
      walls: sd?.walls ?? 0,
      defence,
      streak: sd?.streak ?? 0,
      regions,
      land,
      score: land + defence,
      wins: p?.wins ?? 0,
      avgMs: avgMs(sd),
      right: sd?.right ?? 0,
      tiesWon: sd?.tiesWon ?? 0,
    }
  })
  const walls: Record<string, number> = {}
  for (const sd of room.sd) if (sd.capital && !sd.out) walls[sd.capital] = sd.walls
  return {
    code: room.code,
    phase: room.phase,
    stage: room.stage,
    seats,
    leaderId: pub(room.leaderSecret),
    botLevel: room.botLevel,
    options: room.options,
    mapId: MISSION_MAP.id,
    game: room.game,
    owners: Object.fromEntries(room.owners),
    walls,
    pickOrder: room.pickOrder,
    claimRound: room.claimRound,
    battleRound: room.battleRound,
    battleRounds: room.battleRounds,
    turnOrder: room.turnOrder,
    activeSeat: room.activeSeat,
    choices: room.choices,
    wishes: room.wishes,
    attack: room.attack,
    siegeWins: room.siegeWins,
    question: room.qPub,
    answered: room.phase === 'question' ? [...room.answers.keys()] : [],
    reveal: room.reveal,
    tie: room.tie,
    endsInMs: room.phaseEndsAt ? Math.max(0, room.phaseEndsAt - Date.now()) : 0,
    phaseMs: room.phaseMs,
    result: room.phase === 'over' ? room.result : null,
  }
}

export function startMissionGC(onClose: (room: MRoom) => void): void {
  setInterval(() => {
    const now = Date.now()
    for (const room of rooms.values()) {
      const empty = ![...room.players.values()].some((p) => p.connected && !p.bot)
      if (now - room.lastActivity > (empty ? EMPTY_ROOM_MS : ROOM_IDLE_MS)) {
        onClose(room)
        deleteMissionRoom(room)
      }
    }
  }, 60_000).unref()
}
