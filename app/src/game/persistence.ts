import { STAT_COUNTERS, STAT_MAXES } from '@sixtysix/shared'
import type { PlayerProfile } from './types'

// localStorage works in Capacitor webviews and browsers alike.
// Swap for capacitor-community/sqlite if the data ever outgrows this.
const PLAYER_KEY = 'sixtysix.player.v1'
const FLAGS_KEY = 'sixtysix.flaggedQuestions.v1'
const SETTINGS_KEY = 'sixtysix.settings.v1'
const STATS_KEY = 'sixtysix.stats.v1'

export const DEFAULT_PLAYER: PlayerProfile = {
  id: 'player_local',
  name: 'You',
  avatar: 'david',
  level: 1,
  xp: 0,
  coins: 0,
}


export interface PlayerStats {
  gamesPlayed: number
  /** Podium finishes — counts stay meaningful in future large-lobby modes. */
  firstPlace: number
  secondPlace: number
  thirdPlace: number
  /** Questions actually answered (timeouts don't count). */
  questionsAnswered: number
  questionsCorrect: number
  bestScore: number
  currentStreak: number
  bestStreak: number
}

export const EMPTY_STATS: PlayerStats = {
  gamesPlayed: 0,
  firstPlace: 0,
  secondPlace: 0,
  thirdPlace: 0,
  questionsAnswered: 0,
  questionsCorrect: 0,
  bestScore: 0,
  currentStreak: 0,
  bestStreak: 0,
}

/** Apply a reward's stats: counters add, best* take the max, currentStreak is set (as on the server). */
export function addStats(base: PlayerStats, d: Partial<PlayerStats>): PlayerStats {
  const out = { ...base }
  for (const k of STAT_COUNTERS) out[k] += d[k] ?? 0
  for (const k of STAT_MAXES) out[k] = Math.max(out[k], d[k] ?? 0)
  if (d.currentStreak !== undefined) out.currentStreak = d.currentStreak
  out.bestStreak = Math.max(out.bestStreak, out.currentStreak)
  return out
}

export function loadStats(): PlayerStats {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (!raw) return EMPTY_STATS
    const parsed = JSON.parse(raw)
    if (parsed.wins !== undefined && parsed.firstPlace === undefined) parsed.firstPlace = parsed.wins // legacy
    return { ...EMPTY_STATS, ...parsed }
  } catch {
    return EMPTY_STATS
  }
}

export function saveStats(stats: PlayerStats): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch {
    // best effort
  }
}

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

const DEVICE_ID_KEY = 'sixtysix.deviceId.v1'

/**
 * Stable anonymous identity (Tier 0 of the identity ladder, PLAN.md).
 * Arena games key players by this; a future account absorbs it.
 */
let cachedDeviceId: string | null = null

export function getDeviceId(): string {
  // Cached: if storage throws, every call must still return the SAME id.
  if (cachedDeviceId) return cachedDeviceId
  cachedDeviceId = readOrCreateDeviceId()
  return cachedDeviceId
}

function readOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      id = crypto.randomUUID?.() ?? `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    return `tmp_${Math.random().toString(36).slice(2, 12)}`
  }
}

/** Level curve: a level every 5,000 XP (XP = cumulative race scores). */
export function levelForXp(xp: number): number {
  return 1 + Math.floor(xp / 5000)
}

export function loadPlayer(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(PLAYER_KEY)
    // Merge over defaults so profiles saved before a field existed still load.
    return raw ? ({ ...DEFAULT_PLAYER, ...(JSON.parse(raw) as Partial<PlayerProfile>) } as PlayerProfile) : null
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
    const parsed: unknown = JSON.parse(localStorage.getItem(FLAGS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
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
