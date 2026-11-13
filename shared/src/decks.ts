import type { AnswerSet, Locale } from './question'
import { isNameAllowed, isTextAllowed } from './nameFilter'

/** Player-made question decks for Bible Blitz (server/src/decks.ts). */
export interface DeckQuestion {
  text: string
  answers: AnswerSet
  correct: 0 | 1 | 2 | 3
}

export interface DeckSummary {
  id: string
  title: string
  lang: Locale
  /** true = listed in the community decks; false = only whoever has the deck (its owner) can host it. */
  public: boolean
  count: number
  author: string
  plays: number
}

export interface Deck extends DeckSummary {
  questions: DeckQuestion[]
  mine: boolean
}

export const DECK_MIN_QUESTIONS = 3
export const DECK_MAX_QUESTIONS = 50
export const DECK_MAX_PER_USER = 30
export const DECK_TITLE_MAX = 60
export const DECK_TEXT_MAX = 200
export const DECK_ANSWER_MAX = 80
export const DECK_ID = /^[A-Za-z0-9]{10}$/

/** The first problem with a deck (English, translated by the app's tServer), or null. */
export function deckProblem(title: string, questions: DeckQuestion[], isPublic: boolean, lang: Locale): string | null {
  if (!title.trim()) return 'Give your deck a title.'
  if (!isNameAllowed(title)) return 'Please choose another title.'
  if (questions.length < DECK_MIN_QUESTIONS) return `A deck needs at least ${DECK_MIN_QUESTIONS} questions.`
  if (questions.length > DECK_MAX_QUESTIONS) return `A deck can have at most ${DECK_MAX_QUESTIONS} questions.`
  for (const q of questions) {
    if (!q.text.trim() || q.answers.some((a) => !a.trim())) return 'Every question needs a text and 4 answers.'
    if (isPublic && ![q.text, ...q.answers].every((x) => isTextAllowed(x, lang))) return 'Some words are not allowed in community decks.'
  }
  return null
}
