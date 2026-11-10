import { DAY_MS } from './city'

/**
 * Duels at the gate: one player challenges another for a stake of coins, plays
 * five questions at once, and the other plays the same five whenever they
 * accept. The higher score takes both stakes; a tie returns them. Everything
 * is decided on the server (server/src/duels.ts): it picks the questions,
 * times each answer on receipt and shows the right answer only afterwards.
 */

export const DUEL_STAKES = [20, 50, 100] as const
export type DuelStake = (typeof DUEL_STAKES)[number]
export const isDuelStake = (v: unknown): v is DuelStake => DUEL_STAKES.includes(v as DuelStake)

export const DUEL_QUESTIONS = 5
/** An unanswered challenge goes back to the challenger after this long. */
export const DUEL_EXPIRE_MS = 3 * DAY_MS
/** Once accepted, both have at least this long to finish; what is unanswered then scores nothing. */
export const DUEL_FINISH_MS = DAY_MS
/** Open challenges one player may have sent at a time. */
export const DUEL_MAX_OPEN = 5
/** Duels one player may start in a UTC day. */
export const DUEL_PER_DAY = 10
/** A family that won a duel flies a pennant over its house in the city for this long. */
export const DUEL_PENNANT_MS = DAY_MS

/**
 * open = waiting for the challenged player; accepted = both stakes are in;
 * done = settled; declined / expired = the challenger got the stake back.
 */
export type DuelStatus = 'open' | 'accepted' | 'done' | 'declined' | 'expired'

/** One answer as the other side may see it. */
export interface DuelMark {
  right: boolean
  points: number
}

export interface DuelPlayer {
  username: string
  name: string
  avatar: string
}

/** A duel as one of its two players sees it. */
export interface DuelView {
  id: number
  /** Did I send it? */
  mine: boolean
  other: DuelPlayer
  stake: number
  status: DuelStatus
  createdAt: number
  expiresAt: number
  /** My answers so far. */
  me: DuelMark[]
  /** Theirs: only once I have finished my own five, or the duel is over. */
  them: DuelMark[] | null
  /** How many they have answered (never which). */
  themDone: number
  /** Settled: who took the stakes. */
  outcome?: 'won' | 'lost' | 'tie'
  /** A result I haven't looked at yet. */
  unseen?: boolean
}

/** A question on its way to a player: no right answer in it. */
export interface DuelQuestion {
  index: number
  total: number
  text: string
  answers: [string, string, string, string]
  /** Time left to answer, from receipt (no clock sync needed). */
  endsInMs: number
}

/** The reply to an answer: now the right one, the verse and the points. */
export interface DuelReveal {
  index: number
  correct: number
  right: boolean
  points: number
  reference: string
  verse: string
}

/** What a player still has to do in a duel: answer a challenge, or play their questions. */
export const duelTodo = (d: DuelView): 'answer' | 'play' | null =>
  d.status === 'open' ? (d.mine ? (d.me.length < DUEL_QUESTIONS ? 'play' : null) : 'answer') : d.status === 'accepted' && d.me.length < DUEL_QUESTIONS ? 'play' : null

export const duelScore = (marks: DuelMark[]): number => marks.reduce((sum, m) => sum + m.points, 0)
