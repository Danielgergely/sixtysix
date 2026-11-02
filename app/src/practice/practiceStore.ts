import { create } from 'zustand'
import { difficultyRange, UNTIMED_XP_PER_CORRECT, coinsForAnswer, type Category, type DifficultyPreset, type GiftId } from '@sixtysix/shared'
import type { Question } from '../questions/types'
import { loadBank, loadVerses } from '../questions/provider'
import { useLocale } from '../i18n'
import { useGameStore } from '../game/store'
import { playSfx } from '../game/sfx'
import { useGiftStore } from '../skills/giftStore'
import { excludedNow, loadExclusions } from '../flags/flagStore'

/**
 * Practice: solo, untimed, endless. Missed questions are remembered on the
 * device and come back — a few questions later in this session, and in
 * future sessions until answered correctly.
 */

const MISSED_KEY = 'sixtysix.practiceMissed.v1'
/** A question missed this session reappears this many questions later. */
const RETRY_AFTER = 4
/**
 * A missed question (this session's or a saved one) is at most every this many
 * questions: someone who misses everything still gets fresh ones in between, so
 * the pool keeps growing instead of cycling the same few.
 */
const MISS_SPACING = 4
/** Share of picks drawn from the saved "missed" list when it has eligible items. */
const MISSED_SHARE = 0.3

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
  /** Mixed only: also the impossible (level 5) questions. */
  withImpossible: boolean
  /** Saved missed ids (all sessions). */
  missed: string[]
  /** true while the bank chunk loads. */
  loading: boolean

  question: Question | null
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
  setWithImpossible: (on: boolean) => void
  start: (opts?: { reviewOnly?: boolean }) => Promise<void>
  answer: (index: number) => void
  next: () => void
  finish: () => void
  /** Play a Scholar gift on the current question (skills/giftStore.ts). */
  playGift: (id: GiftId) => void
}

// Session-only bookkeeping, outside React state.
let bank: Question[] = []
let seen = new Set<string>()
let retryQueue: Array<{ id: string; at: number }> = []
let served = 0
/** `served` when the last missed question came back (-Infinity: none yet). */
let lastMissAt = -Infinity

function eligible(q: Question, cats: Category[], difficulty: DifficultyPreset, withImpossible: boolean): boolean {
  const [min, max] = difficultyRange(difficulty, withImpossible)
  return q.difficulty >= min && q.difficulty <= max && (cats.length === 0 || cats.includes(q.category))
}

function pickNext(state: PracticeStore): Question | null {
  const { categories, difficulty, withImpossible, missed, reviewOnly } = state
  // Flagged questions are out of play, even one flagged a moment ago.
  const out = excludedNow()
  retryQueue = retryQueue.filter((r) => !out.has(r.id))
  // Review mode is only misses; otherwise a missed one at most every MISS_SPACING questions.
  const missTurn = reviewOnly || served - lastMissAt >= MISS_SPACING
  const backAgain = (q: Question) => {
    lastMissAt = served
    return q
  }
  // 1. a question missed earlier this session whose turn has come (the one waiting longest)
  const due = missTurn ? retryQueue.findIndex((r) => r.at <= served) : -1
  if (due >= 0) {
    const [r] = retryQueue.splice(due, 1)
    const q = bank.find((b) => b.id === r.id)
    if (q) return backAgain(q)
  }
  // 2. saved misses from earlier sessions
  const savedPool = bank.filter((q) => missed.includes(q.id) && !seen.has(q.id) && !out.has(q.id))
  if (reviewOnly) {
    if (savedPool.length) return savedPool[Math.floor(Math.random() * savedPool.length)]
    // Nothing new left: bring back this session's misses early instead of ending
    // while the screen still promises "it comes back later". Ends once all are mended.
    const [r] = retryQueue.splice(0, 1)
    return r ? (bank.find((b) => b.id === r.id) ?? null) : null
  }
  if (missTurn && savedPool.length && Math.random() < MISSED_SHARE) {
    const fromMissed = savedPool.filter((q) => eligible(q, categories, difficulty, withImpossible))
    if (fromMissed.length) return backAgain(fromMissed[Math.floor(Math.random() * fromMissed.length)])
  }
  // 3. fresh question; once everything was seen, start over
  let pool = bank.filter((q) => eligible(q, categories, difficulty, withImpossible) && !seen.has(q.id) && !out.has(q.id))
  if (pool.length === 0) {
    seen = new Set()
    pool = bank.filter((q) => eligible(q, categories, difficulty, withImpossible) && !out.has(q.id))
  }
  return pool[Math.floor(Math.random() * pool.length)] ?? null
}

export const usePracticeStore = create<PracticeStore>((set, get) => ({
  categories: [],
  difficulty: 'mixed',
  withImpossible: false,
  missed: loadMissed(),
  loading: false,
  question: null,
  picked: null,
  streak: 0,
  coins: 0,
  tally: { answered: 0, correct: 0 },
  byCategory: {},
  reviewOnly: false,
  finished: false,

  setCategories: (categories) => set({ categories }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setWithImpossible: (withImpossible) => set({ withImpossible }),

  start: async ({ reviewOnly = false } = {}) => {
    if (get().loading) return
    set({ loading: true })
    try {
      // The out-of-play list is refreshed along (the cached one covers offline play).
      // Reloaded per start: cached per language, so a language switch picks up the new one.
      const [loaded] = await Promise.all([loadBank(useLocale.getState().locale), loadVerses(useLocale.getState().locale), loadExclusions()])
      bank = loaded
    } catch {
      // Chunk failed to load (offline web build) — let the player try again.
      set({ loading: false })
      return
    }
    // The player went back while the bank was loading.
    if (useGameStore.getState().screen !== 'practiceSetup') return set({ loading: false })
    seen = new Set()
    retryQueue = []
    served = 0
    lastMissAt = -Infinity
    set({ loading: false, reviewOnly, streak: 0, coins: 0, tally: { answered: 0, correct: 0 }, byCategory: {}, finished: false })
    useGameStore.getState().goTo('practice')
    useGiftStore.getState().start('practice')
    get().next()
  },

  answer: (index) => {
    const { question, picked, tally, byCategory, missed, streak, coins } = get()
    if (!question || picked !== null) return
    const gifts = useGiftStore.getState()
    if (gifts.removed.includes(index)) return
    // Seventy times seven: a wrong card goes away once per session; pick again.
    if (gifts.retry(index, question.correctIndex)) {
      playSfx('wrong')
      return
    }
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
    // Double portion: this answer pays twice.
    const times = gifts.used.includes('double') ? 2 : 1
    const earned = coinsForAnswer(correct, 0, 'practice') * times
    if (earned) useGameStore.getState().addCoins(earned, UNTIMED_XP_PER_CORRECT * times)
    // Steadfast: the first wrong answer of the session keeps the streak.
    const keep = !correct && streak > 0 && gifts.keepStreak()
    playSfx(correct ? 'correct' : 'wrong')
    set({
      picked: index,
      missed: nextMissed,
      streak: correct || keep ? streak + (correct ? 1 : 0) : 0,
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
    useGiftStore.getState().newQuestion()
    set({ question: q, picked: null })
  },

  finish: () => {
    useGiftStore.getState().stop()
    set({ finished: true })
  },

  playGift: (id) => {
    const { question, picked } = get()
    if (!question || picked !== null) return
    if (useGiftStore.getState().spend(id, question.correctIndex)) playSfx('flip')
  },
}))
