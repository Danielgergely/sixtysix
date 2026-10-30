import type { Difficulty } from '../questions/types'
import type { BotPersona, CharacterId, Racer } from './types'
import { QUESTION_TIME_MS } from './scoring'
import { t } from '../i18n'

/**
 * Bot opponents for Phase 1 (PLAN.md §2). Not throwaway: this becomes
 * matchmaking backfill in Phase 2.
 *
 * A bot's displayed level drives both its speed and accuracy:
 * level 1 ≈ slow + shaky, level 9 ≈ fast + sharp.
 */
export function personaForLevel(level: number): BotPersona {
  const acc = (difficulty: Difficulty) =>
    Math.min(0.97, Math.max(0.15, 0.5 + level * 0.05 - (difficulty - 1) * 0.12))
  // Typical windows: high-level 2–4s, mid 3–5s, low 5–8s.
  const window = level >= 7 ? { min: 2000, max: 4000 } : level >= 4 ? { min: 3000, max: 5000 } : { min: 5000, max: 8000 }
  return {
    accuracyByDifficulty: { 1: acc(1), 2: acc(2), 3: acc(3), 4: acc(4), 5: acc(5) },
    answerTimeMs: window,
  }
}

const BOT_ROSTER: Array<{ name: string; avatar: CharacterId }> = [
  { name: 'Miriam', avatar: 'esther' },
  { name: 'Caleb', avatar: 'david' },
  { name: 'Tabitha', avatar: 'ruth' },
  { name: 'Eli', avatar: 'moses' },
  { name: 'Phoebe', avatar: 'esther' },
  { name: 'Silas', avatar: 'david' },
]

export interface BotRacer extends Racer {
  isBot: true
  persona: BotPersona
}

/** Pick `count` distinct bots, avoiding the player's avatar where possible. */
export function pickBots(count: number, avoidAvatar?: CharacterId): BotRacer[] {
  const pool = [...BOT_ROSTER].sort(() => Math.random() - 0.5)
  pool.sort((a, b) => Number(a.avatar === avoidAvatar) - Number(b.avatar === avoidAvatar))
  return pool.slice(0, count).map((bot, i) => {
    const level = 1 + Math.floor(Math.random() * 9)
    return {
      profile: {
        id: `bot_${i}`,
        name: t(`quiz.bots.${bot.name}`),
        avatar: bot.avatar,
        level,
        xp: 0,
        coins: 0,
      },
      isBot: true,
      score: 0,
      persona: personaForLevel(level),
    }
  })
}

/** Sample whether/when a bot answers the current question correctly. */
export function sampleBotAnswer(
  persona: BotPersona,
  difficulty: Difficulty,
  correctIndex: number,
): { index: number; correct: boolean; ms: number } {
  const correct = Math.random() < persona.accuracyByDifficulty[difficulty]
  const { min, max } = persona.answerTimeMs
  let ms = min + Math.random() * (max - min) // typical window for this level band
  ms += (difficulty - 1) * 350 // harder questions take everyone a bit longer
  ms += (Math.random() - 0.5) * 1200 // general jitter
  if (Math.random() < 0.12) ms += 1500 + Math.random() * 2500 // occasional hesitation
  else if (Math.random() < 0.08) ms -= 800 // occasional snap answer
  // Clamp inside the question window so every bot clicks before the timer expires.
  ms = Math.max(900, Math.min(QUESTION_TIME_MS - 400, ms))
  const index = correct ? correctIndex : (correctIndex + 1 + Math.floor(Math.random() * 3)) % 4
  return { index, correct, ms: Math.round(ms) }
}
