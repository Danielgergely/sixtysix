import type { Difficulty } from '../questions/types'

export type { CharacterId } from '@sixtysix/shared'
import type { CharacterId } from '@sixtysix/shared'

export type RacePhase =
  | 'reading' // question flashed without answers + 3-2-1 countdown — time to read
  | 'question' // timer running, racers click in as they answer
  | 'reveal' // correct answer highlighted, chariots not yet moved
  | 'progress' // scores applied, chariots advance
  | 'finished'

export interface PlayerProfile {
  id: string
  name: string
  avatar: CharacterId
  level: number
  xp: number
  coins: number
}

export interface Racer {
  profile: PlayerProfile
  isBot: boolean
  score: number
  /** Result of the current question, set during 'reveal'. */
  lastAnswer?: { index: number; correct: boolean; ms: number }
  /** Points gained this question — set when scores apply in 'progress'. */
  lastGain?: number
}

export interface BotPersona {
  /** P(correct) per question difficulty. */
  accuracyByDifficulty: Record<Difficulty, number>
  /** Typical answer-time window; sampling adds difficulty penalty + jitter. */
  answerTimeMs: { min: number; max: number }
}
