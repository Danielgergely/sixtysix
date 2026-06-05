import type { Difficulty } from '../questions/types'

export type CharacterId = 'david' | 'moses' | 'esther' | 'ruth'

export type RacePhase = 'countdown' | 'question' | 'reveal' | 'finished'

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
}

export interface BotPersona {
  /** P(correct) per question difficulty. */
  accuracyByDifficulty: Record<Difficulty, number>
  /** Answer time sampled per question (normal distribution, clamped). */
  answerTimeMs: { mean: number; sd: number }
}
