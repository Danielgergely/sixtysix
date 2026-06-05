export const QUESTION_TIME_MS = 10_000
export const QUESTIONS_PER_RACE = 10
export const BASE_POINTS = 500

/** Kahoot-style: 500 base + up to 500 speed bonus. Wrong = 0 (PLAN.md §2). */
export function scoreAnswer(correct: boolean, remainingMs: number): number {
  if (!correct) return 0
  const bonus = BASE_POINTS * Math.max(0, Math.min(1, remainingMs / QUESTION_TIME_MS))
  return Math.round(BASE_POINTS + bonus)
}

/** Max possible score in a race — used to map score → track progress (0..1). */
export const MAX_RACE_SCORE = QUESTIONS_PER_RACE * BASE_POINTS * 2
