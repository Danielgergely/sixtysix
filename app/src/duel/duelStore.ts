import { create } from 'zustand'
import { DUEL_QUESTIONS, duelTodo, type Account, type DuelPlayer, type DuelQuestion, type DuelReveal, type DuelStake, type DuelView } from '@sixtysix/shared'
import { authedJson } from '../account/authFetch'
import { getToken, readOutbox } from '../account/outbox'
import { useAccountStore } from '../account/accountStore'
import { useGameStore } from '../game/store'
import { useLocale } from '../i18n'

/**
 * Duels at the gate (shared/src/duel.ts, server/src/duels.ts): my list of
 * duels, the challenge being set up and the duel being played. The server
 * owns the questions, the clock and the coins; this store shows its answers.
 * Nothing is polled: the list is fetched when the tab bar first shows, when
 * the city opens and when the Duels screen opens.
 */

export interface DuelRound {
  text: string
  answer: string
  reference: string
}

type Reply<T> = ({ ok: true } & T) | { ok: false; error: string }
type WithDuel = { duel: DuelView; account?: Account }

interface DuelStore {
  duels: DuelView[]
  loaded: boolean
  failed: boolean
  /** The player a challenge is being set up against (the stake sheet is open). */
  target: DuelPlayer | null
  busy: boolean
  error: string | null
  /** The duel on the Duels screen right now: being played, or its result looked at. */
  activeId: number | null
  /** `play`: a question is up (or on its way); `result`: my five are in. */
  phase: 'list' | 'play' | 'result'
  question: DuelQuestion | null
  /** The deadline of the open question on this device's clock. */
  endsAt: number
  myPick: number | null
  reveal: DuelReveal | null
  /** The finished duel's questions with their answers, by duel id. */
  rounds: Record<number, DuelRound[]>
  load: (seen?: boolean) => Promise<void>
  openChallenge: (p: DuelPlayer) => void
  closeChallenge: () => void
  challenge: (stake: DuelStake) => Promise<void>
  accept: (id: number) => Promise<void>
  decline: (id: number) => Promise<void>
  /** Open a duel: to play it when it is my move, else to look at it. */
  open: (id: number) => void
  next: () => Promise<void>
  answer: (pick: number | null) => Promise<void>
  loadRounds: (id: number) => Promise<void>
  backToList: () => void
}

/** What waits for me: challenges to answer, duels to play, results not yet looked at. */
export const duelBadge = (duels: DuelView[]): number => duels.filter((d) => duelTodo(d) !== null || d.unseen).length

async function call<T>(path: string, body?: unknown): Promise<Reply<T>> {
  const token = getToken()
  if (!token) return { ok: false, error: 'Signed out — sign in again' }
  const res = await authedJson<Reply<T>>(token, `/api/duels${path}`, body)
  // Signed out or switched account while waiting: this reply belongs to someone else.
  return getToken() === token ? res : { ok: false, error: '' }
}

/** Rewards still queued are synced first, so the server stakes the coins the player can see. */
async function settleOutbox(): Promise<void> {
  if (readOutbox().length) await useAccountStore.getState().sync()
}

const adopt = (account: Account | undefined) => account && useAccountStore.getState().adoptAccount(account)
const locale = () => useLocale.getState().locale

