import { create } from 'zustand'
import { GUIDES, type GuideId } from './content'

/**
 * Tutorials: which intros and hints this player has seen, and what is open
 * right now (the host in TutorialHost.tsx renders it).
 *
 * Seen ids ("intro.blitz", "hint.mission.siege") live on the device in
 * `sixtysix.tutorials.v1`. Signed in, they also travel with the account
 * (`AccountProfile.tutorials`, sent by /api/account/sync when changed), so a
 * new device doesn't repeat them. "Show tips again" (Profile) clears both.
 */

const KEY = 'sixtysix.tutorials.v1'

interface Saved {
  seen: string[]
  /** Changed since the account last heard about it. */
  dirty?: boolean
  /** "Show tips again" not yet sent: the account's list is replaced, not merged. */
  reset?: boolean
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null
    if (raw && Array.isArray(raw.seen)) return { seen: raw.seen.filter((s) => typeof s === 'string'), dirty: !!raw.dirty, reset: !!raw.reset }
  } catch {
    // storage unavailable or broken: start fresh
  }
  return { seen: [] }
}

function save(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage unavailable: seen for this session only
  }
}

/** Board devices (a /board link) never get popups this session. */
let quiet = false
export const silenceTutorials = () => {
  quiet = true
}
export const tutorialsSilenced = () => quiet

/** Set by the account store: push a change to the account while signed in. */
let onChanged: (() => void) | null = null
export const setOnTutorialsChanged = (fn: () => void) => (onChanged = fn)
/** Bumped on every change, so a sync that crossed a newer change leaves it dirty. */
let version = 0

export interface OpenIntro {
  id: GuideId
  /** Run when the intro closes (Got it or Skip): the action it stood in front of. */
  then?: () => void
}

interface TutorialStore extends Saved {
  intro: OpenIntro | null
  howTo: GuideId | null
  /** The hint on screen now (one at a time). */
  hint: string | null
  markSeen: (id: string) => void
  resetAll: () => void
  closeIntro: () => void
  closeHowTo: () => void
}

export const useTutorialStore = create<TutorialStore>((set, get) => {
  const write = (patch: Partial<Saved>) => {
    const next: Saved = { seen: get().seen, dirty: get().dirty, reset: get().reset, ...patch }
    save(next)
    set(next)
    version++
    onChanged?.()
  }
  return {
    ...load(),
    intro: null,
    howTo: null,
    hint: null,
    markSeen: (id) => {
      if (get().seen.includes(id)) return
      write({ seen: [...get().seen, id], dirty: true })
    },
    resetAll: () => write({ seen: [], dirty: true, reset: true }),
    closeIntro: () => {
      const open = get().intro
      if (!open) return
      get().markSeen(`intro.${open.id}`)
      set({ intro: null })
      open.then?.()
    },
    closeHowTo: () => set({ howTo: null }),
  }
})

export const seenIntro = (id: GuideId) => useTutorialStore.getState().seen.includes(`intro.${id}`)

/** Show a guide's intro now if this player hasn't seen it (no-op on a board device or while another is open). */
export function showIntro(id: GuideId): boolean {
  const s = useTutorialStore.getState()
  if (quiet || seenIntro(id) || s.intro || !GUIDES[id]) return false
  useTutorialStore.setState({ intro: { id }, hint: null })
  return true
}

/** Run `action`, first showing the guide's intro if it is new to this player (Got it / Skip then runs it). */
export function introThen(id: GuideId, action: () => void): void {
  if (quiet || seenIntro(id) || useTutorialStore.getState().intro) return action()
  useTutorialStore.setState({ intro: { id, then: action }, hint: null })
}

/** The "How to play" sheet (ⓘ buttons, Profile). */
export const openHowTo = (id: GuideId) => useTutorialStore.setState({ howTo: id })

// ── account sync (account/accountStore.ts) ─────────────────────────────

/** What the next /api/account/sync should carry: nothing when the account is up to date. */
export function tutorialsForSync(): { body: { tutorials?: string[]; tutorialsReset?: true }; version: number } {
  const { seen, dirty, reset } = useTutorialStore.getState()
  return { body: dirty ? { tutorials: seen, ...(reset && { tutorialsReset: true as const }) } : {}, version }
}

/** The sync carrying `sent` went through: clean, unless something changed meanwhile. */
export function tutorialsSynced(sent: number): void {
  if (sent !== version) return
  const { seen } = useTutorialStore.getState()
  save({ seen })
  useTutorialStore.setState({ dirty: false, reset: false })
}

/** The account's list joins this device's (unless a reset here is still on its way). */
export function adoptTutorials(remote: string[] | undefined): void {
  const s = useTutorialStore.getState()
  if (!remote?.length || s.reset) return
  const add = remote.filter((id) => typeof id === 'string' && !s.seen.includes(id))
  if (!add.length) return
  const next: Saved = { seen: [...s.seen, ...add], dirty: s.dirty, reset: s.reset }
  save(next)
  useTutorialStore.setState(next)
}
