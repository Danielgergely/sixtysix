/**
 * Wolf in the Flock — a hidden-role party game (docs/board-games.md).
 *
 * Every player is a sheep who sees a secret Bible word, except the wolf (two
 * wolves from FLOCK_TWO_WOLVES_FROM players, who don't know each other) who
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
/** Rounds dealt to this many players or more have two wolves. */
export const FLOCK_TWO_WOLVES_FROM = 7
export const flockWolfCount = (dealt: number): number => (dealt >= FLOCK_TWO_WOLVES_FROM ? 2 : 1)

export const FLOCK_CATEGORIES = ['person', 'place', 'story', 'thing'] as const
export type FlockCategory = (typeof FLOCK_CATEGORIES)[number]

/** Points (see docs/board-games.md → Scoring). */
export const FLOCK_POINTS = {
  /** Each sheep whose vote pointed at a wolf. */
  sheepFoundWolf: 1,
  /** Each wolf who was not the single most-voted player. */
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
  /** Public ids of this round's wolves (one, or two in big groups). */
  wolfIds: string[]
  word: string
  hint: string
  ref: string
  /** voterId → targetId (public ids). */
  votes: Record<string, string>
  /** Single most-voted player, or null on a tie / no votes. */
  accusedId: string | null
  /** The accused was a wolf (with two wolves, the other one escaped). */
  wolfCaught: boolean
  /** The caught wolf's pick (null = no pick / not caught). */
  guess: string | null
  guessCorrect: boolean
  /** Points won this round by public id. */
  gains: Record<string, number>
  /** A wolf left mid-round; the round was called off. */
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
  /** Wolves this round (public: everyone knows how many to look for). */
  wolfCount: number
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
  /** The caught wolf only, during 'guess'. */
  guessOptions?: string[]
  /**
   * Wolf only, when they give the round's first clue (no clues to go on yet):
   * a word associated with the secret word, e.g. "Sea" for Jonah.
   */
  wolfHint?: string
  /** Wolves this round (a wolf doesn't learn who the other one is). */
  wolfCount: number
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
