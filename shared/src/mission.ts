/**
 * Mission — a Bible territory quiz (docs/mission.md).
 *
 * 2–3 seats (Judah gold, Israel blue, Aram red) pick capitals, claim the free
 * regions of a map round by round with one question for everybody, then fight
 * duels over bordering regions and besiege capitals. Every claim is decided by
 * a Bible question; a duel both players get right goes to a tie-breaker
 * (a number to guess, or a pin on the map).
 *
 * The server is authoritative (server/src/mission/). The public state never
 * carries a question's correct answer before the reveal, nor a tie-breaker's
 * answer before its reveal.
 */

import type { DifficultyPreset } from './protocol'
import type { GameLocale } from './locale'
import type { AnswerSet, Locale, VerseText } from './question'

export const MISSION_MIN_SEATS = 2
export const MISSION_MAX_SEATS = 3
/** People (not bots) dealt in before a finished game pays rewards. */
export const MISSION_REWARD_HUMANS = 2
/** Seat flavour names by seat index (texts: mission.seat.<id>). */
export const MISSION_SEATS = ['judah', 'israel', 'aram'] as const
export type MissionSeatName = (typeof MISSION_SEATS)[number]
/** Seat colours by seat index: Judah gold, Israel blue, Aram red. */
export const MISSION_SEAT_COLOURS = ['#d9a52b', '#3f74c9', '#c2412f'] as const

/** Defence bonus for every defence won (kept even if the region falls later). */
export const MISSION_DEFENCE_BONUS = 100
/** Defences won in a row (while the capital has a broken wall) that rebuild one wall (Nehemiah). */
export const MISSION_REBUILD_STREAK = 3
/** Domination games end by score after this many battle rounds at the latest. */
export const MISSION_DOMINATION_CAP = 30
/** Two pins this close (km) count as equally close. */
export const MISSION_PIN_TIE_KM = 1

export type MissionMode = 'domination' | 'rounds'
export type MissionMapSize = 'full' | 'blitz'
export type MissionBotLevel = 'easy' | 'normal' | 'hard'
export const MISSION_BOT_LEVELS: readonly MissionBotLevel[] = ['easy', 'normal', 'hard']
export const MISSION_ROUND_OPTIONS = [10, 15] as const
/** Tie-breaker input time (multiple-choice questions use QUESTION_TIME_MS, 20 s). */
export const MISSION_TIE_MS = 20_000

export interface MissionOptions {
  mode: MissionMode
  /** Battle rounds in mode 'rounds' (claiming doesn't count). */
  rounds: 10 | 15
  map: MissionMapSize
  difficulty: DifficultyPreset
  /** Mixed only: include level 5. */
  withImpossible: boolean
}

export const MISSION_DEFAULT_OPTIONS: MissionOptions = {
  mode: 'rounds',
  rounds: 10,
  map: 'full',
  difficulty: 'mixed',
  withImpossible: false,
}

export type MissionPhase =
  | 'lobby'
  | 'capital' // the active seat picks a capital
  | 'wish' // claiming: the active seat puts a flag on a free region
  | 'question' // a multiple-choice question (claim round or duel)
  | 'reveal' // the answer and what it decided
  | 'tie' // tie-breaker input (duels only)
  | 'tieReveal' // the tie-breaker's animated result
  | 'attack' // battle: the active seat picks an enemy region
  | 'siege' // the attacker won a wall: continue the siege or end the turn
  | 'over'

export type MissionStage = 'capitals' | 'claim' | 'battle'

