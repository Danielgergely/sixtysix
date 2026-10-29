import { create } from 'zustand'
import { PRACTICE_COINS_PER_CORRECT, type Category, type DifficultyPreset } from '@sixtysix/shared'
import type { Question } from '../questions/types'
import { loadBank, loadVerses } from '../questions/provider'
import { useGameStore } from '../game/store'
import { playSfx } from '../game/sfx'

/**
 * Practice: solo, untimed, endless. Missed questions are remembered on the
 * device and come back — a few questions later in this session, and in
 * future sessions until answered correctly.
 */

const MISSED_KEY = 'sixtysix.practiceMissed.v1'
/** A question missed this session reappears this many questions later. */
const RETRY_AFTER = 4
/** Share of picks drawn from the saved "missed" list when it has eligible items. */
const MISSED_SHARE = 0.3
const DIFFICULTY_RANGE: Record<DifficultyPreset, [number, number]> = { easy: [1, 2], mixed: [1, 5], hard: [3, 5] }

function loadMissed(): string[] {
  try {
    const raw = localStorage.getItem(MISSED_KEY)
    const ids: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function saveMissed(ids: string[]): void {
  try {
    localStorage.setItem(MISSED_KEY, JSON.stringify(ids.slice(-300)))
  } catch {
    // storage full / unavailable — practice still works, just forgets
  }
}

export interface PracticeTally {
  answered: number
  correct: number
}

interface PracticeStore {
  categories: Category[]
  difficulty: DifficultyPreset
  /** Saved missed ids (all sessions). */
  missed: string[]
  /** true while the bank chunk loads. */
  loading: boolean

  question: Question | null
  verse: string
  /** Picked answer for the current question, null until answered. */
  picked: number | null
  streak: number
  coins: number
  tally: PracticeTally
  byCategory: Partial<Record<Category, PracticeTally>>
  /** Only replay saved misses (the "Review mistakes" entry point). */
  reviewOnly: boolean
  finished: boolean

  setCategories: (c: Category[]) => void
  setDifficulty: (d: DifficultyPreset) => void
  start: (opts?: { reviewOnly?: boolean }) => Promise<void>
  answer: (index: number) => void
  next: () => void
  finish: () => void
}

// Session-only bookkeeping, outside React state.
let bank: Question[] = []
let verses: Record<string, string> = {}
let seen = new Set<string>()
let retryQueue: Array<{ id: string; at: number }> = []
let served = 0

function eligible(q: Question, cats: Category[], difficulty: DifficultyPreset): boolean {
  const [min, max] = DIFFICULTY_RANGE[difficulty]
  return q.difficulty >= min && q.difficulty <= max && (cats.length === 0 || cats.includes(q.category))
}

function pickNext(state: PracticeStore): Question | null {
  const { categories, difficulty, missed, reviewOnly } = state
  // 1. a question missed earlier this session whose turn has come
  const due = retryQueue.findIndex((r) => r.at <= served)
  if (due >= 0) {
    const [r] = retryQueue.splice(due, 1)
    const q = bank.find((b) => b.id === r.id)
    if (q) return q
  }
  // 2. saved misses from earlier sessions
  const savedPool = bank.filter((q) => missed.includes(q.id) && !seen.has(q.id))
  if (reviewOnly) return savedPool[Math.floor(Math.random() * savedPool.length)] ?? null
  if (savedPool.length && Math.random() < MISSED_SHARE) {
    const fromMissed = savedPool.filter((q) => eligible(q, categories, difficulty))
    if (fromMissed.length) return fromMissed[Math.floor(Math.random() * fromMissed.length)]
  }
  // 3. fresh question; once everything was seen, start over
  let pool = bank.filter((q) => eligible(q, categories, difficulty) && !seen.has(q.id))
  if (pool.length === 0) {
    seen = new Set()
    pool = bank.filter((q) => eligible(q, categories, difficulty))
  }
  return pool[Math.floor(Math.random() * pool.length)] ?? null
}

export const usePracticeStore = create<PracticeStore>((set, get) => ({
  categories: [],
  difficulty: 'mixed',
  missed: loadMissed(),
  loading: false,
  question: null,
  verse: '',
  picked: null,
  streak: 0,
  coins: 0,
  tally: { answered: 0, correct: 0 },
  byCategory: {},
  reviewOnly: false,
  finished: false,

  setCategories: (categories) => set({ categories }),
  setDifficulty: (difficulty) => set({ difficulty }),

  start: async ({ reviewOnly = false } = {}) => {
    set({ loading: true })
    if (!bank.length) [bank, verses] = await Promise.all([loadBank(), loadVerses()])
    seen = new Set()
    retryQueue = []
    served = 0
    set({ loading: false, reviewOnly, streak: 0, coins: 0, tally: { answered: 0, correct: 0 }, byCategory: {}, finished: false })
    useGameStore.getState().goTo('practice')
    get().next()
  },

  answer: (index) => {
    const { question, picked, tally, byCategory, missed, streak, coins } = get()
    if (!question || picked !== null) return
    const correct = index === question.correctIndex
    const cat = byCategory[question.category] ?? { answered: 0, correct: 0 }
    let nextMissed = missed
    if (correct) {
      nextMissed = missed.filter((id) => id !== question.id)
    } else {
      if (!missed.includes(question.id)) nextMissed = [...missed, question.id]
      retryQueue.push({ id: question.id, at: served + RETRY_AFTER })
    }
    if (nextMissed !== missed) saveMissed(nextMissed)
    const earned = correct ? PRACTICE_COINS_PER_CORRECT : 0
    if (earned) useGameStore.getState().addCoins(earned)
    playSfx(correct ? 'correct' : 'wrong')
    set({
      picked: index,
      missed: nextMissed,
      streak: correct ? streak + 1 : 0,
      coins: coins + earned,
      tally: { answered: tally.answered + 1, correct: tally.correct + (correct ? 1 : 0) },
      byCategory: { ...byCategory, [question.category]: { answered: cat.answered + 1, correct: cat.correct + (correct ? 1 : 0) } },
    })
  },

  next: () => {
    const q = pickNext(get())
    if (!q) {
      set({ finished: true, question: null })
      return
    }
    seen.add(q.id)
    served++
    set({ question: q, verse: verses[q.id] ?? '', picked: null })
  },

  finish: () => set({ finished: true }),
}))
