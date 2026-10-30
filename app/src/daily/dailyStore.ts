import { create } from 'zustand'
import { DAILY_COINS_PER_CORRECT as COINS_PER_CORRECT, DAILY_PERFECT_BONUS, UNTIMED_XP_PER_CORRECT } from '@sixtysix/shared'
import type { Question } from '../questions/types'
import { loadBank, loadVerses } from '../questions/provider'
import { useGameStore } from '../game/store'
import { playSfx } from '../game/sfx'
import { t, useLocale } from '../i18n'

/**
 * Daily Scroll: five questions per calendar day, the SAME five for everyone
 * (picked by a PRNG seeded with the date), difficulty 1 → 5. One attempt per
 * day; the result can be shared Wordle-style. Consecutive days build a streak.
 */

const KEY = 'sixtysix.daily.v1'
const COUNT = 5

interface Saved {
  /** YYYY-MM-DD the picks belong to. */
  date: string
  picks: number[]
  /** Last day completed and the run of consecutive days ending there. */
  streakDate: string
  streak: number
}

/** Local calendar day — a "day" follows the player's clock, like Wordle. */
export function today(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function yesterdayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return today(new Date(y, m - 1, d - 1))
}

/** Day number since launch — shown in the share text ("Daily Scroll #12"). */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(2026, 9, 29)) / 86_400_000) + 1
}

/** mulberry32 — tiny deterministic PRNG. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(s: string): number {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

/** One question per difficulty 1..5, chosen the same way on every device. */
export function pickDaily(bank: Question[], date: string): Question[] {
  const rand = rng(hash(`66-daily-${date}`))
  // Sort by id first so the result doesn't depend on bank order.
  const sorted = [...bank].sort((a, b) => a.id.localeCompare(b.id))
  return [1, 2, 3, 4, 5].map((d) => {
    const pool = sorted.filter((q) => q.difficulty === d)
    return pool[Math.floor(rand() * pool.length)]
  })
}

function load(): Saved {
  const fresh: Saved = { date: today(), picks: [], streakDate: '', streak: 0 }
  try {
    const raw = localStorage.getItem(KEY)
    const s = raw ? ({ ...fresh, ...JSON.parse(raw) } as Saved) : fresh
    if (!Array.isArray(s.picks)) s.picks = []
    // A new day: keep the streak record, drop yesterday's answers.
    return s.date === today() ? s : { ...s, date: today(), picks: [] }
  } catch {
    return fresh
  }
}

function save(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage unavailable — the day still works, it just won't be remembered
  }
}

interface DailyStore {
  saved: Saved
  questions: Question[]
  loading: boolean
  /** Coins earned today (shown on the result). */
  coins: number
  open: () => Promise<void>
  answer: (index: number) => void
}

export const useDailyStore = create<DailyStore>((set, get) => ({
  saved: load(),
  questions: [],
  loading: false,
  coins: 0,

  open: async () => {
    if (get().loading) return
    set({ loading: true })
    const saved = load()
    let bank: Question[]
    try {
      ;[bank] = await Promise.all([loadBank(), loadVerses(useLocale.getState().locale)])
    } catch {
      // Chunk failed to load (offline web build) — tapping again retries.
      set({ loading: false })
      return
    }
    const questions = pickDaily(bank, saved.date)
    const coins = saved.picks.reduce((n, p, i) => n + (p === questions[i]?.correctIndex ? COINS_PER_CORRECT : 0), 0)
    set({ saved, questions, loading: false, coins: saved.picks.length === COUNT && coins === COUNT * COINS_PER_CORRECT ? coins + DAILY_PERFECT_BONUS : coins })
    // Only from the Quiz tab — don't yank the player out of whatever they opened meanwhile.
    if (useGameStore.getState().screen === 'menu') useGameStore.getState().goTo('daily')
  },

  answer: (index) => {
    const { saved, questions, coins } = get()
    const i = saved.picks.length
    const q = questions[i]
    if (!q || i >= COUNT) return
    const correct = index === q.correctIndex
    const picks = [...saved.picks, index]
    let earned = correct ? COINS_PER_CORRECT : 0
    let { streak, streakDate } = saved
    if (picks.length === COUNT) {
      const perfect = picks.every((p, k) => p === questions[k].correctIndex)
      if (perfect) earned += DAILY_PERFECT_BONUS
      if (streakDate !== saved.date) {
        streak = streakDate === yesterdayOf(saved.date) ? streak + 1 : 1
        streakDate = saved.date
      }
    }
    const next = { ...saved, picks, streak, streakDate }
    save(next)
    if (earned) useGameStore.getState().addCoins(earned, correct ? UNTIMED_XP_PER_CORRECT : 0)
    playSfx(correct ? 'correct' : 'wrong')
    set({ saved: next, coins: coins + earned })
  },
}))

export const DAILY_COUNT = COUNT

/** "Daily Scroll #12 🟩🟩🟥🟩🟩 4/5 · 🔥3" */
export function shareText(saved: Saved, questions: Question[]): string {
  const squares = saved.picks.map((p, i) => (p === questions[i]?.correctIndex ? '🟩' : '🟥')).join('')
  const right = saved.picks.filter((p, i) => p === questions[i]?.correctIndex).length
  return `${t('daily.shareTitle', { n: dayNumber(saved.date) })}\n${squares} ${right}/${COUNT}${saved.streak > 1 ? t('daily.shareStreak', { count: saved.streak }) : ''}`
}
