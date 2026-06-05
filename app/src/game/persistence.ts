import type { PlayerProfile } from './types'

// localStorage works in Capacitor webviews and browsers alike.
// Swap for capacitor-community/sqlite if the data ever outgrows this.
const PLAYER_KEY = 'sixtysix.player.v1'
const FLAGS_KEY = 'sixtysix.flaggedQuestions.v1'
const SETTINGS_KEY = 'sixtysix.settings.v1'

export interface Settings {
  muted: boolean
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { muted: false, ...JSON.parse(raw) } : { muted: false }
  } catch {
    return { muted: false }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // best effort
  }
}

/** Level curve: a level every 5,000 XP (XP = cumulative race scores). */
export function levelForXp(xp: number): number {
  return 1 + Math.floor(xp / 5000)
}

export function loadPlayer(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(PLAYER_KEY)
    return raw ? (JSON.parse(raw) as PlayerProfile) : null
  } catch {
    return null
  }
}

export function savePlayer(player: PlayerProfile): void {
  try {
    localStorage.setItem(PLAYER_KEY, JSON.stringify(player))
  } catch {
    // storage full/unavailable — losing progress beats crashing the game
  }
}

/** Question ids the player flagged as wrong/unclear — feeds back into the pipeline. */
export function loadFlaggedIds(): string[] {
  try {
    const raw = localStorage.getItem(FLAGS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function saveFlaggedIds(ids: string[]): void {
  try {
    localStorage.setItem(FLAGS_KEY, JSON.stringify(ids))
  } catch {
    // best effort
  }
}
