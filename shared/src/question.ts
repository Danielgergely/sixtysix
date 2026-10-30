/** Languages the questions (and the app) come in; English is always complete. */
export type Locale = 'en' | 'de' | 'hu'
export const LOCALE_IDS: readonly Locale[] = ['en', 'de', 'hu']
export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALE_IDS as readonly string[]).includes(v)

export type Difficulty = 1 | 2 | 3 | 4 | 5

export type Category =
  | 'torah'
  | 'history'
  | 'wisdom'
  | 'prophets'
  | 'gospels'
  | 'epistles'

export const CATEGORIES: readonly Category[] = ['torah', 'history', 'wisdom', 'prophets', 'gospels', 'epistles']

export type AnswerSet = [string, string, string, string]

export interface Question {
  id: string
  /** Verse reference, e.g. "1 Samuel 17:50" — ground truth for verification. */
  reference: string
  difficulty: Difficulty
  category: Category
  /** i18n-ready from day one; 'en' is always present. */
  text: Partial<Record<Locale, string>> & { en: string }
  answers: Partial<Record<Locale, AnswerSet>> & { en: AnswerSet }
  correctIndex: 0 | 1 | 2 | 3
}

/** A question's text and answers in `locale`, English where it has none. */
export function questionIn(q: Pick<Question, 'text' | 'answers'>, locale: Locale): { text: string; answers: AnswerSet } {
  return { text: q.text[locale] ?? q.text.en, answers: q.answers[locale] ?? q.answers.en }
}

/** The cited verse in one language: its reference written that language's way ("1. Mose 2,22") and the text. */
export interface VerseText {
  ref: string
  text: string
}
