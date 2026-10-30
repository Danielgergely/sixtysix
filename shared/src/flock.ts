/**
 * Wolf in the Flock — a hidden-role party game (docs/board-games.md).
 *
 * One game = one secret Bible word. Every player is a sheep who sees it,
 * except the wolf (two wolves from FLOCK_TWO_WOLVES_FROM players, who don't
 * know each other) who only sees the category.
 * Players give one short clue each per lap; after every full lap the flock
 * decides: vote now, or another lap. A wolf may type (and change) a guess of
 * the word at any time until a vote starts; it locks for the vote and only
 * counts if that wolf is caught. Each player has one vote per wolf still
 * hiding. The game ends when
 *  - the flock votes out a sheep (wolves win),
 *  - the flock votes out the last wolf and no caught wolf had the word
 *    (sheep win; a guess that is only close goes to the flock's judgement),
 *  - a caught wolf's guess is the word (wolves win),
 *  - or the last lap's vote ties (the wolves escape).
 *
 * The server is authoritative. Public state (FlockState) never contains the
 * word or the wolves until the game is over; each player's own card arrives
 * privately in `flock:secret`.
 */

export type FlockPhase =
  | 'lobby'
  | 'secret' // everyone looks at their card
  | 'clues' // one clue per player per lap, in turn order
  | 'decide' // after a full lap: vote now, or another lap?
  | 'vote' // everyone points at a suspect (one vote per wolf still hiding)
  | 'judge' // the flock decides whether a close guess counts
  | 'out' // a tie, or one of two wolves caught: the game goes on
  | 'over' // the game is decided

export const FLOCK_MIN_PLAYERS = 3
export const FLOCK_MAX_PLAYERS = 12
export const FLOCK_CLUE_MAX = 24
/** After this many laps the vote is no longer optional, and a tie lets the wolves escape. */
export const FLOCK_MAX_LAPS = 4
/** Games dealt to this many players or more have two wolves. */
export const FLOCK_TWO_WOLVES_FROM = 7
export const flockWolfCount = (players: number): number => (players >= FLOCK_TWO_WOLVES_FROM ? 2 : 1)
/** Longest typed guess. */
export const FLOCK_GUESS_MAX = 40
/** Games pay coins and XP only with at least this many people (not bots) dealt in. */
export const FLOCK_REWARD_HUMANS = 3

/** Server-side bot players (server/src/flock/bots.ts); the leader picks the level in the lobby. */
export type FlockBotLevel = 'easy' | 'normal'

import type { GameLocale } from './locale'

export const FLOCK_CATEGORIES = ['person', 'place', 'story', 'thing'] as const
export type FlockCategory = (typeof FLOCK_CATEGORIES)[number]

/**
 * An entry of the word list (shared/src/flockWords.json, used by the server and
 * the one-phone mode). The German and Hungarian lists (flockWords.<lang>.json)
 * have the same categories, order and length; their entries add `en`, the
 * English word (the id). A game deals one entry (category + index) and every
 * player sees it in their own language.
 */
export interface FlockWord {
  /** Translated lists only: the English word of the same entry. */
  en?: string
  word: string
  hint: string
  ref: string
  /** Shown to a wolf who has to give the first clue: associated, never the word. */
  wolfHint: string
  /** Other names that count as the word when a caught wolf types it (and that sheep may not say). */
  aliases?: string[]
  /** Short clues a sheep might give (1–2 words, none says the word); the bots draw from them. */
  clues: string[]
}
export type FlockWordList = Record<FlockCategory, FlockWord[]>

export type FlockSide = 'sheep' | 'wolves'
export type FlockEndReason =
  | 'caught' // the last wolf was voted out and didn't name the word
  | 'wrongVote' // the flock voted out a sheep
  | 'guessed' // a caught wolf named the word
  | 'escaped' // the last lap's vote tied, or the wolves outnumber the sheep
  | 'fled' // the last wolf left the game
  | 'abandoned' // too few players left

export interface FlockPlayer {
  /** Public id (the device id stays secret on the server). */
  id: string
  name: string
  avatar: string
  /** Games won in this room. */
  wins: number
  connected: boolean
  /** Dealt into the current game (late joiners watch until the next one). */
  playing: boolean
  /** Voted out: watches the rest of this game. */
  out: boolean
  /** Phase 'secret': has looked at the card. 'decide' / 'vote' / 'judge': has chosen. */
  done: boolean
  /** A server-side bot (added by the leader in the lobby). */
  bot: boolean
}

export interface FlockClue {
  playerId: string
  text: string
  /** Turn timed out or the player was offline. */
  skipped: boolean
  lap: number
}

/** Phase 'out': what just happened. The game goes on; the votes stay secret until the end. */
export interface FlockOut {
  /** Wolves just voted out, whose guess wasn't the word (empty = the vote tied, nobody leaves). */
  playerIds: string[]
  reason: 'tie' | 'caught'
}

export interface FlockGuess {
  wolfId: string
  guess: string
  /** match = the word (typos and other names count); accepted / rejected = judged by the flock. */
  verdict: 'match' | 'accepted' | 'rejected' | 'wrong'
}

