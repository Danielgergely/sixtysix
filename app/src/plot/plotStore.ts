import { create } from 'zustand'
import {
  advance,
  BUILDING_IDS,
  type BuildingId,
  type Material,
  type Materials,
  type PlotState,
  type ScrollQuestion,
} from '@sixtysix/shared'
import { getToken, readOutbox } from '../account/outbox'
import { useAccountStore } from '../account/accountStore'
import { useGameStore } from '../game/store'

/**
 * My Home in Jerusalem, client side. The server (server/src/plot.ts) owns the
 * plot and the coins; this store keeps its last answer and projects timers and
 * production forward with the same shared rules until the next request.
 */

const SEEN_KEY = 'sixtysix.plotSeen.v1'

type Levels = Record<BuildingId, number>

function loadSeen(): Levels | null {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? 'null') as Levels | null
  } catch {
    return null
  }
}
function saveSeen(levels: Levels): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(levels))
  } catch {
    // storage unavailable
  }
}

type Res<T = object> = ({ ok: true; plot: PlotState; coins: number; now: number } & T) | { ok: false; error: string }

async function call<T = object>(path: string, body?: unknown): Promise<Res<T>> {
  const token = getToken()
  if (!token) return { ok: false, error: 'Sign in to build' }
  try {
    const res = await fetch(`/api/plot${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, ...(body !== undefined && { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status === 401) return { ok: false, error: 'Signed out — sign in again' }
    return (await res.json()) as Res<T>
  } catch {
    return { ok: false, error: 'No connection to the server' }
  }
}

/** The server's coin total wins (it just spent or paid out). */
function adoptCoins(coins: number): void {
  const acc = useAccountStore.getState()
  // Rewards still on their way: let a sync settle the total instead.
  if (readOutbox().length) {
    void acc.sync()
    return
  }
  const { player, stats, adoptProgress } = useGameStore.getState()
  if (player.coins !== coins) adoptProgress({ name: player.name, avatar: player.avatar, coins, xp: player.xp, stats })
  if (acc.account) useAccountStore.setState({ account: { ...acc.account, profile: { ...acc.account.profile, coins } } })
}

export interface ScrollRound {
  id: string
  questions: ScrollQuestion[]
  result?: { right: number; passed: boolean; correct: number[]; building?: BuildingId }
}

interface PlotStore {
  plot: PlotState | null
  /** server clock − device clock, so timers don't depend on the phone's clock. */
  offset: number
  loading: boolean
  busy: boolean
  error: string
  /** Short confirmation ("+12 bricks", "Kiln started"). */
  toast: { text: string; key: number } | null
  /** Levels the player has already admired; higher levels get a "new" ribbon. */
  seen: Levels | null
  /** The open building sheet. */
  selected: BuildingId | 'courtyard' | null
  scroll: ScrollRound | null
  /** Where the Market's back button goes. */
  marketBack: 'home' | null

  now: () => number
  /** The plot projected to now (finished builds applied, production added). */
  projected: () => PlotState | null
  load: () => Promise<void>
  buy: (m: Material, qty: number) => Promise<boolean>
  sell: (m: Material, qty: number) => Promise<boolean>
  upgrade: (b: BuildingId, buyMissing: boolean) => Promise<boolean>
  collect: (b?: BuildingId) => Promise<Materials | null>
  startScroll: () => Promise<void>
  answerScroll: (answers: number[], building?: BuildingId) => Promise<void>
  closeScroll: () => void
  select: (b: BuildingId | 'courtyard' | null) => void
  markSeen: (b: BuildingId) => void
  say: (text: string) => void
  openMarket: (from: 'home' | null) => void
}

export const usePlotStore = create<PlotStore>((set, get) => {
  /** Apply a server answer; returns it narrowed when ok. */
  function take<T>(res: Res<T>): (Res<T> & { ok: true }) | null {
    if (!res.ok) {
      set({ error: res.error, busy: false })
      return null
    }
    let seen = get().seen
    if (!seen) {
      seen = { ...res.plot.levels }
      saveSeen(seen)
    }
    set({ plot: res.plot, offset: res.now - Date.now(), error: '', busy: false, seen })
    adoptCoins(res.coins)
    return res as Res<T> & { ok: true }
  }

  return {
    plot: null,
    offset: 0,
    loading: false,
    busy: false,
    error: '',
    toast: null,
    seen: loadSeen(),
    selected: null,
    scroll: null,
    marketBack: null,

    now: () => Date.now() + get().offset,

    projected: () => {
      const { plot } = get()
      if (!plot) return null
      const copy = structuredClone(plot)
      advance(copy, get().now())
      return copy
    },

    load: async () => {
      if (!getToken()) return
      set({ loading: !get().plot })
      take(await call(''))
      set({ loading: false })
    },

    buy: async (material, qty) => {
      set({ busy: true })
      return !!take(await call('/buy', { material, qty }))
    },

    sell: async (material, qty) => {
      set({ busy: true })
      return !!take(await call('/sell', { material, qty }))
    },

    upgrade: async (building, buyMissing) => {
      set({ busy: true })
      return !!take(await call('/upgrade', { building, buyMissing }))
    },

    collect: async (building) => {
      set({ busy: true })
      const res = take(await call<{ collected: Materials }>('/collect', building ? { building } : {}))
      return res ? res.collected : null
    },

    startScroll: async () => {
      set({ busy: true })
      const res = take(await call<{ scrollId: string; questions: ScrollQuestion[] }>('/scroll', {}))
      if (res) set({ scroll: { id: res.scrollId, questions: res.questions } })
    },

    answerScroll: async (answers, building) => {
      const round = get().scroll
      if (!round) return
      set({ busy: true })
      const res = take(
        await call<{ right: number; passed: boolean; correct: number[]; building?: BuildingId }>('/scroll/answer', {
          scrollId: round.id,
          answers,
          building,
        }),
      )
      if (res) set({ scroll: { ...round, result: { right: res.right, passed: res.passed, correct: res.correct, building: res.building } } })
    },

    closeScroll: () => set({ scroll: null }),

    select: (selected) => set({ selected, error: '' }),

    markSeen: (b) => {
      const plot = get().projected()
      const seen = { ...(get().seen ?? Object.fromEntries(BUILDING_IDS.map((x) => [x, 0])) as Levels) }
      if (!plot || seen[b] >= plot.levels[b]) return
      seen[b] = plot.levels[b]
      saveSeen(seen)
      set({ seen })
    },

    say: (text) => set({ toast: { text, key: Date.now() } }),

    openMarket: (from) => {
      set({ marketBack: from, selected: null })
      useGameStore.getState().goTo('market')
    },
  }
})
