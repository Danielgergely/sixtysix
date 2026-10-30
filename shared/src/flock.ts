/**
 * Wolf in the Flock — a hidden-role party game (docs/board-games.md).
 *
 * Every player is a sheep who sees a secret Bible word, except one wolf who
 * only sees the category. Players give one short clue each in turn, then vote
 * out the wolf. A caught wolf can still win points by picking the word.
 *
 * The server is authoritative. Public state (FlockState) never contains the
 * word or the wolf until the round's result; each player's own card arrives
 * privately in `flock:secret`.
 */

export type FlockPhase =
  | 'lobby'
  | 'secret' // everyone looks at their card
  | 'clues' // one clue per player per lap, in turn order
  | 'vote' // everyone points at the wolf
  | 'guess' // the caught wolf's last chance: pick the word
  | 'result' // word, wolf and votes revealed; scores updated
  | 'final' // end of the game

export const FLOCK_MIN_PLAYERS = 3
export const FLOCK_MAX_PLAYERS = 12
export const FLOCK_ROUND_OPTIONS = [3, 5, 8] as const
export const FLOCK_CLUE_MAX = 24

export const FLOCK_CATEGORIES = ['person', 'place', 'story', 'thing'] as const
export type FlockCategory = (typeof FLOCK_CATEGORIES)[number]

/** Points (see docs/board-games.md → Scoring). */
export const FLOCK_POINTS = {
  /** Each sheep whose vote pointed at the wolf. */
  sheepFoundWolf: 1,
  /** The wolf was not the single most-voted player. */
  wolfEscaped: 3,
  /** Caught wolf picked the secret word. */
  wolfGuessed: 2,
} as const

export interface FlockPlayer {
  /** Public id (the device id stays secret on the server). */
  id: string
  name: string
  avatar: string
  score: number
  connected: boolean
  /** Phase 'secret': has looked at the card. Phase 'vote': has voted. */
  done: boolean
}

export interface FlockClue {
  playerId: string
  text: string
  /** Turn timed out or the player had left. */
  skipped: boolean
  lap: number
}

export interface FlockRoundResult {
  wolfId: string
  word: string
  hint: string
  ref: string
  /** voterId → targetId (public ids). */
  votes: Record<string, string>
  /** Single most-voted player, or null on a tie / no votes. */
  accusedId: string | null
  wolfCaught: boolean
  /** The caught wolf's pick (null = no pick / not caught). */
  guess: string | null
  guessCorrect: boolean
  /** Points won this round by public id. */
  gains: Record<string, number>
  /** The wolf left mid-round; the round was called off. */
  wolfFled: boolean
}

/** Safe to broadcast to everyone in the room (and to the board). */
export interface FlockState {
  code: string
  phase: FlockPhase
  players: FlockPlayer[]
  leaderId: string | null
  /** Game number in this room (1-based once started; "Play again" adds one). */
  game: number
  round: number
  totalRounds: number
  clueLaps: number
  category: FlockCategory | null
  /** Public ids in clue order for this round. */
  turnOrder: string[]
  /** Whose clue turn it is (phase 'clues'). */
  turnPlayerId: string | null
  clues: FlockClue[]
  /** Time left in the current phase from receipt; 0 = no timer. */
  endsInMs: number
  phaseMs: number
  /** Set only in 'result' (the word stays hidden until then). */
  result: FlockRoundResult | null
  /** Phase 'guess': the caught wolf (public id). */
  accusedId: string | null
}

/** Private card, sent only to its owner. */
export interface FlockSecret {
  round: number
  role: 'sheep' | 'wolf'
  category: FlockCategory
  /** Sheep only. */
  word?: string
  hint?: string
  ref?: string
  /** Wolf only, during 'guess'. */
  guessOptions?: string[]
  /**
   * Wolf only, when the wolf gives the round's first clue (no clues to go on yet):
   * where the word is found, e.g. "Genesis" or "the New Testament".
   */
  wolfHint?: string
}

type Ack<T> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void

export interface FlockClientToServerEvents {
  'flock:create': (payload: { name: string; avatar: string; playerId: string }, cb: Ack<{ playerId: string; state: FlockState }>) => void
  /** Join or REJOIN (same device id rebinds and keeps the score). */
  'flock:join': (payload: { code: string; name: string; avatar: string; playerId: string }, cb: Ack<{ playerId: string; state: FlockState }>) => void
  /** Read-only shared board (laptop / projector). */
  'flock:watch': (payload: { code: string }, cb: Ack<{ state: FlockState }>) => void
  'flock:leave': (cb: (ok: boolean) => void) => void
  'flock:settings': (payload: { rounds: number; clueLaps: number }) => void
  'flock:start': () => void
  'flock:ready': () => void
  'flock:clue': (payload: { text: string }, cb: Ack<object>) => void
  'flock:vote': (payload: { targetId: string }) => void
  'flock:guess': (payload: { word: string }) => void
  /** Leader: result → next round (or final). */
  'flock:next': () => void
  /** Leader: final → lobby with scores reset. */
  'flock:again': () => void
}

export interface FlockServerToClientEvents {
  'flock:state': (state: FlockState) => void
  /** null = no card (lobby, final, board). */
  'flock:secret': (secret: FlockSecret | null) => void
  'flock:closed': (reason: string) => void
}
