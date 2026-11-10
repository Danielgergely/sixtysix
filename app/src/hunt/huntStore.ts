import { create } from 'zustand'
import { utcDay, type HuntAnswer, type HuntFind, type HuntPlace, type HuntView, type ScrollQuestion } from '@sixtysix/shared'
import { authedJson } from '../account/authFetch'
import { getToken } from '../account/outbox'
import { useAccountStore } from '../account/accountStore'
import { useLocale } from '../i18n'

/**
 * The scroll hunt in Jerusalem (shared/src/hunt.ts, server/src/hunt.ts): today's
 * three clues, what this player found, and the scroll being read right now.
 * The app never knows where a scroll lies: a tap on a place asks the server.
 */

/** A scroll just found: the question that came with it, then what it gave. */
export interface Reading {
  scroll: number
  /** Missing when the server had no question: the reward shows at once. */
  question?: ScrollQuestion
  /** The day's last scroll brought the bonus. */
  bonus: boolean
  /** The answer tapped and the right one, once the server replied. */
  picked?: number
  correct?: number
  right?: boolean
  error?: string
}

interface HuntStore {
  view: HuntView | null
  failed: boolean
  /** The clue sheet is open. */
  open: boolean
  reading: Reading | null
  busy: boolean
  /** A place tapped where nothing lies today (the 3D city's gates, towers …): its name shows for a moment. */
  note: { place: HuntPlace; key: number } | null
  load: () => Promise<void>
  setOpen: (open: boolean) => void
  /** A tap on a place. Resolves true when a scroll was lying there (the reading opens). */
  tap: (place: HuntPlace) => Promise<boolean>
  answer: (pick: number) => Promise<void>
  closeReading: () => void
  say: (place: HuntPlace) => void
}

/** A tap must not hang on a slow network: after this long the place's own card opens instead. */
const TAP_WAIT_MS = 2500

export const scrollsLeft = (v: HuntView | null): number => (v ? v.scrolls.filter((s) => !s.found).length : 0)

export const useHuntStore = create<HuntStore>((set, get) => ({
  view: null,
  failed: false,
  open: false,
  reading: null,
  busy: false,
  note: null,

  load: async () => {
    const token = getToken()
    try {
      const res = await fetch(`/api/hunt?locale=${useLocale.getState().locale}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
      const body = (await res.json()) as HuntView | { ok: false }
      if (body.ok) set({ view: body, failed: false })
      else set({ failed: true })
    } catch {
      set({ failed: true })
    }
  },

  setOpen: (open) => {
    set({ open })
    // A new day (or another language) since the clues were fetched.
    const v = get().view
    if (open && (!v || v.day !== utcDay())) void get().load()
  },

  tap: async (place) => {
    const token = getToken()
    const { view, busy } = get()
    // Guests, a hunt that is finished and yesterday's clues have nothing to find.
    if (!token || !view || busy || scrollsLeft(view) === 0 || view.day !== utcDay()) return false
    set({ busy: true })
    const asked = authedJson<HuntFind>(token, '/api/hunt/find', {
      place,
      locale: useLocale.getState().locale,
    })
    const found = (res: Awaited<typeof asked>): boolean => {
      if (!res.ok || !res.found || getToken() !== token) return false
      set({
        view: res.hunt,
        reading: {
          scroll: res.scroll,
          question: res.question,
          bonus: res.bonus,
        },
        open: false,
      })
      return true
    }
    const first = await Promise.race([asked, new Promise<null>((r) => setTimeout(() => r(null), TAP_WAIT_MS))])
    if (first === null) {
      // Too slow: the tap goes on as usual. If a scroll was there after all, its reading still opens.
      void asked.then(found).finally(() => set({ busy: false }))
      return false
    }
    set({ busy: false })
    return found(first)
  },

  answer: async (pick) => {
    const token = getToken()
    const r = get().reading
    if (!token || !r || !r.question || r.picked !== undefined || get().busy) return
    set({ busy: true, reading: { ...r, picked: pick, error: undefined } })
    const res = await authedJson<HuntAnswer>(token, '/api/hunt/answer', {
      scroll: r.scroll,
      pick,
      locale: useLocale.getState().locale,
    })
    const now = get().reading
    if (!now || now.scroll !== r.scroll) return set({ busy: false })
    if (res.ok)
      set({
        busy: false,
        view: res.hunt,
        reading: { ...now, correct: res.correct, right: res.right },
      })
    // The question is gone (answered elsewhere, or it waited too long): the scroll keeps what it gave.
    else
      set({
        busy: false,
        reading: {
          ...now,
          question: undefined,
          picked: undefined,
          error: res.error,
        },
      })
  },

  closeReading: () => set({ reading: null }),
  say: (place) => set({ note: { place, key: Date.now() } }),
}))

// Another account (or a sign-out), or another language: the clues are fetched afresh.
useAccountStore.subscribe((s, prev) => {
  if (s.account?.username !== prev.account?.username && useHuntStore.getState().view) void useHuntStore.getState().load()
})
useLocale.subscribe((s, prev) => {
  if (s.locale !== prev.locale && useHuntStore.getState().view) void useHuntStore.getState().load()
})
