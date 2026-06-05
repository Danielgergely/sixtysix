/**
 * Open Arena protocol — shared between server (authoritative) and clients.
 * Server owns all timers and scoring; clients render state and send answers.
 */

export type RoomType = 'in-person' | 'remote'

export interface RoomConfig {
  questionCount: number
  roomType: RoomType
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
}

// ── socket.io event maps ───────────────────────────────────────────────

export interface ClientToServerEvents {
  'room:create': (
    config: RoomConfig,
    cb: (res: { ok: true; state: RoomState } | { ok: false; error: string }) => void,
  ) => void
  'room:join': (
    payload: { code: string; name: string; avatar: string },
    cb: (res: { ok: true; playerId: string; state: RoomState } | { ok: false; error: string }) => void,
  ) => void
  /** Read-only spectator dashboard (`/board/CODE`). */
  'room:watch': (
    payload: { code: string },
    cb: (res: { ok: true; state: RoomState } | { ok: false; error: string }) => void,
  ) => void
  'room:leave': () => void
  'host:start': () => void
  'player:answer': (payload: { index: number }) => void
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void
  'room:closed': (reason: string) => void
  'game:question': (q: ArenaQuestion, phase: 'reading' | 'question', deadline: number) => void
  'game:answerCount': (count: number) => void
  'game:reveal': (payload: RevealPayload) => void
  'game:leaderboard': (entries: LeaderboardEntry[]) => void
  'game:podium': (entries: LeaderboardEntry[]) => void
  /** Sent privately after reveal: what you earned. */
  'game:yourResult': (payload: { correct: boolean; gain: number; score: number }) => void
}