export interface MissionSeat {
  /** Public id (the device id stays secret on the server). */
  id: string
  /** 0 Judah, 1 Israel, 2 Aram (colour and flavour name). */
  seat: number
  name: string
  avatar: string
  bot: boolean
  connected: boolean
  /** Lost their capital (they can stay and watch). */
  out: boolean
  /** Region id of the capital (null before the pick). */
  capital: string | null
  /** Walls left on the capital (0–3). */
  walls: number
  /** Defence bonus points so far. */
  defence: number
  /** Defences won in a row (Nehemiah's rebuild at MISSION_REBUILD_STREAK). */
  streak: number
  regions: number
  /** Land value: the regions held (a capital counts CAPITAL_VALUE). */
  land: number
  /** land + defence. */
  score: number
  /** Games won in this room. */
  wins: number
  /** Average answer time (ms) of the multiple-choice questions so far (the last tie order). */
  avgMs: number
  /** Multiple-choice questions answered right this game (rewards). */
  right: number
  /** Tie-breakers won this game (rewards). */
  tiesWon: number
}

/** A multiple-choice question as sent to the clients: no correctIndex. */
export interface MissionQuestion {
  /** Questions asked so far this game (1-based). */
  n: number
  kind: 'claim' | 'duel'
  text: string
  answers: AnswerSet
  difficulty: number
  translations: Partial<Record<Locale, { text: string; answers: AnswerSet }>>
  /** Seats that answer this question (the others watch). */
  seats: number[]
}

export interface MissionWish {
  seat: number
  region: string
}

export interface MissionAttack {
  attacker: number
  defender: number
  region: string
  /** The region is the defender's capital. */
  siege: boolean
}

export type MissionOutcome =
  | 'taken' // the attacker took the region
  | 'wall' // a capital wall fell
  | 'fallen' // the last wall fell: the defender is out
  | 'held' // the defender held (bonus)

export interface MissionReveal {
  questionId: string
  correctIndex: number
  reference: string
  verse: string
  verses: Partial<Record<Locale, VerseText>>
  /** Seats that answered right. */
  right: number[]
  /** Each seat's pick (-1 = no answer); public once revealed. */
  picks: Record<number, number>
  /** Claim rounds: who got their wish. */
  claims?: { seat: number; region: string; got: boolean }[]
  /** Duels: what happened (absent while a tie-breaker is still to come). */
  outcome?: MissionOutcome
  /** Nehemiah: this seat rebuilt a wall. */
  rebuilt?: number
}

export type MissionTieKind = 'number' | 'pin'

export interface MissionTieGuess {
  seat: number
  /** The number typed (number), or null without an answer. */
  value: number | null
  lat: number | null
  lon: number | null
  /** Answer time from the start of the tie-breaker (ms); null = no answer. */
  ms: number | null
  /** Gap to the answer (number) or distance in km (pin); null = no answer. */
  off: number | null
}

export interface MissionTie {
  kind: MissionTieKind
  /** The duel's region. */
  region: string
  seats: number[]
  /** Number tie-breakers: the question in every language, and its unit. */
  text?: Partial<Record<Locale, string>> & { en: string }
  unit?: Partial<Record<Locale, string>>
  /** Pin tie-breakers: the place to find, in every language. */
  place?: Partial<Record<Locale, string>> & { en: string }
  /** Seats that have answered. */
  answered: number[]
  /** Set in phase 'tieReveal'. */
  reveal: {
    answer: number | null
    lat: number | null
    lon: number | null
    reference: string
    guesses: MissionTieGuess[]
    /** null = nobody answered (the defender holds). */
    winner: number | null
    /** Equally close: decided by speed. */
    sameOff: boolean
    /** By how much the winner was faster (only when sameOff). */
    fasterByMs: number
  } | null
}

export type MissionEndReason = 'domination' | 'rounds' | 'abandoned'

export interface MissionResult {
  reason: MissionEndReason
  /** Seat index of the winner (null = abandoned). */
  winner: number | null
  /** Seat indices, best first (eliminated seats last, the latest out first). */
  ranking: number[]
  /** 1-based place used for the rewards, by seat (knocked-out seats get the last place). */
  places: number[]
  /** ≥ MISSION_REWARD_HUMANS people were dealt in. */
  rewarded: boolean
}

