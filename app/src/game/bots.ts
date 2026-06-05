import type { Difficulty } from '../questions/types'
import type { BotPersona, CharacterId, Racer } from './types'
import { QUESTION_TIME_MS } from './scoring'

/**
 * Bot opponents for Phase 1 (PLAN.md §2). Not throwaway: this becomes
 * matchmaking backfill in Phase 2.
 */
const PERSONAS: Record<'steady' | 'swift' | 'scholar', BotPersona> = {
  steady: {
    accuracyByDifficulty: { 1: 0.8, 2: 0.65, 3: 0.5, 4: 0.35, 5: 0.25 },
    answerTimeMs: { mean: 5200, sd: 1500 },
  },
  swift: {
    accuracyByDifficulty: { 1: 0.7, 2: 0.55, 3: 0.45, 4: 0.3, 5: 0.2 },
    answerTimeMs: { mean: 2800, sd: 900 },
  },
  scholar: {
    accuracyByDifficulty: { 1: 0.95, 2: 0.85, 3: 0.7, 4: 0.55, 5: 0.4 },
    answerTimeMs: { mean: 6500, sd: 1800 },
  },
}

const BOT_ROSTER: Array<{ name: string; avatar: CharacterId; persona: keyof typeof PERSONAS }> = [
  { name: 'Miriam', avatar: 'esther', persona: 'swift' },
  { name: 'Caleb', avatar: 'david', persona: 'steady' },
  { name: 'Tabitha', avatar: 'ruth', persona: 'scholar' },
  { name: 'Eli', avatar: 'moses', persona: 'steady' },
  { name: 'Phoebe', avatar: 'esther', persona: 'scholar' },
  { name: 'Silas', avatar: 'david', persona: 'swift' },
]

export interface BotRacer extends Racer {
  isBot: true
  persona: BotPersona
}

/** Pick `count` distinct bots, avoiding the player's avatar where possible. */
export function pickBots(count: number, avoidAvatar?: CharacterId): BotRacer[] {
  const pool = [...BOT_ROSTER].sort(() => Math.random() - 0.5)
  pool.sort((a, b) => Number(a.avatar === avoidAvatar) - Number(b.avatar === avoidAvatar))
  return pool.slice(0, count).map((bot, i) => ({
    profile: {
      id: `bot_${i}`,
      name: bot.name,
      avatar: bot.avatar,
      level: 1 + Math.floor(Math.random() * 9),
      xp: 0,
      coins: 0,
    },
    isBot: true,
    score: 0,
    persona: PERSONAS[bot.persona],
  }))
}

/** Sample whether/when a bot answers the current question correctly. */
export function sampleBotAnswer(
  persona: BotPersona,
  difficulty: Difficulty,
  correctIndex: number,
): { index: number; correct: boolean; ms: number } {
  const correct = Math.random() < persona.accuracyByDifficulty[difficulty]
  // Box–Muller normal sample, clamped to the question window.
  const u1 = Math.random() || 1e-9
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  const ms = Math.max(800, Math.min(QUESTION_TIME_MS - 200, persona.answerTimeMs.mean + z * persona.answerTimeMs.sd))
  const index = correct ? correctIndex : (correctIndex + 1 + Math.floor(Math.random() * 3)) % 4
  return { index, correct, ms: Math.round(ms) }
}
