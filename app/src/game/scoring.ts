export const QUESTION_TIME_MS = 10_000
export const BASE_POINTS = 500

/** Kahoot-style: 500 base + up to 500 speed bonus. Wrong = 0 (PLAN.md §2). */
export function scoreAnswer(correct: boolean, remainingMs: number): number {
  if (!correct) return 0
  const bonus = BASE_POINTS * Math.max(0, Math.min(1, remainingMs / QUESTION_TIME_MS))
  return Math.round(BASE_POINTS + bonus)
}

/**
 * The finish line is a real goal: ~10 average-speed correct answers away
 * (avg correct ≈ 750 pts). First racer to cross it wins immediately.
 */
export const FINISH_LINE_SCORE = 7_500

/** Safety cap: if nobody crosses, furthest after this many questions wins. */
export const MAX_QUESTIONS = 15
