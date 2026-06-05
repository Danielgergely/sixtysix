// Core scoring is shared with the arena server so both compute identically.
export { BASE_POINTS, QUESTION_TIME_MS, scoreAnswer } from '@sixtysix/shared'

/**
 * Bible Blitz (solo race) constants.
 * The finish line is a real goal: ~10 average-speed correct answers away
 * (avg correct ≈ 750 pts). First racer to cross it wins immediately.
 */
export const FINISH_LINE_SCORE = 7_500

/** Safety cap: if nobody crosses, furthest after this many questions wins. */
export const MAX_QUESTIONS = 15
