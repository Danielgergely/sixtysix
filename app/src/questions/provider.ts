import type { Difficulty, Locale, Question, VerseText } from './types'

/**
 * bank.json is generated + verified by question-pipeline/ — do not edit by
 * hand. It's ~0.5 MB, so it loads as its own chunk on first use instead of
 * weighing down app start-up.
 */
export const loadBank = () => import('./bank.json').then((m) => m.default as Question[])

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
const verseCache = new Map<Locale, Promise<Record<string, VerseText>>>()
export function loadVerses(locale: Locale): Promise<Record<string, VerseText>> {
  let p = verseCache.get(locale)
  if (!p) {
    p = VERSE_FILES[locale]().catch((err) => {
      verseCache.delete(locale)
      throw err
    })
    verseCache.set(locale, p)
  }
  return p
}

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
  private bank: Promise<Question[]> | null = null
  private readonly load: () => Promise<Question[]>

  constructor(load: () => Promise<Question[]>) {
    this.load = load
  }

  async getQuestions({ count, difficulty }: GetQuestionsOptions): Promise<Question[]> {
    // Memoise the promise; drop it on failure so a later call can retry.
    this.bank ??= this.load().catch((err) => {
      this.bank = null
      throw err
    })
    const bank = await this.bank
    const pool = difficulty ? bank.filter((q) => q.difficulty === difficulty) : [...bank]
    // Fisher–Yates shuffle, then take the first `count`.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return pool.slice(0, Math.min(count, pool.length))
  }
}

export const bundledBank: QuestionProvider = new BundledBankProvider(loadBank)
