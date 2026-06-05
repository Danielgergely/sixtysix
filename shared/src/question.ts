export type Locale = 'en' // expand later: 'de' | 'fr' | ...

export type Difficulty = 1 | 2 | 3 | 4 | 5

export type Category =
  | 'torah'
  | 'history'
  | 'wisdom'
  | 'prophets'
  | 'gospels'
  | 'epistles'

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