export interface FlockResult {
  /** null = abandoned (no winner, no rewards). */
  winner: FlockSide | null
  reason: FlockEndReason
  /** Public ids of the game's wolves. */
  wolfIds: string[]
  /** The word in English (the id); `words` has it in every language, each client shows its own. */
  word: string
  hint: string
  ref: string
  words: Record<GameLocale, { word: string; hint: string; ref: string }>
  /** Players voted out by the deciding vote. */
  outIds: string[]
  /** The caught wolves' guesses, in order (guess '' = they never typed one). */
  guesses: FlockGuess[]
  /** Wolves caught earlier whose guess failed: they lose even if the other wolf wins. */
  lostIds: string[]
  /** The deciding vote, if any: voterId → targetIds. */
  votes: Record<string, string[]>
  /** At least FLOCK_REWARD_HUMANS people (not bots) were dealt in: the game pays rewards. */
  rewarded: boolean
}

/** Safe to broadcast to everyone in the room (and to the board). */
export interface FlockState {
  code: string
  phase: FlockPhase
  players: FlockPlayer[]
  leaderId: string | null
  botLevel: FlockBotLevel
  /** Game number in this room (1-based once started; "Play again" adds one). */
  game: number
  /** Current clue lap (1-based). */
  lap: number
  category: FlockCategory | null
  /** Wolves dealt this game (public: everyone knows how many to look for). */
  wolfCount: number
  /** Wolves still hiding. */
  wolvesLeft: number
  /** Public ids in clue order for this game. */
  turnOrder: string[]
  /** Whose clue turn it is (phase 'clues'). */
  turnPlayerId: string | null
  clues: FlockClue[]
  /** Phase 'decide': who wants to vote now / another lap (public ids). */
  decide: { vote: string[]; more: string[] } | null
  /** Phase 'vote' was forced (last lap): a tie lets the wolves escape. */
  finalVote: boolean
  /** Phase 'vote': how many different players each voter names (one per wolf still hiding). */
  votesEach: number
  /**
   * Phase 'judge': a caught wolf's guess was close; sheep vote whether it counts
   * (a tie counts). `guess` is null while another wolf still hides (then only the
   * sheep see it, in their card); the word itself is never public here.
   */
  judge: { wolfId: string; guess: string | null; yes: string[]; no: string[] } | null
  /** Time left in the current phase from receipt; 0 = no timer. */
  endsInMs: number
  phaseMs: number
  /** Set only in phase 'out'. */
  lastOut: FlockOut | null
  /** Set only in phase 'over' (the word stays hidden until then). */
  result: FlockResult | null
}

/** Private card, sent only to its owner. */
export interface FlockSecret {
  game: number
  role: 'sheep' | 'wolf'
  category: FlockCategory
  wolfCount: number
  /** Sheep only, in the player's language. */
  word?: string
  hint?: string
  ref?: string
  /** Sheep only, phase 'judge': the guess to judge (always visible to the flock). */
  judgeGuess?: string
  /** Wolf only: your current guess of the word (locked once a vote starts). */
  myGuess?: string
  /**
   * Wolf only, when they give the first clue (no clues to go on yet): a word
   * associated with the secret word, e.g. "Sea" for Jonah.
   */
  wolfHint?: string
}

type Ack<T> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void

export interface FlockClientToServerEvents {
  /** `locale`: the player's app language (cards, hints and bots' clues come in it; default 'en'). */
  'flock:create': (payload: { name: string; avatar: string; playerId: string; locale: GameLocale }, cb: Ack<{ playerId: string; state: FlockState }>) => void
  /** Join or REJOIN (same device id rebinds and keeps the seat). */
  'flock:join': (payload: { code: string; name: string; avatar: string; playerId: string; locale: GameLocale }, cb: Ack<{ playerId: string; state: FlockState }>) => void
  /** Read-only shared board (laptop / projector). */
  'flock:watch': (payload: { code: string }, cb: Ack<{ state: FlockState }>) => void
  'flock:leave': (cb: (ok: boolean) => void) => void
  /** The player switched the app language while seated: the card comes again in the new one. */
  'flock:locale': (payload: { locale: GameLocale }) => void
  'flock:start': () => void
  'flock:ready': () => void
  'flock:clue': (payload: { text: string }, cb: Ack<object>) => void
  /** Phase 'decide': true = vote now, false = another lap. */
  'flock:decide': (payload: { vote: boolean }) => void
  /** One distinct target per vote (FlockState.votesEach). */
  'flock:vote': (payload: { targetIds: string[] }) => void
  /** A wolf, before a vote starts: set or change the guess of the word ('' clears it). */
  'flock:guess': (payload: { word: string }, cb: Ack<object>) => void
  /** A sheep, phase 'judge': does the close guess count? */
  'flock:judge': (payload: { ok: boolean }) => void
  /**
   * Leader, phase 'over': play again in the same room. Default: back to the lobby
   * (everyone stays seated, offline players are dropped). `now`: deal the next
   * word straight away (falls back to the lobby with too few players).
   */
  'flock:again': (payload?: { now?: boolean }) => void
  /** Leader, lobby only: add a bot player / remove one / set how well the bots play. */
  'flock:addBot': () => void
  'flock:removeBot': (payload: { playerId: string }) => void
  'flock:botLevel': (payload: { level: FlockBotLevel }) => void
}

export interface FlockServerToClientEvents {
  'flock:state': (state: FlockState) => void
  /** null = no card (lobby, over, board, not dealt in). */
  'flock:secret': (secret: FlockSecret | null) => void
  'flock:closed': (reason: string) => void
}
