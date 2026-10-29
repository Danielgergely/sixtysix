import { create } from 'zustand'
import { GIFT_IDS, giftLoadout, type GiftId, type GiftMode } from '@sixtysix/shared'
import { getMyRanks } from './mySkills'

/**
 * Scholar quiz gifts for one game (docs/skill-tree.md §3): Bible Blitz and
 * Practice only, never the arena or the Daily Scroll. Uses per game come from
 * the account's skill ranks (guests have none). This store holds the uses
 * left and the current question's effects; the game stores apply the
 * mode-specific parts (extra time, double points, the retry).
 */

const NONE = Object.fromEntries(GIFT_IDS.map((g) => [g, 0])) as Record<GiftId, number>

interface QuestionEffects {
  /** Answer indexes taken out of the hand (50/50, a retried wrong card). */
  removed: number[]
  /** Gifts used on this question. */
  used: GiftId[]
}

interface GiftStore extends QuestionEffects {
  mode: GiftMode | null
  /** Uses at the start of the game and uses left. */
  total: Record<GiftId, number>
  uses: Record<GiftId, number>
  steadfast: boolean
  steadfastUsed: boolean
  /** Wisdom of Solomon's extra gift this game. */
  bonus?: GiftId
  /** Last gift used, for the burst animation and the short note. */
  flash: { id: GiftId | 'steadfast' | 'solomon'; key: number } | null

  /** A new game: load the uses from the account's skills. */
  start: (mode: GiftMode) => void
  /** Leave the game: no gifts outside Blitz / Practice. */
  stop: () => void
  newQuestion: () => void
  /** Spend one use of an active gift on this question; `correctIndex` picks the 50/50 cards. */
  spend: (id: GiftId, correctIndex: number) => boolean
  /** Seventy times seven: a wrong card goes back once per game. True = the answer doesn't count. */
  retry: (index: number, correctIndex: number) => boolean
  /** Steadfast: true once per game, the first time a wrong answer would break the streak. */
  keepStreak: () => boolean
  isOn: (id: GiftId) => boolean
}

export const useGiftStore = create<GiftStore>((set, get) => ({
  mode: null,
  total: NONE,
  uses: NONE,
  steadfast: false,
  steadfastUsed: false,
  flash: null,
  removed: [],
  used: [],

  start: (mode) => {
    const ranks = getMyRanks()
    const loadout = ranks ? giftLoadout(ranks, mode) : { uses: NONE, steadfast: false, bonus: undefined }
    set({
      mode,
      total: { ...loadout.uses },
      uses: { ...loadout.uses },
      steadfast: loadout.steadfast,
      steadfastUsed: false,
      bonus: loadout.bonus,
      flash: loadout.bonus ? { id: 'solomon', key: Date.now() } : null,
      removed: [],
      used: [],
    })
  },

  stop: () => set({ mode: null, total: NONE, uses: NONE, steadfast: false, removed: [], used: [], flash: null, bonus: undefined }),

  newQuestion: () => set({ removed: [], used: [] }),

  spend: (id, correctIndex) => {
    const { uses, used, removed, mode } = get()
    if (!mode || uses[id] <= 0 || used.includes(id) || id === 'retry') return false
    let nextRemoved = removed
    if (id === 'fifty') {
      const wrong = [0, 1, 2, 3].filter((i) => i !== correctIndex && !removed.includes(i)).sort(() => Math.random() - 0.5)
      if (wrong.length < 2) return false
      nextRemoved = [...removed, ...wrong.slice(0, 2)]
    }
    set({ uses: { ...uses, [id]: uses[id] - 1 }, used: [...used, id], removed: nextRemoved, flash: { id, key: Date.now() } })
    return true
  },

  retry: (index, correctIndex) => {
    const { uses, removed, mode } = get()
    if (!mode || index === correctIndex || uses.retry <= 0) return false
    set({ uses: { ...uses, retry: uses.retry - 1 }, removed: [...removed, index], flash: { id: 'retry', key: Date.now() } })
    return true
  },

  keepStreak: () => {
    const { steadfast, steadfastUsed, mode } = get()
    if (!mode || !steadfast || steadfastUsed) return false
    set({ steadfastUsed: true, flash: { id: 'steadfast', key: Date.now() } })
    return true
  },

  isOn: (id) => get().used.includes(id),
}))
