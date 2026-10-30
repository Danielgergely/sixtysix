/**
 * Wolf in the Flock — a hidden-role party game (docs/board-games.md).
 *
 * One game = one secret Bible word. Every player is a sheep who sees it,
 * except the wolf (two wolves from FLOCK_TWO_WOLVES_FROM players, who don't
 * know each other) who only sees the category and a list of candidates.
 * Players give one short clue each per lap; after every full lap the flock
 * decides: vote now, or another lap. The game ends when
 *  - the flock votes out the last wolf (sheep win),
 *  - the flock votes out a sheep (wolves win),
 *  - a wolf names the word (wolves win; a wrong guess puts that wolf out),
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
  | 'vote' // everyone points at a suspect
  | 'out' // someone left the game (wolf voted out with another still hiding, a tie, a wrong guess)
  | 'over' // the game is decided

export const FLOCK_MIN_PLAYERS = 3
export const FLOCK_MAX_PLAYERS = 12
export const FLOCK_CLUE_MAX = 24
/** After this many laps the vote is no longer optional, and a tie lets the wolves escape. */
export const FLOCK_MAX_LAPS = 4
/** Games dealt to this many players or more have two wolves. */
export const FLOCK_TWO_WOLVES_FROM = 7
export const flockWolfCount = (players: number): number => (players >= FLOCK_TWO_WOLVES_FROM ? 2 : 1)
/** Candidates a wolf picks the word from (the word among them). */
export const FLOCK_GUESS_OPTIONS = 8

export const FLOCK_CATEGORIES = ['person', 'place', 'story', 'thing'] as const
export type FlockCategory = (typeof FLOCK_CATEGORIES)[number]

export type FlockSide = 'sheep' | 'wolves'
export type FlockEndReason =
  | 'caught' // the last wolf was voted out
  | 'wrongVote' // the flock voted out a sheep
  | 'guessed' // a wolf named the word
  | 'wrongGuess' // the last wolf guessed wrong
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
  /** Voted out or guessed wrong: watches the rest of this game. */
  out: boolean
  /** Phase 'secret': has looked at the card. 'decide' / 'vote': has chosen. */
  done: boolean
}

export interface FlockClue {
  playerId: string
  text: string
  /** Turn timed out or the player was offline. */
  skipped: boolean
  lap: number
}

/** Phase 'out': what just happened. The game goes on. */
export interface FlockOut {
  /** Who is out (null = the vote tied, nobody leaves). */
  playerId: string | null
  /** Revealed for whoever is out: everyone learns whether they were a wolf. */
  wasWolf: boolean
  reason: 'vote' | 'tie' | 'wrongGuess'
  /** reason 'wrongGuess': the word the wolf named. */
  guess: string | null
  /** The vote that led here: voterId → targetId (public ids). */
  votes: Record<string, string>
}

export interface FlockResult {
  /** null = abandoned (no winner, no rewards). */
  winner: FlockSide | null
  reason: FlockEndReason
  /** Public ids of the game's wolves. */
  wolfIds: string[]
  word: string
  hint: string
  ref: string
  /** The wolf who guessed, and what (reason 'guessed' / 'wrongGuess'). */
  guesserId: string | null
  guess: string | null
  /** The player voted out last (reason 'caught' / 'wrongVote'). */
  outId: string | null
  /** The deciding vote, if any: voterId → targetId. */
  votes: Record<string, string>
}

/** Safe to broadcast to everyone in the room (and to the board). */
export interface FlockState {
  code: string
  phase: FlockPhase
  players: FlockPlayer[]
  leaderId: string | null
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
  /** Sheep only. */
  word?: string
  hint?: string
  ref?: string
  /** Wolf only: the candidates to name the word from, at any time. */
  guessOptions?: string[]
  /**
   * Wolf only, when they give the first clue (no clues to go on yet): a word
   * associated with the secret word, e.g. "Sea" for Jonah.
   */
  wolfHint?: string
}

type Ack<T> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void

export interface FlockClientToServerEvents {
  'flock:create': (payload: { name: string; avatar: string; playerId: string }, cb: Ack<{ playerId: string; state: FlockState }>) => void
  /** Join or REJOIN (same device id rebinds and keeps the seat). */
  'flock:join': (payload: { code: string; name: string; avatar: string; playerId: string }, cb: Ack<{ playerId: string; state: FlockState }>) => void
  /** Read-only shared board (laptop / projector). */
  'flock:watch': (payload: { code: string }, cb: Ack<{ state: FlockState }>) => void
  'flock:leave': (cb: (ok: boolean) => void) => void
  'flock:start': () => void
  'flock:ready': () => void
  'flock:clue': (payload: { text: string }, cb: Ack<object>) => void
  /** Phase 'decide': true = vote now, false = another lap. */
  'flock:decide': (payload: { vote: boolean }) => void
  'flock:vote': (payload: { targetId: string }) => void
  /** Wolf, any time during the game: name the word. Wrong = out. */
  'flock:guess': (payload: { word: string }) => void
  /** Leader: over → lobby for the next game. */
  'flock:again': () => void
}

export interface FlockServerToClientEvents {
  'flock:state': (state: FlockState) => void
  /** null = no card (lobby, over, board, not dealt in). */
  'flock:secret': (secret: FlockSecret | null) => void
  'flock:closed': (reason: string) => void
}
