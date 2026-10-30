/**
 * Open Arena protocol — shared between server (authoritative) and clients.
 * Server owns all timers and scoring; clients render state and send answers.
 */

import type { AnswerSet, Category, Locale, VerseText } from './question'

export type RoomType = 'in-person' | 'remote'

/** easy = difficulty 1–2, mixed = 1–5 ramped easy → hard, hard = 3–5. */
export type DifficultyPreset = 'easy' | 'mixed' | 'hard'

/**
 * classic = everyone for themselves (Road to the Throne, Crowning);
 * goliath = the whole room against one giant (co-op);
 * wall = teams race to rebuild their section of Jerusalem's wall (Neh 3).
 */
export type ArenaMode = 'classic' | 'goliath' | 'wall'
export const ARENA_MODES: readonly ArenaMode[] = ['classic', 'goliath', 'wall']

export interface RoomConfig {
  questionCount: number
  roomType: RoomType
  /** Omitted = classic. */
  mode?: ArenaMode
  /** Omitted or empty = all categories. */
  categories?: Category[]
  difficulty?: DifficultyPreset
}

export const MAX_ARENA_PLAYERS = 100

// Playable characters (CHARACTERS) and the look string carried in every `avatar` field: shared/src/looks.ts.

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
  /** Wall mode: index into RoomState.teams. */
  team?: number
}

/** David vs Goliath: the giant's health is measured in points. */
export interface GoliathState {
  hp: number
  maxHp: number
  /** Damage and number of stones (correct answers) from the last question. */
  lastHit: number
  lastStones: number
  /** Top slingers of the last question (public player ids), best first. */
  lastSlingers: string[]
  fallen: boolean
}

/** Rebuild the Wall: one team per gate of Nehemiah 3. */
export interface TeamState {
  id: number
  name: string
  /** Wall height in stones = team's average score / 100 (fair for uneven teams). */
  stones: number
  /** Stones added by the last question. */
  lastGain: number
  members: number
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
  /** Which game in this room (1, 2, … — "Play again" keeps the code and starts the next). */
  game: number
  goliath?: GoliathState
  teams?: TeamState[]
}

/** Question as sent to clients during 'reading'/'question' — no correctIndex! */
export interface ArenaQuestion {
  index: number
  total: number
  text: string
  answers: [string, string, string, string]
  difficulty: number
  /** The same question in the other languages; each phone shows its own, the board the host's. */
  translations?: Partial<Record<Locale, { text: string; answers: AnswerSet }>>
}

export interface RevealPayload {
  /** The question's bank id, so a player can flag it after the reveal. */
  questionId?: string
  correctIndex: number
  reference: string
  /** Cited verse text (WEB); empty if unavailable. */
  verse: string
  /** The verse in the other languages, reference included. */
  verses?: Partial<Record<Locale, VerseText>>
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
  /** Coins earned this game so far; credited to the profile only at the podium. */
  coins: number
}

/** Sent privately to each player after reveal. */
export interface YourResult {
  correct: boolean
  gain: number
  score: number
  /** Consecutive correct answers including this one (0 after a miss). */
  streak: number
  /** Coins earned for this answer (see coins.ts). */
  coins: number
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
   * client-generated device UUID and acts as a secret: it is never broadcast.
   * The ack returns the player's PUBLIC id, the one used in room state and
   * leaderboards.
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
  /** Lobby only: change the options before (re)starting. Validated like room:create. */
  'host:options': (config: Partial<RoomConfig>) => void
  /** Podium only: back to the lobby with the same code; players stay, scores reset. */
  'host:rematch': () => void
  /** Host advances the game: resolves the question / skips the leaderboard wait. */
  'host:skip': (from: ArenaPhase) => void
  'player:answer': (payload: { index: number }) => void
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void
  'room:closed': (reason: string) => void
  /** endsInMs = duration from receipt (no clock-sync needed). */
  /** `yourAnswer` is set when re-sent to a player who already answered this question. */
  'game:question': (q: ArenaQuestion, phase: 'reading' | 'question', endsInMs: number, yourAnswer?: number) => void
  /** Public ids of the players who have answered the current question (count = length). */
  'game:answerCount': (count: number, answeredIds: string[]) => void
  'game:reveal': (payload: RevealPayload) => void
  'game:leaderboard': (entries: LeaderboardEntry[]) => void
  'game:podium': (entries: LeaderboardEntry[]) => void
  /** Sent privately after reveal: what you earned. */
  'game:yourResult': (payload: YourResult) => void
}
