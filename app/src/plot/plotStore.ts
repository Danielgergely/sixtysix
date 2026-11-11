import { create } from 'zustand'
import {
  advance,
  BUILDING_IDS,
  type BuildingId,
  type CropId,
  type DestinationId,
  type TripId,
  type FieldId,
  type GiftFigure,
  type Material,
  type Materials,
  type PlotState,
  type ScrollQuestion,
  type StallLot,
} from '@sixtysix/shared'
import { useLocale } from '../i18n'
import { getToken, readOutbox } from '../account/outbox'
import { authedJson } from '../account/authFetch'
import { acceptRev, useAccountStore } from '../account/accountStore'
import { useGameStore } from '../game/store'

/**
 * My Home in Jerusalem, client side. The server (server/src/plot.ts) owns the
 * plot and the coins; this store keeps its last answer and projects timers and
 * production forward with the same shared rules until the next request.
 */

type Levels = Record<BuildingId, number>

/** "New!" ribbons are remembered per account (several people may share a device). */
const seenKey = () => `sixtysix.plotSeen.v1.${useAccountStore.getState().account?.username ?? ''}`

function loadSeen(): Levels | null {
  try {
    return JSON.parse(localStorage.getItem(seenKey()) ?? 'null') as Levels | null
  } catch {
    return null
  }
}
function saveSeen(levels: Levels): void {
  try {
    localStorage.setItem(seenKey(), JSON.stringify(levels))
  } catch {
    // storage unavailable
  }
}

/** Where the homestead stands and how long its family has been away (weeds: shared/src/city.ts). */
export interface HomeInfo {
  lot: number | null
  idleDays: number
}

type Res<T = object> = ({ ok: true; plot: PlotState; coins: number; rev?: number; now: number; home?: HomeInfo } & T) | { ok: false; error: string }

async function call<T = object>(path: string, body?: unknown): Promise<Res<T>> {
  const token = getToken()
  if (!token) return { ok: false, error: 'Sign in to build' }
  const res = await authedJson<Res<T>>(token, `/api/plot${path}`, body)
  // Signed out or switched account while waiting: this reply belongs to someone else.
  return getToken() === token ? res : { ok: false, error: '' }
}

