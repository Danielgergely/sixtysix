import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FlockBotLevel, FlockCategory, FlockClue, FlockGuess, FlockOut, FlockPhase, FlockResult, FlockState, FlockWord, FlockWordList, GameLocale } from '@sixtysix/shared'
import { FLOCK_CATEGORIES, GAME_LOCALES } from '@sixtysix/shared'

/**
 * Wolf in the Flock rooms: an in-memory registry with its own codes and GC,
 * separate from the arena's (rooms.ts) so the two games never interact.
 */

// Shared with the app's one-phone mode. The translated lists have the same
// categories, order and length (scripts/check-words-i18n.mts checks them), so
// a dealt word is a category + an index, shown to each player in their language.
const readList = (locale: GameLocale): FlockWordList =>
  JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'shared', 'src', locale === 'en' ? 'flockWords.json' : `flockWords.${locale}.json`),
      'utf8',
    ),
  )
export const LISTS = Object.fromEntries(GAME_LOCALES.map((l) => [l, readList(l)])) as Record<GameLocale, FlockWordList>
/** The English list (the ids). */
export const WORDS: FlockWordList = LISTS.en
for (const c of FLOCK_CATEGORIES) {
  if (!WORDS[c]?.length) throw new Error(`[flock] no words for ${c}`)
  for (const w of WORDS[c]) if (!w.wolfHint) throw new Error(`[flock] no wolfHint for ${w.word}`)
  for (const l of GAME_LOCALES) {
    const list = LISTS[l][c]
    if (list?.length !== WORDS[c].length) throw new Error(`[flock] ${l} ${c}: ${list?.length} words, English has ${WORDS[c].length}`)
    list.forEach((w, i) => {
      if (l !== 'en' && w.en !== WORDS[c][i].word) throw new Error(`[flock] ${l} ${c}[${i}] is "${w.en}", English has "${WORDS[c][i].word}"`)
      if (!w.wolfHint) throw new Error(`[flock] no wolfHint for ${l} ${w.word}`)
    })
  }
}

export interface FPlayer {
  id: string
  name: string
  avatar: string
  wins: number
  connected: boolean
  socketId: string | null
  /** A server-side bot (bots.ts): always connected, no socket, a `bot-…` secret. */
  bot: boolean
  /** The player's app language (a bot uses its leader's: `localeOf`). */
  locale: GameLocale
  /** The bot's next action, if one is scheduled. */
  botTimer?: ReturnType<typeof setTimeout>
}

export interface FRoom {
  code: string
  phase: FlockPhase
  /** Keyed by the SECRET device id; `id` inside is the public id. */
  players: Map<string, FPlayer>
  leaderSecret: string | null
  botLevel: FlockBotLevel
  /** Games started in this room (rewards are paid once per game). */
  game: number
  category: FlockCategory | null
  /** The dealt entry in English (the id); `wordIn` gives it in another language. */
  word: FlockWord | null
  /** Its index in the category (the same in every language's list). */
  wordIdx: number
  /** This game's wolves (secrets), out or not. */
  wolves: string[]
  /** Players dealt into this game (late joiners wait for the next one). */
  dealt: Set<string>
  /** People (not bots) dealt in, counted at the deal so later departures don't change the rewards. */
  dealtHumans: number
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
  /** voter secret → target public ids (one per vote) */
  votes: Map<string, string[]>
  finalVote: boolean
  /** Votes each player casts this vote (wolves still hiding when it began). */
  votesEach: number
  /** Phase 'judge': the wolves just caught (secrets). */
  caught: string[]
  /** Each wolf's current guess of the word (wolf secret → text); locked during a vote. */
  typed: Map<string, string>
  /** Wolves caught whose guess failed (secrets): they lose even if the other wolf wins. */
  lost: Set<string>
  /** Close guesses waiting for the flock's judgement (wolf secrets), first = now. */
  judgeQueue: string[]
  /** Phase 'judge': sheep secret → counts? */
  judgeVotes: Map<string, boolean>
  /** Every caught wolf's guess this game. */
  guessLog: FlockGuess[]
  /** The vote that caught the wolves now guessing (for the result). */
  lastVotes: Record<string, string[]>
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
    botLevel: 'normal',
    game: 0,
    category: null,
    word: null,
    wordIdx: 0,
    wolves: [],
    dealt: new Set(),
    dealtHumans: 0,
    out: new Set(),
    turnOrder: [],
    turnIdx: 0,
    lap: 1,
    clues: [],
    done: new Set(),
    decide: new Map(),
    votes: new Map(),
    finalVote: false,
    votesEach: 1,
    caught: [],
    typed: new Map(),
    lost: new Set(),
    judgeQueue: [],
    judgeVotes: new Map(),
    guessLog: [],
    lastVotes: {},
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
  for (const p of room.players.values()) clearTimeout(p.botTimer)
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

// ── languages ───────────────────────────────────────────────────────────

/** A seat's language; bots speak the leader's. */
export function localeOf(room: FRoom, p: FPlayer): GameLocale {
  if (!p.bot) return p.locale
  const leader = room.leaderSecret ? room.players.get(room.leaderSecret) : undefined
  return leader && !leader.bot ? leader.locale : p.locale
}

/** Every language seated in the room (English first when present); the clue and guess checks cover all of them. */
export function roomLocales(room: FRoom): GameLocale[] {
  const present = new Set([...room.players.values()].map((p) => localeOf(room, p)))
  const out = GAME_LOCALES.filter((l) => present.has(l))
  return out.length ? out : ['en']
}

/** The dealt word in a language. */
export function wordIn(room: FRoom, locale: GameLocale): FlockWord | null {
  return room.category ? (LISTS[locale][room.category][room.wordIdx] ?? null) : null
}

function judgeView(room: FRoom, wolf: string, ids: (s: Iterable<string>) => string[]): FlockState['judge'] {
  // While another wolf hides, the guess (a near-miss of the word) goes only to the sheep.
  const hiding = room.wolves.some((s) => !room.out.has(s) && room.players.has(s))
  return {
    wolfId: room.players.get(wolf)?.id ?? '',
    guess: hiding ? null : (room.typed.get(wolf) ?? ''),
    yes: ids([...room.judgeVotes].filter(([, v]) => v).map(([s]) => s)),
    no: ids([...room.judgeVotes].filter(([, v]) => !v).map(([s]) => s)),
  }
}

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
      bot: p.bot,
    })),
    leaderId: pub(room.leaderSecret),
    botLevel: room.botLevel,
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
    votesEach: room.votesEach,
    judge: room.phase === 'judge' && room.judgeQueue[0] ? judgeView(room, room.judgeQueue[0], ids) : null,
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
      // No person connected (e.g. created and abandoned; bots don't count): gone after 10 minutes.
      const empty = ![...room.players.values()].some((p) => p.connected && !p.bot)
      if (now - room.lastActivity > (empty ? EMPTY_ROOM_MS : ROOM_IDLE_MS)) {
        onClose(room)
        deleteFlockRoom(room)
      }
    }
  }, 60_000).unref()
}

export const flockRoomCount = (): number => rooms.size
