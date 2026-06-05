import type { Difficulty, Locale, Question } from './types'
import bankJson from './bank.json'

/** Generated + verified by question-pipeline/ — do not edit by hand. */
const BANK = bankJson as Question[]

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
  private readonly bank: Question[]

  constructor(bank: Question[]) {
    this.bank = bank
  }

  async getQuestions({ count, difficulty }: GetQuestionsOptions): Promise<Question[]> {
    const pool = difficulty
      ? this.bank.filter((q) => q.difficulty === difficulty)
      : [...this.bank]
    // Fisher–Yates shuffle, then take the first `count`.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return pool.slice(0, Math.min(count, pool.length))
  }
}

export const bundledBank: QuestionProvider = new BundledBankProvider(BANK)
