import { create } from 'zustand'
import { utcDay, type HuntAnswer, type HuntFind, type HuntPlace, type HuntView, type ScrollQuestion } from '@sixtysix/shared'
import { authedJson } from '../account/authFetch'
import { getToken } from '../account/outbox'
import { useAccountStore } from '../account/accountStore'
import { useLocale } from '../i18n'

/**
 * The scroll hunt in Jerusalem (shared/src/hunt.ts, server/src/hunt.ts): today's
 * three clues, what this player found, the riddle they are searching for and
 * the scroll being read right now. The app never knows where a scroll lies:
 * while a riddle is being searched for (`seeking`), a tap on a place is a
 * guess sent to the server; each scroll has a few guesses a day.
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
  /** The riddle being searched for (0…2): taps on places are guesses for it. */
  seeking: number | null
  /** A place tapped: its name shows for a moment, with what the guess came to (`left` guesses, 0 = the scroll stays hidden) when it was one. */
  note: { place: HuntPlace; key: number; left?: number } | null
  load: () => Promise<void>
  setOpen: (open: boolean) => void
  /** Search for a riddle's scroll (closes the sheet), or stop searching with null. */
  seek: (scroll: number | null) => void
  /** A tap on a place: 'off' when no riddle is being searched for (the place's own card opens), else the guess's outcome. */
  tap: (place: HuntPlace) => Promise<'off' | 'found' | 'miss'>
  answer: (pick: number) => Promise<void>
  closeReading: () => void
  say: (place: HuntPlace) => void
}

/** Scrolls that can still be found today. */
export const scrollsLeft = (v: HuntView | null): number => (v ? v.scrolls.filter((s) => !s.found && !s.lost).length : 0)

export const useHuntStore = create<HuntStore>((set, get) => ({
  view: null,
  failed: false,
  open: false,
  reading: null,
  busy: false,
  seeking: null,
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

  seek: (scroll) => set({ seeking: scroll, open: false }),

  tap: async (place) => {
    const token = getToken()
    const { view, busy, seeking } = get()
    const want = seeking === null ? undefined : view?.scrolls[seeking]
    // Nothing is being searched for (or it is yesterday's riddle): the tap is an ordinary one.
    if (!token || !view || !want || want.found || want.lost || view.day !== utcDay()) {
      if (seeking !== null) set({ seeking: null })
      return 'off'
    }
    if (busy) return 'miss'
    set({ busy: true })
    const res = await authedJson<HuntFind>(token, '/api/hunt/find', { scroll: seeking, place, locale: useLocale.getState().locale })
    set({ busy: false })
    if (getToken() !== token) return 'off'
    if (!res.ok) {
      // No connection, or the scroll was found or lost on another device: stop searching and fetch the day afresh.
      set({ seeking: null })
      void get().load()
      return 'off'
    }
    if (res.found) {
      set({ view: res.hunt, seeking: null, reading: { scroll: res.scroll, question: res.question, bonus: res.bonus }, open: false })
      return 'found'
    }
    const left = res.hunt.scrolls[seeking!]?.tries ?? 0
    set({ view: res.hunt, seeking: left > 0 ? seeking : null, note: { place, key: Date.now(), left } })
    return 'miss'
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
  if (s.account?.username === prev.account?.username) return
  useHuntStore.setState({ seeking: null })
  if (useHuntStore.getState().view) void useHuntStore.getState().load()
})
useLocale.subscribe((s, prev) => {
  if (s.locale !== prev.locale && useHuntStore.getState().view) void useHuntStore.getState().load()
})
