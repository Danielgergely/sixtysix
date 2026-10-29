import type { Difficulty, Locale, Question } from './types'

/**
 * bank.json is generated + verified by question-pipeline/ — do not edit by
 * hand. It's ~0.5 MB, so it loads as its own chunk on first use instead of
 * weighing down app start-up.
 */
export const loadBank = () => import('./bank.json').then((m) => m.default as Question[])

/** Cited verse text (WEB) per question id — also its own lazy chunk. */
export const loadVerses = () => import('./verses.json').then((m) => m.default as Record<string, string>)

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
