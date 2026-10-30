import { create } from 'zustand'
import type { Account, AccountResponse } from '@sixtysix/shared'
import { setOnProfileEdited, useGameStore } from '../game/store'
import { EMPTY_STATS } from '../game/persistence'
import { getToken, queueGrant, readOutbox, setOnQueued, setToken, writeOutbox } from './outbox'
import { setMyRanks } from '../skills/mySkills'
import { t } from '../i18n'

/**
 * Optional account. Signed out ("guest"), progress lives on the device as
 * before. Signing up uploads the guest progress as the account's start;
 * signing in to an existing account ADDS the guest progress to it. While
 * signed in, every reward is also queued for the server (outbox.ts) and the
 * server's totals win whenever we hear back. Signing out resets the device to
 * a fresh guest, so nothing is ever counted twice.
 */

const ACCOUNT_KEY = 'sixtysix.account.v1'

/**
 * Highest profile revision seen this session. A reply computed before a newer
 * one (e.g. a sync that crossed a Market purchase) is ignored, never adopted.
 */
let lastRev = 0
export function acceptRev(rev: number | undefined): boolean {
  if (rev === undefined) return true
  if (rev < lastRev) return false
  lastRev = rev
  return true
}

function loadCached(): Account | null {
  try {
    return getToken() ? (JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null') as Account | null) : null
  } catch {
    return null
  }
}

function cache(account: Account | null): void {
  try {
    if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
    else localStorage.removeItem(ACCOUNT_KEY)
  } catch {
    // storage unavailable
  }
}

async function api(path: string, body?: unknown): Promise<AccountResponse> {
  const token = getToken()
  try {
    const res = await fetch(`/api/account/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...(token && { authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status === 401) return { ok: false, error: 'signed-out' }
    return (await res.json()) as AccountResponse
  } catch {
    return { ok: false, error: 'offline' }
  }
}

/** The device's guest progress, as sign-up profile or as a merge grant. */
function guestProgress() {
  const { player, stats } = useGameStore.getState()
  return { name: player.name, avatar: player.avatar, coins: player.coins, xp: player.xp, stats }
}

interface AccountStore {
  account: Account | null
  busy: boolean
  error: string
  /** On launch: deliver pending rewards and refresh from the server. */
  init: () => Promise<void>
  signup: (username: string, password: string) => Promise<boolean>
  login: (username: string, password: string) => Promise<boolean>
  /** Sign in with a Google ID token (button in AccountPanel; needs GOOGLE_CLIENT_ID on the server). */
  googleSignIn: (credential: string) => Promise<boolean>
  /** `name` = the first name Apple shares on the first sign-in only. */
  appleSignIn: (idToken: string, name: string) => Promise<boolean>
  logout: () => Promise<void>
  /** Send queued rewards (and name/avatar), then adopt the server totals. */
  sync: () => Promise<void>
  /** Take an account the server just sent (skill tree, plot perks). */
  adoptAccount: (account: Account) => void
}

export const useAccountStore = create<AccountStore>((set, get) => {
  const adopt = (account: Account) => {
    if (!acceptRev(account.profile.rev)) return
    cache(account)
    set({ account })
    const { profile } = account
    useGameStore.getState().adoptProgress({ ...profile, stats: { ...EMPTY_STATS, ...profile.stats } })
  }

  const signedOut = () => {
    lastRev = 0
    setToken(null)
    writeOutbox([])
    cache(null)
    set({ account: null })
  }

  let syncing: Promise<void> | null = null
  let again = false

  async function runSync(): Promise<void> {
    do {
      again = false
      const grants = readOutbox()
      const { player } = useGameStore.getState()
      const res = await api('sync', { grants, name: player.name, avatar: player.avatar })
      if (!res.ok) {
        if (res.error === 'signed-out') signedOut()
        return // offline: the outbox keeps everything for next time
      }
      // Drop exactly what was delivered; anything queued meanwhile stays.
      const sent = new Set(grants.map((g) => g.id))
      writeOutbox(readOutbox().filter((g) => !sent.has(g.id)))
      if (readOutbox().length === 0) adopt(res.account)
      else again = true
    } while (again)
  }

  /** After a successful sign-in reply: store the session, merge guest progress if asked, adopt the account. */
  async function signedIn(res: AccountResponse, mergeGuest: boolean): Promise<boolean> {
    if (!res.ok || !res.token) {
      const error = res.ok
        ? t('account.errors.generic')
        : res.error === 'offline'
          ? t('account.errors.offline')
          : res.error === 'signed-out'
            ? t('account.errors.signInFailed')
            : res.error
      set({ busy: false, error })
      return false
    }
    setToken(res.token)
    // Whatever this device earned as a guest is added to an existing account.
    const guest = guestProgress()
    if (mergeGuest && (guest.coins || guest.xp || guest.stats.gamesPlayed)) {
      const { currentStreak, ...counters } = guest.stats
      void currentStreak // a guest streak doesn't override the account's
      queueGrant({ coins: guest.coins, xp: guest.xp, stats: counters, source: 'merge' })
    }
    adopt(res.account)
    await get().sync()
    set({ busy: false })
    return true
  }

  setOnQueued(() => void get().sync())
  // Name edits fire per keystroke: send once typing settles.
  let editTimer: ReturnType<typeof setTimeout> | undefined
  setOnProfileEdited(() => {
    if (!getToken()) return
    clearTimeout(editTimer)
    editTimer = setTimeout(() => void get().sync(), 1500)
  })

  return {
    account: loadCached(),
    busy: false,
    error: '',

    adoptAccount: (account) => adopt(account),

    init: async () => {
      if (getToken()) await get().sync()
    },

    sync: () => {
      if (!getToken()) return Promise.resolve()
      if (syncing) {
        again = true
        return syncing
      }
      syncing = runSync().finally(() => (syncing = null))
      return syncing
    },

    signup: async (username, password) => {
      set({ busy: true, error: '' })
      const res = await api('signup', { username, password, profile: guestProgress() })
      set({ busy: false })
      if (!res.ok || !res.token) {
        set({ error: res.ok ? t('account.errors.generic') : res.error === 'offline' ? t('account.errors.offline') : res.error })
        return false
      }
      setToken(res.token)
      adopt(res.account)
      return true
    },

    login: async (username, password) => {
      set({ busy: true, error: '' })
      return signedIn(await api('login', { username, password }), true)
    },

    googleSignIn: async (credential) => {
      set({ busy: true, error: '' })
      const res = await api('google', { credential, profile: guestProgress() })
      // A brand-new Google account already started from the guest progress.
      return signedIn(res, !(res.ok && (res as { created?: boolean }).created))
    },

    appleSignIn: async (idToken, name) => {
      set({ busy: true, error: '' })
      const res = await api('apple', { idToken, name, profile: guestProgress() })
      // A brand-new Apple account already started from the guest progress.
      return signedIn(res, !(res.ok && (res as { created?: boolean }).created))
    },

    logout: async () => {
      await get().sync() // deliver pending rewards first
      await api('logout', {})
      signedOut()
      // A fresh guest: the progress stays safe in the account.
      const { player } = useGameStore.getState()
      useGameStore.getState().adoptProgress({ name: player.name, avatar: player.avatar, coins: 0, xp: 0, stats: EMPTY_STATS })
    },
  }
})

// Quiz gifts read the ranks from here (skills/mySkills.ts).
setMyRanks(useAccountStore.getState().account?.profile.skills?.ranks)
useAccountStore.subscribe((s) => setMyRanks(s.account?.profile.skills?.ranks))
