import type { AnswerSet, Locale, Question, VerseText } from './question'

/**
 * Question flags: a player reports a question as wrong or unclear. The server
 * keeps them (server/src/flags.ts); a question with an 'open' or 'confirmed'
 * flag is out of play everywhere until it is dismissed or fixed in the pipeline.
 */

export const FLAG_REASONS = ['answer', 'reference', 'translation', 'unclear', 'other'] as const
export type FlagReason = (typeof FLAG_REASONS)[number]
export const isFlagReason = (v: unknown): v is FlagReason => typeof v === 'string' && (FLAG_REASONS as readonly string[]).includes(v)

export const FLAG_STATUSES = ['open', 'confirmed', 'dismissed', 'fixed'] as const
export type FlagStatus = (typeof FLAG_STATUSES)[number]

export const FLAG_COMMENT_MAX = 500
/** Flags one address may send per day. */
export const FLAGS_PER_DAY = 20

/** The question as the player saw it: their language's text and answers. */
export interface FlagShown {
  text: string
  answers: AnswerSet
}

/** POST /api/flags */
export interface FlagRequest {
  questionId: string
  locale: Locale
  reason: FlagReason
  comment: string
  shown: FlagShown
}

/** One flag in the admin review list. `username` null = a guest. */
export interface AdminFlag {
  id: number
  reason: FlagReason
  comment: string
  locale: Locale
  shown: FlagShown | null
  createdAt: number
  username: string | null
  status: FlagStatus
  resolvedAt: number | null
  resolvedBy: string | null
  note: string
}

/** Every flag of one question, with the question in all languages (null when it left the bank). */
export interface AdminFlagGroup {
  questionId: string
  question: Question | null
  /** The cited verse per language (English reference = the question's own). */
  verses: Partial<Record<Locale, VerseText>>
  /** Newest first. */
  flags: AdminFlag[]
  /** When the newest flag came in. */
  latestAt: number
}

export type FlagResolveAction = 'dismiss' | 'confirm'