/** Safe to broadcast to everyone in the room (and to the board). */
export interface MissionState {
  code: string
  phase: MissionPhase
  stage: MissionStage | null
  /** In the lobby: everyone seated so far, by seat index. */
  seats: MissionSeat[]
  leaderId: string | null
  botLevel: MissionBotLevel
  options: MissionOptions
  /** Map id (shared/src/missionCampaign.ts). */
  mapId: string
  /** Game number in this room (1-based once started). */
  game: number
  /** Region id → seat index (null = free). Uses the Blitz regions when options.map is 'blitz'. */
  owners: Record<string, number | null>
  /** Capital region id → walls left. */
  walls: Record<string, number>
  /** Capital pick order (seat indices). */
  pickOrder: number[]
  /** Claim round (1-based, stage 'claim'). */
  claimRound: number
  /** Battle round (1-based, stage 'battle'). */
  battleRound: number
  /** Limit of battle rounds (mode 'rounds'; MISSION_DOMINATION_CAP in domination). */
  battleRounds: number
  /** This round's order (snake), and whose move it is. */
  turnOrder: number[]
  activeSeat: number | null
  /** What the active seat may tap now (capital sites, free regions, enemy neighbours). */
  choices: string[]
  /** This claim round's flags so far. */
  wishes: MissionWish[]
  attack: MissionAttack | null
  /** Duels won in a row in this siege turn. */
  siegeWins: number
  question: MissionQuestion | null
  /** Seats that have answered the current question. */
  answered: number[]
  reveal: MissionReveal | null
  tie: MissionTie | null
  /** Time left in the current phase from receipt (0 = no timer). */
  endsInMs: number
  phaseMs: number
  result: MissionResult | null
}

type Ack<T> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void

export interface MissionClientToServerEvents {
  'mission:create': (payload: { name: string; avatar: string; playerId: string; locale: GameLocale }, cb: Ack<{ playerId: string; state: MissionState }>) => void
  /** Join the lobby (a new seat), or REJOIN any time with the same device id. */
  'mission:join': (payload: { code: string; name: string; avatar: string; playerId: string; locale: GameLocale }, cb: Ack<{ playerId: string; state: MissionState }>) => void
  /** The same as join with a known seat, but never takes a new one. */
  'mission:rejoin': (payload: { code: string; name: string; avatar: string; playerId: string; locale: GameLocale }, cb: Ack<{ playerId: string; state: MissionState }>) => void
  /** Read-only board (laptop / TV). */
  'mission:watch': (payload: { code: string }, cb: Ack<{ state: MissionState }>) => void
  'mission:leave': (cb: (ok: boolean) => void) => void
  'mission:locale': (payload: { locale: GameLocale }) => void
  /** Leader, lobby. */
  'mission:addBot': () => void
  'mission:removeBot': (payload: { playerId: string }) => void
  'mission:botLevel': (payload: { level: MissionBotLevel }) => void
  'mission:options': (payload: Partial<MissionOptions>) => void
  'mission:start': () => void
  /** Active seat: a capital site / a free region / an enemy region. */
  'mission:pickCapital': (payload: { region: string }) => void
  'mission:wish': (payload: { region: string }) => void
  'mission:attack': (payload: { region: string }) => void
  /** Seats asked: an answer index 0–3. */
  'mission:answer': (payload: { index: number }) => void
  /** The attacker after a won wall: true = another duel on the same capital, false = end the turn. */
  'mission:continueSiege': (payload: { go: boolean }) => void
  /** Tie-breaker: a number, or a pin. */
  'mission:tieAnswer': (payload: { value?: number; lat?: number; lon?: number }) => void
  /** Leader, phase 'over': back to the lobby with the same seats and options. */
  'mission:again': () => void
}

export interface MissionServerToClientEvents {
  'mission:state': (state: MissionState) => void
  'mission:closed': (reason: string) => void
}

/** The snake (ABBA) order of round `r` (0-based) from the base order. */
export function snakeOrder(base: number[], r: number): number[] {
  return r % 2 === 0 ? [...base] : [...base].reverse()
}
