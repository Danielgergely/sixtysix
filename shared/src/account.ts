import type { SkillState } from './skills'

/**
 * Optional accounts (REST under /api/account, see server/src/accounts.ts).
 * Guests play everything and keep XP/coins on the device; an account keeps the
 * progress on the server and unlocks the skill tree and the Jerusalem plot.
 */

export interface AccountStats {
  gamesPlayed: number
  firstPlace: number
  secondPlace: number
  thirdPlace: number
  questionsAnswered: number
  questionsCorrect: number
  bestScore: number
  currentStreak: number
  bestStreak: number
  /** Open Arena games won (1st place); unlocks the gold circlet (shared/src/looks.ts). Counted from 2026-10. */
  arenaWins: number
  /** Longest run of Daily Scroll days; unlocks the jewelled frame. Counted from 2026-10. */
  bestDailyStreak: number
}

export interface AccountProfile {
  name: string
  avatar: string
  coins: number
  xp: number
  stats: AccountStats
  /** Skill tree (shared/skills.ts). Owned by the server: learned only through /api/skills. */
  skills?: SkillState
  /** Look items owned (shared/src/looks.ts). Owned by the server: bought or earned through /api/looks only. */
  wardrobe?: string[]
  /** Bumped by the server on every save, so the app can ignore stale replies. */
  rev?: number
  /** Guest progress already brought in (sign-up + sign-in merges), capped once per account. */
  merged?: { coins: number; xp: number }
  /** Tutorial intros and hints already seen (app/src/tutorial/), so a new device doesn't repeat them. */
  tutorials?: string[]
}

export interface Account {
  username: string
  createdAt: number
  profile: AccountProfile
  /** Staff role: 'admin' (ADMIN_USERNAMES on the server) or 'reviewer' (granted by an admin); absent for everyone else. */
  role?: StaffRole
  /** Ways to sign in (Profile → Account settings). */
  logins?: AccountLogins
}

/**
 * Staff roles. Reviewers review flagged (and later submitted) questions;
 * admins can do that too and grant or revoke the reviewer role.
 */
export type StaffRole = 'admin' | 'reviewer'
/** Whether `role` may do what `need` may: an admin is also a reviewer. */
export const hasRole = (role: StaffRole | null | undefined, need: StaffRole): boolean =>
  role === 'admin' || (need === 'reviewer' && role === 'reviewer')

/** Counters in a grant's `stats` are added; best* take the max; currentStreak is set. */
export const STAT_COUNTERS = ['gamesPlayed', 'firstPlace', 'secondPlace', 'thirdPlace', 'questionsAnswered', 'questionsCorrect', 'arenaWins'] as const
export const STAT_MAXES = ['bestScore', 'bestStreak', 'bestDailyStreak'] as const

/**
 * One reward (a finished race, an arena podium, a practice answer…). Sent at
 * most once per id, so a retry after a dropped connection can't pay twice.
 */
export interface Grant {
  id: string
  coins: number
  xp: number
  stats?: Partial<AccountStats>
  /** 'merge': guest progress brought into an account (no skill bonuses). Absent: a game or answer. */
  source?: 'merge'
}

/**
 * Usernames: 3–20 letters (any alphabet: ö, ő, ß…), digits, . _ -, and single
 * spaces between words ("Dávid Ős"). Always NFC-normalised and trimmed first
 * (normalizeUsername); unique ignoring case (usernameKey). Put one in a URL with
 * encodeURIComponent.
 */
export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
export const USERNAME_RE = /^(?=.{3,20}$)[\p{L}\p{M}\p{N}_.-]+(?: [\p{L}\p{M}\p{N}_.-]+)*$/u
export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 200

/** NFC (one code point for "ő", however the keyboard typed it) and trimmed. */
export const normalizeUsername = (s: string): string => s.normalize('NFC').trim()
/** What makes two usernames the same: NFC, lower case in every alphabet ("ŐS" = "ős"). */
export const usernameKey = (s: string): string => normalizeUsername(s).toLowerCase()
/** Passwords are compared NFC-normalised, so the same typed password always matches (never trimmed). */
export const normalizePassword = (s: string): string => s.normalize('NFC')

export type UsernameProblem = 'short' | 'long' | 'spaces' | 'chars'
/** Why a (normalised) username is refused, or null when it's fine. The app shows the reason; the server checks the same. */
export function usernameProblem(username: string): UsernameProblem | null {
  const u = normalizeUsername(username)
  const len = [...u].length
  if (len < USERNAME_MIN) return 'short'
  if (len > USERNAME_MAX) return 'long'
  if (USERNAME_RE.test(u)) return null
  return /\s/u.test(u) && USERNAME_RE.test(u.replace(/\s+/gu, '_')) ? 'spaces' : 'chars'
}

/** The characters a username can't have (e.g. "@" from an email address), each once. */
export const badUsernameChars = (username: string): string[] => [
  ...new Set([...normalizeUsername(username)].filter((c) => !/[\p{L}\p{M}\p{N}_. -]/u.test(c))),
]

export type PasswordProblem = 'short' | 'long'
export function passwordProblem(password: string): PasswordProblem | null {
  const len = [...normalizePassword(password)].length
  if (len < MIN_PASSWORD) return 'short'
  if (len > MAX_PASSWORD) return 'long'
  return null
}

/** How an account can sign in. `password` null: unknown (an older account with Google/Apple linked, from before this was recorded). */
export interface AccountLogins {
  password: boolean | null
  google: boolean
  apple: boolean
}

/** `created`: Google/Apple sign-in made a new account (it already started from the guest progress, so nothing is merged). */
export type AccountResponse = { ok: true; token?: string; account: Account; created?: boolean } | { ok: false; error: string }
