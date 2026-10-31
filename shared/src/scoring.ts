/** Answer window (both modes). 20 s: families read aloud and think together. */
export const QUESTION_TIME_MS = 20_000
/** Question shown alone with a 3-2-1 before answers appear (both modes). */
export const READING_MS = 3000
/** Beat after the last answer before the reveal (both modes). */
export const ALL_ANSWERED_BEAT_MS = 800
export const BASE_POINTS = 500

/** Kahoot-style: 500 base + up to 500 speed bonus. Wrong = 0. */
export function scoreAnswer(correct: boolean, remainingMs: number): number {
  if (!correct) return 0
  const bonus = BASE_POINTS * Math.max(0, Math.min(1, remainingMs / QUESTION_TIME_MS))
  return Math.round(BASE_POINTS + bonus)
}
