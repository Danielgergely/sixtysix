/**
 * Exodus online leaderboard (server/src/exodus.ts, app/src/exodus/scoresApi.ts).
 * Distances are whole metres. Only account holders are ranked; guests can look.
 */

export type ExodusBoard = 'all' | 'week' | 'daily'

/** Longest run accepted, in metres. */
export const EXODUS_MAX_DISTANCE = 200_000
/** Longest run accepted, in seconds (6 h). */
export const EXODUS_MAX_SECONDS = 21_600
/** Plausibility: top speed is 30 units/s, so a run can't cover more than this (plus a little slack). */
export const exodusPlausible = (distance: number, seconds: number): boolean => distance <= seconds * 31 + 60

/** POST /api/exodus/run. `daily` = the Daily Run's UTC date 'YYYY-MM-DD' (today or yesterday), or null. */
export interface ExodusRunRequest {
  distance: number
  seconds: number
  daily: string | null
}

/** `dailyBest` is null when the run was not a (still counted) Daily Run. */
export interface ExodusRunResponse {
  ok: true
  best: number
  weekBest: number
  dailyBest: number | null
}

export interface ExodusBoardRow {
  rank: number
  username: string
  name: string
  /** Look string (shared/src/looks.ts). */
  avatar: string
  distance: number
}

/** GET /api/exodus/leaderboard?board=all|week|daily → top 20, plus your own row when signed in and ranked. */
export interface ExodusBoardResponse {
  ok: true
  board: ExodusBoard
  /** 'all', the week's Monday 'YYYY-MM-DD', or the day 'YYYY-MM-DD'. */
  period: string
  /** When the weekly / daily board starts afresh (ms); null for all time. */
  resetsAt: number | null
  top: ExodusBoardRow[]
  me: ExodusBoardRow | null
}

/** A UTC date as 'YYYY-MM-DD'. */
export const utcDay = (ms = Date.now()): string => new Date(ms).toISOString().slice(0, 10)
