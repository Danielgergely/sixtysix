import type { Difficulty, Locale, Question, VerseText } from './types'
import { loadExclusions } from '../flags/flagStore'

/** One load per language, shared by every caller; a failed load is forgotten so the next call retries. */
function cachedPerLocale<T>(load: Record<Locale, () => Promise<T>>): (locale: Locale) => Promise<T> {
  const cache = new Map<Locale, Promise<T>>()
  return (locale) => {
    let p = cache.get(locale)
    if (!p) {
      p = load[locale]().catch((err) => {
        cache.delete(locale)
        throw err
      })
      cache.set(locale, p)
    }
    return p
  }
}

/**
 * bank.json is generated + verified by question-pipeline/ — do not edit by
 * hand. The app loads bank.<locale>.json instead: the same questions with
 * only that language and English (several MB for all three), each its own
 * chunk loaded on first use instead of weighing down app start-up.
 */
const BANK_FILES: Record<Locale, () => Promise<Question[]>> = {
  en: () => import('./bank.en.json').then((m) => m.default as Question[]),
  de: () => import('./bank.de.json').then((m) => m.default as Question[]),
  hu: () => import('./bank.hu.json').then((m) => m.default as Question[]),
}
export const loadBank = cachedPerLocale(BANK_FILES)

/**
 * Cited verse per question id in one language — each its own lazy chunk.
 * English (WEB) is bare text: its reference is the question's own.
 */
const VERSE_FILES: Record<Locale, () => Promise<Record<string, VerseText>>> = {
  en: () =>
    import('./verses.json').then((m) =>
      Object.fromEntries(Object.entries(m.default as Record<string, string>).map(([id, text]) => [id, { ref: '', text }])),
    ),
  de: () => import('./verses.de.json').then((m) => m.default as Record<string, VerseText>),
  hu: () => import('./verses.hu.json').then((m) => m.default as Record<string, VerseText>),
}
export const loadVerses = cachedPerLocale(VERSE_FILES)

export interface GetQuestionsOptions {
  count: number
  locale: Locale
  /** Omit for a mixed-difficulty set. */
  difficulty?: Difficulty
}

/**
 * Abstraction over where questions come from (PLAN.md §3).
 * MVP: BundledBankProvider. Future: OnDeviceLLMProvider for single-player
 * practice mode — multiplayer always uses the shared bank.
 */
export interface QuestionProvider {
  getQuestions(opts: GetQuestionsOptions): Promise<Question[]>
}

export class BundledBankProvider implements QuestionProvider {
  private readonly load: (locale: Locale) => Promise<Question[]>

  constructor(load: (locale: Locale) => Promise<Question[]>) {
    this.load = load
  }

  async getQuestions({ count, locale, difficulty }: GetQuestionsOptions): Promise<Question[]> {
    // Flagged questions (open or confirmed on the server, or flagged on this device) are out of play.
    const [bank, excluded] = await Promise.all([this.load(locale), loadExclusions()])
    // Without a level: everything but the impossible ones (Bible Blitz is a family race).
    const pool = bank.filter((q) => !excluded.has(q.id) && (difficulty ? q.difficulty === difficulty : q.difficulty <= 4))
    // Fisher–Yates shuffle, then take the first `count`.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return pool.slice(0, Math.min(count, pool.length))
  }
}

export const bundledBank: QuestionProvider = new BundledBankProvider(loadBank)