export const useDuelStore = create<DuelStore>((set, get) => {
  /** Put a duel the server just sent into the list (new ones first). */
  const put = (duel: DuelView) =>
    set((s) => ({
      duels: s.duels.some((d) => d.id === duel.id) ? s.duels.map((d) => (d.id === duel.id ? duel : d)) : [duel, ...s.duels],
    }))

  return {
    duels: [],
    loaded: false,
    failed: false,
    target: null,
    busy: false,
    error: null,
    activeId: null,
    phase: 'list',
    question: null,
    endsAt: 0,
    myPick: null,
    reveal: null,
    rounds: {},

    load: async (seen = false) => {
      if (!getToken()) return set({ duels: [], loaded: false })
      const res = await call<{ duels: DuelView[]; account?: Account }>(seen ? '?seen=1' : '')
      if (!res.ok) return set({ failed: true })
      adopt(res.account)
      set({ duels: res.duels, loaded: true, failed: false })
    },

    openChallenge: (p) => set({ target: p, error: null }),
    closeChallenge: () => set({ target: null, error: null }),

    challenge: async (stake) => {
      const target = get().target
      if (!target || get().busy) return
      set({ busy: true, error: null })
      await settleOutbox()
      const res = await call<WithDuel>('/challenge', {
        username: target.username,
        stake,
      })
      if (!res.ok) return set({ busy: false, error: res.error })
      adopt(res.account)
      put(res.duel)
      // Straight into my five questions.
      set({
        busy: false,
        target: null,
        activeId: res.duel.id,
        phase: 'play',
        question: null,
        reveal: null,
        myPick: null,
      })
      useGameStore.getState().goTo('duel')
      void get().next()
    },

    accept: async (id) => {
      if (get().busy) return
      set({ busy: true, error: null })
      await settleOutbox()
      const res = await call<WithDuel>('/accept', { id })
      if (!res.ok) return set({ busy: false, error: res.error })
      adopt(res.account)
      put(res.duel)
      set({
        busy: false,
        activeId: id,
        phase: 'play',
        question: null,
        reveal: null,
        myPick: null,
      })
      void get().next()
    },

    decline: async (id) => {
      if (get().busy) return
      set({ busy: true, error: null })
      const res = await call<WithDuel>('/decline', { id })
      set({ busy: false })
      if (!res.ok) return set({ error: res.error })
      // A challenge turned down is nothing to keep looking at.
      set((s) => ({ duels: s.duels.filter((d) => d.id !== id) }))
    },

    open: (id) => {
      const d = get().duels.find((x) => x.id === id)
      if (!d) return
      const todo = duelTodo(d)
      set({
        activeId: id,
        error: null,
        question: null,
        reveal: null,
        myPick: null,
        phase: todo === 'play' ? 'play' : 'result',
      })
      if (todo === 'play') void get().next()
      else void get().loadRounds(id)
    },

    next: async () => {
      const id = get().activeId
      if (id === null) return
      // My five are in (the last answer may have settled the duel): on to the result, nothing left to ask for.
      const mine = get().duels.find((d) => d.id === id)
      if (mine && mine.me.length >= DUEL_QUESTIONS) {
        set({ phase: 'result', question: null, reveal: null, myPick: null, error: null })
        void get().loadRounds(id)
        return
      }
      set({ busy: true, error: null })
      const res = await call<{
        done: boolean
        question?: DuelQuestion
        duel: DuelView
        account?: Account
      }>('/question', { id, locale: locale() })
      if (get().activeId !== id) return set({ busy: false })
      if (!res.ok) return set({ busy: false, error: res.error })
      put(res.duel)
      adopt(res.account)
      if (res.done || !res.question) {
        set({ busy: false, phase: 'result', question: null, reveal: null })
        void get().loadRounds(id)
        return
      }
      set({
        busy: false,
        phase: 'play',
        question: res.question,
        endsAt: Date.now() + res.question.endsInMs,
        myPick: null,
        reveal: null,
      })
    },

    answer: async (pick) => {
      const { activeId: id, question, reveal, myPick } = get()
      if (id === null || !question || reveal || myPick !== null) return
      // -1 marks "time ran out" locally, so the request goes out once.
      set({ myPick: pick ?? -1, error: null })
      const res = await call<{
        reveal: DuelReveal
        done: boolean
        duel: DuelView
        account?: Account
      }>('/answer', { id, pick, locale: locale() })
      if (get().activeId !== id) return
      if (!res.ok) {
        // The server no longer has this question open (it timed out there): go on to the next.
        set({ myPick: null, error: res.error })
        return void get().next()
      }
      put(res.duel)
      adopt(res.account)
      set({ reveal: res.reveal })
    },

    loadRounds: async (id) => {
      if (get().rounds[id]) return
      const res = await call<{ rounds: DuelRound[] }>('/rounds', {
        id,
        locale: locale(),
      })
      if (res.ok) set((s) => ({ rounds: { ...s.rounds, [id]: res.rounds } }))
    },

    backToList: () =>
      set({
        activeId: null,
        phase: 'list',
        question: null,
        reveal: null,
        myPick: null,
        error: null,
      }),
  }
})

// Another account (or a sign-out) on this device: the previous player's duels go.
useAccountStore.subscribe((s, prev) => {
  if (s.account?.username === prev.account?.username) return
  useDuelStore.setState({
    duels: [],
    loaded: false,
    target: null,
    activeId: null,
    phase: 'list',
    question: null,
    reveal: null,
    myPick: null,
    rounds: {},
    error: null,
  })
  if (s.account) void useDuelStore.getState().load()
})
