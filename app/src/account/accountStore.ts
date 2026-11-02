import { create } from 'zustand'
import type { Account, AccountResponse } from '@sixtysix/shared'
import { setOnProfileEdited, useGameStore } from '../game/store'
import { EMPTY_STATS } from '../game/persistence'
import { getToken, queueGrant, readOutbox, setOnQueued, setToken, writeOutbox } from './outbox'
import { setMyRanks } from '../skills/mySkills'
import { t } from '../i18n'
import { adoptTutorials, setOnTutorialsChanged, tutorialsForSync, tutorialsSynced } from '../tutorial/store'

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

/**
 * POST (or GET without a body) to /api/account/<path>. Errors: 'offline' (no answer), 'signed-out'
 * (the session is gone), or the server's English message (shown with tServer).
 */
async function api(path: string, body?: unknown): Promise<AccountResponse> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`/api/account/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...(token && { authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    return { ok: false, error: 'offline' }
  }
  const json = (await res.json().catch(() => null)) as AccountResponse | null
  // A 401 is a lost session, except a refused Google/Apple token ("Google sign-in failed").
  if (res.status === 401 && (!json || json.ok || json.error === 'Signed out')) return { ok: false, error: 'signed-out' }
  return json ?? { ok: false, error: t('account.errors.generic') }
}

/** The message to show for a failed reply: client errors translated here, server ones left for tServer. */
function errorText(res: AccountResponse): string {
  if (res.ok) return t('account.errors.generic')
  if (res.error === 'offline') return t('account.errors.offline')
  if (res.error === 'signed-out') return t('account.errors.signInFailed')
  return res.error || t('account.errors.generic')
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
  /** Clear the form error (the player is typing again). */
  clearError: () => void
  // Account settings (screens/AccountSettingsScreen.tsx). Each resolves to an error to show, or null when done.
  changePassword: (current: string, password: string) => Promise<string | null>
  changeUsername: (username: string) => Promise<string | null>
  linkGoogle: (credential: string) => Promise<string | null>
  linkApple: (idToken: string) => Promise<string | null>
  unlink: (provider: 'google' | 'apple') => Promise<string | null>
  /** Sign out on every device (this one too). */
  logoutEverywhere: () => Promise<string | null>
  /** Delete the account for good; this device becomes a fresh guest. */
  deleteAccount: (confirm: string, password: string) => Promise<string | null>
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
    adoptTutorials(profile.tutorials)
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
      const tips = tutorialsForSync()
      const res = await api('sync', { grants, name: player.name, avatar: player.avatar, ...tips.body })
      if (!res.ok) {
        if (res.error === 'signed-out') signedOut()
        return // offline: the outbox keeps everything for next time
      }
      tutorialsSynced(tips.version)
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
      set({ busy: false, error: errorText(res) })
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

  /** This device becomes a fresh guest (after a sign-out); the progress stays safe in the account. */
  const resetToGuest = () => {
    signedOut()
    const { player } = useGameStore.getState()
    useGameStore.getState().adoptProgress({ name: player.name, avatar: player.avatar, coins: 0, xp: 0, stats: EMPTY_STATS })
  }

  /** A settings call: adopt the account it returns; a lost session signs this device out. */
  async function settingsCall(path: string, body: unknown): Promise<string | null> {
    const res = await api(path, body)
    if (res.ok) {
      if (res.account) adopt(res.account)
      return null
    }
    if (res.error === 'signed-out') {
      resetToGuest()
      return 'Signed out' // shown with tServer
    }
    return errorText(res)
  }

  setOnQueued(() => void get().sync())
  // Name edits fire per keystroke: send once typing settles.
  let editTimer: ReturnType<typeof setTimeout> | undefined
  setOnProfileEdited(() => {
    if (!getToken()) return
    clearTimeout(editTimer)
    editTimer = setTimeout(() => void get().sync(), 1500)
  })
  // Tutorials seen (or "Show tips again") travel with the account, so a new device doesn't repeat them.
  let tipsTimer: ReturnType<typeof setTimeout> | undefined
  setOnTutorialsChanged(() => {
    if (!getToken()) return
    clearTimeout(tipsTimer)
    tipsTimer = setTimeout(() => void get().sync(), 2000)
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
        set({ error: errorText(res) })
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
      resetToGuest()
    },

    clearError: () => {
      if (get().error) set({ error: '' })
    },

    changePassword: (current, password) => settingsCall('password', { current, password }),
    changeUsername: (username) => settingsCall('username', { username }),
    linkGoogle: (credential) => settingsCall('google/link', { credential }),
    linkApple: (idToken) => settingsCall('apple/link', { idToken }),
    unlink: (provider) => settingsCall('unlink', { provider }),

    logoutEverywhere: async () => {
      await get().sync() // deliver pending rewards first
      const res = await api('logout-all', {})
      if (!res.ok && res.error !== 'signed-out') return errorText(res)
      resetToGuest()
      return null
    },

    deleteAccount: async (confirm, password) => {
      const res = await api('delete', { confirm, password })
      if (!res.ok) return errorText(res)
      resetToGuest()
      return null
    },
  }
})

// Quiz gifts read the ranks from here (skills/mySkills.ts).
setMyRanks(useAccountStore.getState().account?.profile.skills?.ranks)
useAccountStore.subscribe((s) => setMyRanks(s.account?.profile.skills?.ranks))
