import { create } from 'zustand'
import { FLOCK_CATEGORIES, type FlockCategory, type FlockWord, type FlockWordList } from '@sixtysix/shared'

/**
 * Wolf in the Flock, one phone passed around the table (like Splash's Imposter).
 * Everything is local: no server, no word checking — the group talks it out
 * and the phone only deals the cards and reveals the wolves. No rewards.
 */

export const LOCAL_MIN_PLAYERS = 3
export const LOCAL_MAX_PLAYERS = 20
export const LOCAL_MAX_WOLVES = 3
export const LOCAL_TIMER_OPTIONS = [0, 3, 5] as const

/** Suggested wolves: 1 for 3–6 players, 2 for 7–12, 3 from 13. */
export const suggestedWolves = (players: number): number => (players >= 13 ? 3 : players >= 7 ? 2 : 1)
/** Wolves must stay a minority. */
export const maxWolves = (players: number): number => Math.max(1, Math.min(LOCAL_MAX_WOLVES, Math.ceil(players / 2) - 1))

export interface LocalSetup {
  players: string[]
  wolves: number
  /** false = follow the suggestion as players are added. */
  wolvesChosen: boolean
  categories: FlockCategory[]
  /** Wolves see the word's hint word (Jonah → "Sea"). */
  wolfHint: boolean
  /** Discussion timer in minutes (0 = none). */
  timerMin: number
}

export type LocalPhase = 'setup' | 'deal' | 'play' | 'reveal'

interface LocalStore {
  setup: LocalSetup
  phase: LocalPhase
  word: FlockWord | null
  category: FlockCategory | null
  /** Indices into setup.players. */
  wolves: number[]
  /** Deal: whose turn to peek (index into setup.players). */
  dealIdx: number
  /** Deal: the current player has looked at their card. */
  seen: boolean
  starter: number
  /** Date.now()-based end of the discussion timer (0 = none). */
  endsAt: number
  /** Round-by-round tally for this group (reset with "Clear"). */
  tally: { flock: number; wolves: number }
  /** This round's tally is recorded (one tap per round). */
  tallied: boolean
  error: string | null

  updateSetup: (patch: Partial<LocalSetup>) => void
  start: () => Promise<void>
  peeked: () => void
  next: () => void
  reveal: () => void
  record: (winner: 'flock' | 'wolves') => void
  newWord: () => Promise<void>
  toSetup: () => void
  clearTally: () => void
}

const SETUP_KEY = 'sixtysix.flockLocal.v1'
const DEFAULT_SETUP: LocalSetup = { players: [], wolves: 1, wolvesChosen: false, categories: [...FLOCK_CATEGORIES], wolfHint: true, timerMin: 0 }

function loadSetup(): LocalSetup {
  try {
    const raw = JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null') as Partial<LocalSetup> | null
    if (!raw) return DEFAULT_SETUP
    const categories = (raw.categories ?? []).filter((c): c is FlockCategory => (FLOCK_CATEGORIES as readonly string[]).includes(c))
    return {
      ...DEFAULT_SETUP,
      ...raw,
      players: Array.isArray(raw.players) ? raw.players.filter((p) => typeof p === 'string').slice(0, LOCAL_MAX_PLAYERS) : [],
      categories: categories.length ? categories : DEFAULT_SETUP.categories,
    }
  } catch {
    return DEFAULT_SETUP
  }
}

function saveSetup(setup: LocalSetup): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup))
  } catch {
    // storage unavailable — the setup just isn't remembered
  }
}

let words: Promise<FlockWordList> | null = null
const loadWords = () => (words ??= import('@sixtysix/shared/flockWords.json').then((m) => m.default as FlockWordList))

const shuffle = <T,>(xs: T[]): T[] => {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]

/** Words already dealt to this group (avoid repeats until a category runs out). */
const used = new Set<string>()

export const useLocalFlock = create<LocalStore>((set, get) => {
  /** Deal a new word and new wolves (not last round's wolves when there are enough others). */
  const deal = async () => {
    const { setup, wolves: prev } = get()
    const list = await loadWords()
    const category = pick(setup.categories)
    let pool = list[category].filter((w) => !used.has(w.word))
    if (pool.length === 0) {
      for (const w of list[category]) used.delete(w.word)
      pool = list[category]
    }
    const word = pick(pool)
    used.add(word.word)
    const everyone = setup.players.map((_, i) => i)
    const fresh = everyone.filter((i) => !prev.includes(i))
    const wolves = shuffle(fresh.length >= setup.wolves ? fresh : everyone).slice(0, setup.wolves)
    set({
      phase: 'deal',
      word,
      category,
      wolves,
      dealIdx: 0,
      seen: false,
      starter: Math.floor(Math.random() * setup.players.length),
      endsAt: 0,
      tallied: false,
      error: null,
    })
  }

  return {
    setup: loadSetup(),
    phase: 'setup',
    word: null,
    category: null,
    wolves: [],
    dealIdx: 0,
    seen: false,
    starter: 0,
    endsAt: 0,
    tally: { flock: 0, wolves: 0 },
    tallied: false,
    error: null,

    updateSetup: (patch) => {
      const next = { ...get().setup, ...patch }
      const n = next.players.length
      if (!next.wolvesChosen) next.wolves = suggestedWolves(n)
      next.wolves = Math.min(Math.max(1, next.wolves), maxWolves(n))
      saveSetup(next)
      set({ setup: next, error: null })
    },

    start: async () => {
      const { setup } = get()
      if (setup.players.length < LOCAL_MIN_PLAYERS) return set({ error: `At least ${LOCAL_MIN_PLAYERS} players` })
      if (setup.categories.length === 0) return set({ error: 'Pick at least one category' })
      // Last round's wolves still sit out when possible, even after a setup change.
      set({ wolves: get().wolves.filter((i) => i < setup.players.length) })
      await deal()
    },

    peeked: () => set({ seen: true }),

    next: () => {
      const { dealIdx, setup, seen } = get()
      if (!seen) return
      if (dealIdx + 1 < setup.players.length) return set({ dealIdx: dealIdx + 1, seen: false })
      set({ phase: 'play', endsAt: setup.timerMin ? Date.now() + setup.timerMin * 60_000 : 0 })
    },

    reveal: () => set({ phase: 'reveal', endsAt: 0 }),

    record: (winner) => {
      if (get().tallied) return
      const { tally } = get()
      set({ tally: { ...tally, [winner]: tally[winner] + 1 }, tallied: true })
    },

    newWord: () => deal(),

    toSetup: () => set({ phase: 'setup', word: null, endsAt: 0 }),

    clearTally: () => set({ tally: { flock: 0, wolves: 0 } }),
  }
})
