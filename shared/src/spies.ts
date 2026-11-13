/**
 * Twelve Spies — a Bible Codenames (Numbers 13; docs/board-games.md).
 *
 * Two tribes, Judah (gold) and Ephraim (blue), race to find their words on a
 * 5×5 grid. Each tribe's spy master (Caleb for Judah, Joshua for Ephraim)
 * sees the secret key and gives one-word clues; the rest of the tribe are
 * field agents who reveal cards. Co-op: one tribe against the clock.
 *
 * The server is authoritative. Public state (SpiesState) only carries the
 * colours of revealed cards; the key goes privately to the spy masters in
 * `spies:key` and becomes public only when the game is over.
 */

import type { GameLocale } from './locale'

export type SpiesTeam = 'judah' | 'ephraim'
export const SPIES_TEAMS: readonly SpiesTeam[] = ['judah', 'ephraim']
/** Card colours: a tribe's land, empty wilderness, or the giant (instant loss). */
export type SpiesColour = SpiesTeam | 'neutral' | 'goliath'

export type SpiesPhase =
  | 'lobby'
  | 'clue' // the active tribe's spy master writes a clue
  | 'guess' // the active tribe's agents reveal cards
  | 'over' // someone won (or the game was abandoned)

/** versus: two tribes, 4+ players. coop: Judah alone races the rival tribe, 2+ players. */
export type SpiesMode = 'versus' | 'coop'

export const SPIES_MIN_VERSUS = 4
export const SPIES_MIN_COOP = 2
export const SPIES_MAX_PLAYERS = 12
export const SPIES_GRID = 25
export const SPIES_CLUE_MAX = 20
export const SPIES_MAX_NUMBER = 9
/** Per-turn timer options in seconds (0 = no timer). */
export const SPIES_TIMER_OPTIONS = [0, 90, 150] as const
/**
 * A proposer may reveal their own pick alone only after this long with nobody
 * agreeing (an idle or absent teammate), as a separate, explained action.
 * With a single connected agent no wait is needed: they are the majority.
 */
export const SPIES_FORCE_MS = 20_000
/** An offline spy master's tribe waits this long (paused) before it is offered a new one. */
export const SPIES_SM_WAIT_MS = 30_000
/** Pick for "end our turn" in a proposal. */
export const SPIES_PASS = -1

export interface SpiesPlayer {
  /** Public id (the device id stays secret on the server). */
  id: string
  name: string
  avatar: string
  team: SpiesTeam
  connected: boolean
  /** Games won in this room. */
  wins: number
}

export interface SpiesCard {
  /** The English word (the id of the card). */
  word: string
  /** The card in every language (server/src/spies/words.<lang>.json); each client shows its own. */
  words: Record<GameLocale, string>
  /** null = still hidden. */
  revealed: SpiesColour | null
}

export interface SpiesClue {
  team: SpiesTeam
  word: string
  number: number
}

export interface SpiesTurn extends SpiesClue {
  /** Cards revealed this turn, in order, with their colour. */
  picks: { index: number; colour: SpiesColour }[]
  /** Co-op only: the card the rival tribe took after this turn. */
  rival?: number
}

export interface SpiesProposal {
  /** Grid index, or SPIES_PASS for "end our turn". */
  pick: number
  proposerId: string
  /** Public ids who agree (the proposer included). */
  backers: string[]
  /** Backers needed for a reveal: a majority of the tribe's connected agents. */
  needed: number
  /** ms from receipt until the proposer may reveal alone (`spies:confirm`, SPIES_FORCE_MS; 0 = now). */
  forceInMs: number
}

/**
 * A tribe whose spy master went offline or left mid-game. While it lasts the
 * tribe's turns are paused (timer frozen, no clue, no picks). It ends when the
 * spy master comes back, a teammate takes over (`spies:takeover`) or the
 * leader starts a new game (`spies:again`). Nobody is promoted automatically.
 */
export interface SpiesVacancy {
  /** The spy master who is missing (public id; null once they left for good). */
  playerId: string | null
  name: string
  avatar: string
  /** Left on purpose: no wait, the choices show at once. */
  left: boolean
  /** ms from receipt until the wait for their return is over (0 = over / left). */
  waitInMs: number
  /** The whole wait (SPIES_SM_WAIT_MS), for the countdown ring. */
  waitMs: number
}

export type SpiesEndReason = 'found' | 'goliath' | 'rival' | 'abandoned'