/** The server's coin total wins (it just spent or paid out). */
function adoptCoins(coins: number, rev: number | undefined): void {
  if (!acceptRev(rev)) return // an older reply than one we already showed
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

/** The Workers' scroll answered: how many right, the right answers, and the build it sped up (by `cutMs`). */
type ScrollResult = { right: number; passed: boolean; correct: number[]; building?: BuildingId; cutMs: number }

export interface ScrollRound {
  id: string
  questions: ScrollQuestion[]
  result?: ScrollResult
}

/** Raiders in a field, or a hand lent to a neighbour: the questions, then how they went (shared/src/homeLife.ts). */
export interface Challenge {
  kind: 'raid' | 'help'
  id: string
  /** The raided field, or the neighbour's username. */
  field?: FieldId
  username?: string
  questions: ScrollQuestion[]
  result?: { right: number; correct: number[]; lost?: number; collected?: Materials; cutMs?: number; building?: BuildingId }
}

/** A team about to set out: its road questions, then how they went. */
export interface RoadRound {
  id: string
  dest: DestinationId
  trip: TripId
  workers: number
  questions: ScrollQuestion[]
  result?: { right: number; correct: number[] }
}

/** My Home's three parts. */
export type HomeView = 'yard' | 'expeditions'

interface PlotStore {
  plot: PlotState | null
  home: HomeInfo | null
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
  selected: BuildingId | null
  scroll: ScrollRound | null
  road: RoadRound | null
  view: HomeView
  /** Where the Market's back button goes. */
  marketBack: 'home' | null

  now: () => number
  /** The plot projected to now (finished builds applied, production added). */
  projected: () => PlotState | null
  /** Resolves true when the server answered. */
  load: () => Promise<boolean>
  buy: (m: Material, qty: number) => Promise<boolean>
  sell: (m: Material, qty: number) => Promise<boolean>
  /** The families' stall (shared/src/stall.ts): the lots, putting one up, buying one, taking your own down. */
  stall: StallLot[] | null
  loadStall: () => Promise<void>
  offerLot: (m: Material, qty: number, price: number) => Promise<boolean>
  takeLot: (id: number, kind: 'buy' | 'withdraw') => Promise<boolean>
  upgrade: (b: BuildingId, buyMissing: boolean) => Promise<boolean>
  collect: (b?: BuildingId) => Promise<Materials | null>
  /** A carrier in the yard hands over a gift (shared/src/life.ts): what was given, or the error text. */
  gift: (figure: GiftFigure) => Promise<{ got: Materials } | { error: string }>
  startScroll: () => Promise<void>
  answerScroll: (answers: number[], building?: BuildingId) => Promise<void>
  closeScroll: () => void
  sow: (field: FieldId, crop: CropId, buyMissing: boolean) => Promise<boolean>
  harvest: (field?: FieldId) => Promise<Materials | null>
  bake: (grain: CropId, amount: number, buyMissing: boolean) => Promise<boolean>
  feedFold: (buyMissing: boolean) => Promise<boolean>
  feedBuilders: (b: BuildingId, buyMissing: boolean) => Promise<number | null>
  /** Road questions for a team; then `setOut` with the answers (−1 = skipped). */
  startRoad: (dest: DestinationId, workers: number, trip?: TripId) => Promise<boolean>
  setOut: (answers: number[], buyMissing: boolean) => Promise<boolean>
  closeRoad: () => void
  /** Raiders at harvest and lending a hand: the questions, the answers, closing the sheet. */
  challenge: Challenge | null
  startRaid: (field: FieldId) => Promise<void>
  startHelp: (username: string) => Promise<string | null>
  answerChallenge: (answers: number[]) => Promise<boolean>
  closeChallenge: () => void
  /** The lost sheep, found. */
  findSheep: () => Promise<Materials | null>
  unload: (id: string) => Promise<Materials | null>
  /** Glean in someone else's fields (the Visit screen): what you got, or the error. */
  glean: (username: string) => Promise<{ got: Materials } | { error: string }>
  setView: (v: HomeView) => void
  select: (b: BuildingId | null) => void
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
    set({ plot: res.plot, home: res.home ?? get().home, offset: res.now - Date.now(), error: '', busy: false, seen })
    adoptCoins(res.coins, res.rev)
    return res as Res<T> & { ok: true }
  }

  return {
    plot: null,
    home: null,
    offset: 0,
    loading: false,
    busy: false,
    error: '',
    toast: null,
    seen: loadSeen(),
    selected: null,
    scroll: null,
    road: null,
    challenge: null,
    view: 'yard',
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
      if (!getToken()) return false
      set({ loading: !get().plot })
      const ok = !!take(await call(''))
      set({ loading: false })
      return ok
    },

    buy: async (material, qty) => {
      set({ busy: true })
      return !!take(await call('/buy', { material, qty }))
    },

    sell: async (material, qty) => {
      set({ busy: true })
      return !!take(await call('/sell', { material, qty }))
    },

    stall: null,

    loadStall: async () => {
      const res = await call<{ lots: StallLot[] }>('/stall')
      if (res.ok) set({ stall: res.lots })
    },

    offerLot: async (material, qty, price) => {
      set({ busy: true })
      const res = take(await call<{ lots: StallLot[] }>('/stall/offer', { material, qty, price }))
      if (res) set({ stall: res.lots })
      return !!res
    },

    takeLot: async (id, kind) => {
      set({ busy: true })
      const res = take(await call<{ lots: StallLot[] }>(`/stall/${kind}`, { id }))
      if (res) set({ stall: res.lots })
      else void get().loadStall() // somebody was quicker: show the stall as it is now
      return !!res
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

    gift: async (figure) => {
      // Not `busy`: the bubble shows the answer, the buttons stay as they are.
      const res = await call<{ collected: Materials }>('/gift', { figure })
      if (!res.ok) return { error: res.error }
      const ok = take(res)
      return ok ? { got: ok.collected } : { error: '' }
    },

    startScroll: async () => {
      set({ busy: true })
      const res = take(await call<{ scrollId: string; questions: ScrollQuestion[] }>('/scroll', { locale: useLocale.getState().locale }))
      if (res) set({ scroll: { id: res.scrollId, questions: res.questions } })
    },

    answerScroll: async (answers, building) => {
      const round = get().scroll
      if (!round) return
      set({ busy: true })
      const res = take(
        await call<ScrollResult>('/scroll/answer', {
          scrollId: round.id,
          answers,
          building,
        }),
      )
      if (res) set({ scroll: { ...round, result: { right: res.right, passed: res.passed, correct: res.correct, building: res.building, cutMs: res.cutMs ?? 0 } } })
    },

    closeScroll: () => set({ scroll: null }),

    sow: async (field, crop, buyMissing) => {
      set({ busy: true })
      return !!take(await call('/sow', { field, crop, buyMissing }))
    },

    harvest: async (field) => {
      set({ busy: true })
      const res = take(await call<{ collected: Materials }>('/harvest', field ? { field } : {}))
      return res ? res.collected : null
    },

    bake: async (grain, amount, buyMissing) => {
      set({ busy: true })
      return !!take(await call('/bake', { grain, amount, buyMissing }))
    },

    feedFold: async (buyMissing) => {
      set({ busy: true })
      return !!take(await call('/feed', { target: 'fold', buyMissing }))
    },

    feedBuilders: async (building, buyMissing) => {
      set({ busy: true })
      const res = take(await call<{ cutMs: number }>('/feed', { target: 'build', building, buyMissing }))
      return res ? res.cutMs : null
    },

    startRoad: async (dest, workers, trip = 'short') => {
      set({ busy: true })
      const res = take(await call<{ roadId: string; questions: ScrollQuestion[] }>('/expedition', { dest, trip, workers, locale: useLocale.getState().locale }))
      if (res) set({ road: { id: res.roadId, dest, trip, workers, questions: res.questions } })
      return !!res
    },

    setOut: async (answers, buyMissing) => {
      const round = get().road
      if (!round) return false
      set({ busy: true })
      const res = take(await call<{ right: number; correct: number[] }>('/expedition/start', { roadId: round.id, answers, buyMissing }))
      if (res) set({ road: { ...round, result: { right: res.right, correct: res.correct } } })
      return !!res
    },

    closeRoad: () => set({ road: null }),

    startRaid: async (field) => {
      set({ busy: true })
      const res = take(await call<{ raidId: string; questions: ScrollQuestion[] }>('/raid', { field, locale: useLocale.getState().locale }))
      if (res) set({ challenge: { kind: 'raid', id: res.raidId, field, questions: res.questions }, selected: null })
    },

    // On someone else's homestead: errors come back as text for the Visit screen, not into the plot's error line.
    startHelp: async (username) => {
      const res = await call<{ helpId: string; questions: ScrollQuestion[] }>('/help', { username, locale: useLocale.getState().locale })
      if (!res.ok) return res.error
      set({ challenge: { kind: 'help', id: res.helpId, username, questions: res.questions }, error: '' })
      return null
    },

    answerChallenge: async (answers) => {
      const ch = get().challenge
      if (!ch) return false
      set({ busy: true })
      const res = take(
        ch.kind === 'raid'
          ? await call<{ right: number; correct: number[]; lost: number; collected: Materials }>('/raid/answer', { raidId: ch.id, answers })
          : await call<{ right: boolean; correct: number; cutMs: number; building?: BuildingId; collected: Materials }>('/help/answer', { helpId: ch.id, answer: answers[0] }),
      )
      if (!res) return false
      const result = 'lost' in res ? { right: res.right, correct: res.correct, lost: res.lost, collected: res.collected } : { right: res.right ? 1 : 0, correct: [res.correct], cutMs: res.cutMs, building: res.building, collected: res.collected }
      set({ challenge: { ...ch, result } })
      return true
    },

    closeChallenge: () => set({ challenge: null }),

    findSheep: async () => {
      const res = take(await call<{ collected: Materials }>('/sheep', {}))
      return res ? res.collected : null
    },

    unload: async (id) => {
      set({ busy: true })
      const res = take(await call<{ collected: Materials }>('/expedition/unload', { id }))
      return res ? res.collected : null
    },

    glean: async (username) => {
      const res = await call<{ collected: Materials }>('/glean', { username })
      if (!res.ok) return { error: res.error }
      const ok = take(res)
      return ok ? { got: ok.collected } : { error: '' }
    },

    setView: (view) => set({ view, selected: null, error: '' }),

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

// Another account (or a sign-out) on this device: drop the previous player's plot.
useAccountStore.subscribe((s, prev) => {
  if (s.account?.username === prev.account?.username) return
  usePlotStore.setState({ plot: null, home: null, scroll: null, road: null, challenge: null, selected: null, view: 'yard', error: '', toast: null, seen: loadSeen() })
})
