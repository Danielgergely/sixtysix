/**
 * Open Arena protocol — shared between server (authoritative) and clients.
 * Server owns all timers and scoring; clients render state and send answers.
 */

import type { Category } from './question'

export type RoomType = 'in-person' | 'remote'

/** easy = difficulty 1–2, mixed = 1–5 ramped easy → hard, hard = 3–5. */
export type DifficultyPreset = 'easy' | 'mixed' | 'hard'

export interface RoomConfig {
  questionCount: number
  roomType: RoomType
  /** Omitted or empty = all categories. */
  categories?: Category[]
  difficulty?: DifficultyPreset
}

export const MAX_ARENA_PLAYERS = 100

export type ArenaPhase =
  | 'lobby'
  | 'reading' // question flashed + 3-2-1, no answers yet
  | 'question' // answering window open
  | 'reveal' // correct answer + distribution
  | 'leaderboard' // standings between questions
  | 'podium'

export interface ArenaPlayer {
  id: string
  name: string
  avatar: string
  score: number
  connected: boolean
}

/** Public room state — safe to broadcast to everyone in the room. */
export interface RoomState {
  code: string
  config: RoomConfig
  phase: ArenaPhase
  players: ArenaPlayer[]
  hostConnected: boolean
  questionIndex: number
  questionTotal: number
}

/** Question as sent to clients during 'reading'/'question' — no correctIndex! */
export interface ArenaQuestion {
  index: number
  total: number
  text: string
  answers: [string, string, string, string]
  difficulty: number
}

export interface RevealPayload {
  correctIndex: number
  reference: string
  /** Cited verse text (WEB); empty if unavailable. */
  verse: string
  /** Count of players who picked each answer. */
  distribution: [number, number, number, number]
  answeredCount: number
}

export interface LeaderboardEntry {
  playerId: string
  name: string
  avatar: string
  score: number
  rank: number
  /** Rank change vs previous leaderboard (positive = climbed). */
  delta: number
  /** Points from the question just played — lets clients count up from score - gain. */
  gain: number
  /** Consecutive correct answers. */
  streak: number
}

/** Sent privately to each player after reveal. */
export interface YourResult {
  correct: boolean
  gain: number
  score: number
  /** Consecutive correct answers including this one (0 after a miss). */
  streak: number
}

// ── socket.io event maps ───────────────────────────────────────────────

export interface ClientToServerEvents {
  'room:create': (
    payload: { config: RoomConfig; hostId: string },
    cb: (res: { ok: true; state: RoomState } | { ok: false; error: string }) => void,
  ) => void
  /**
   * Join (or REJOIN — same playerId rebinds the connection and keeps the
   * score, which is how reconnection works). playerId is the stable
   * client-generated device UUID; a future account id slots in unchanged.
   */
  'room:join': (
    payload: { code: string; name: string; avatar: string; playerId: string },
    cb: (res: { ok: true; playerId: string; state: RoomState } | { ok: false; error: string }) => void,
  ) => void
  /** Host reclaims their room after a disconnect (within the grace window). */
  'room:rehost': (
    payload: { code: string; hostId: string },
    cb: (res: { ok: true; state: RoomState } | { ok: false; error: string }) => void,
  ) => void
  /** Read-only spectator dashboard (`/board/CODE`). */
  'room:watch': (
    payload: { code: string },
    cb: (res: { ok: true; state: RoomState } | { ok: false; error: string }) => void,
  ) => void
  /** Acknowledged so the client can disconnect only after the server heard it. */
  'room:leave': (cb: (ok: boolean) => void) => void
  'host:start': () => void
  /** Host advances the game: resolves the question / skips the leaderboard wait. */
  'host:skip': () => void
  'player:answer': (payload: { index: number }) => void
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void
  'room:closed': (reason: string) => void
  /** endsInMs = duration from receipt (no clock-sync needed). */
  'game:question': (q: ArenaQuestion, phase: 'reading' | 'question', endsInMs: number) => void
  'game:answerCount': (count: number) => void
  'game:reveal': (payload: RevealPayload) => void
  'game:leaderboard': (entries: LeaderboardEntry[]) => void
  'game:podium': (entries: LeaderboardEntry[]) => void
  /** Sent privately after reveal: what you earned. */
  'game:yourResult': (payload: YourResult) => void
}