export interface SpiesResult {
  /** null = abandoned. In co-op, 'ephraim' means the rival tribe won. */
  winner: SpiesTeam | null
  reason: SpiesEndReason
  /** The tribe that turned over Goliath (reason 'goliath'). */
  loser: SpiesTeam | null
  /** The full key, public once the game is over. */
  key: SpiesColour[]
}

/** Safe to broadcast to everyone in the room (and to the board). */
export interface SpiesState {
  code: string
  phase: SpiesPhase
  mode: SpiesMode
  players: SpiesPlayer[]
  leaderId: string | null
  /** Public ids of the spy masters (also set in the lobby: next game's). */
  spymasters: Record<SpiesTeam, string | null>
  turnSeconds: number
  /** Game number in this room (1-based once started). */
  game: number
  startingTeam: SpiesTeam | null
  /** Whose turn it is ('clue' and 'guess'). */
  turn: SpiesTeam | null
  /** 25 cards once the game starts (empty in the lobby). */
  cards: SpiesCard[]
  /** Hidden cards left per tribe. */
  remaining: Record<SpiesTeam, number>
  clue: SpiesClue | null
  /** Reveals left this turn (number + 1). */
  guessesLeft: number
  proposal: SpiesProposal | null
  /** Tribes waiting for a spy master (mid-game only). The tribe whose turn it is and has one is paused. */
  vacancies: Partial<Record<SpiesTeam, SpiesVacancy>>
  /** Turns so far, newest last. */
  history: SpiesTurn[]
  /** Time left in the current turn from receipt; 0 = no timer. */
  endsInMs: number
  phaseMs: number
  result: SpiesResult | null
}

/** The key, sent only to spy masters: one colour per grid card. */
export interface SpiesKey {
  game: number
  team: SpiesTeam
  colours: SpiesColour[]
}

type Ack<T> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void

export interface SpiesClientToServerEvents {
  /** `locale`: the player's app language (default 'en'); grid and clue checks cover every language in the room. */
  'spies:create': (payload: { name: string; avatar: string; playerId: string; locale: GameLocale }, cb: Ack<{ playerId: string; state: SpiesState }>) => void
  /** Join or REJOIN (same device id rebinds and keeps team and role). */
  'spies:join': (payload: { code: string; name: string; avatar: string; playerId: string; locale: GameLocale }, cb: Ack<{ playerId: string; state: SpiesState }>) => void
  /** Read-only shared board (laptop / projector). */
  'spies:watch': (payload: { code: string }, cb: Ack<{ state: SpiesState }>) => void
  'spies:leave': (cb: (ok: boolean) => void) => void
  /** Leader: remove a person (public id) from the room; their device can't rejoin it. */
  'spies:kick': (payload: { playerId: string }) => void
  /** The player switched the app language while seated. */
  'spies:locale': (payload: { locale: GameLocale }) => void
  /** Lobby: switch to a tribe. */
  'spies:team': (payload: { team: SpiesTeam }) => void
  /** Lobby: volunteer as your tribe's spy master. */
  'spies:spymaster': () => void
  /** Leader, lobby. */
  'spies:settings': (payload: { mode: SpiesMode; turnSeconds: number }) => void
  'spies:shuffle': () => void
  'spies:start': () => void
  /** Spy master of the active tribe. */
  'spies:clue': (payload: { word: string; number: number }, cb: Ack<object>) => void
  /** Agent of the active tribe: propose or back a pick (grid index or SPIES_PASS). */
  'spies:pick': (payload: { pick: number }) => void
  /** The proposer, after SPIES_FORCE_MS with no majority: reveal alone (absent / idle teammates). */
  'spies:confirm': () => void
  /** An agent of a tribe whose spy master is missing takes the role (and gets the key). */
  'spies:takeover': () => void
  /**
   * Leader, phase 'over' (or mid-game while a tribe has no spy master): play again in the same room. Default: back to the lobby
   * (spy masters rotate, offline players are dropped). `now`: start the next game
   * straight away (falls back to the lobby when the teams don't allow a start).
   */
  'spies:again': (payload?: { now?: boolean }) => void
}

export interface SpiesServerToClientEvents {
  'spies:state': (state: SpiesState) => void
  /** null = no key for you (agent, board, lobby). */
  'spies:key': (key: SpiesKey | null) => void
  'spies:closed': (reason: string) => void
}
