import { questionIn, type Locale, type Question } from '@sixtysix/shared'
import { loadExclusions } from '../flags/flagStore'
import { loadBank } from '../questions/provider'
import type { GateQuestion } from './sim'

/**
 * Questions for the answer gates: easy to middling, short enough to read in
 * slow motion, every answer short enough for a gate's sign; flagged ones are
 * out of play (as in Practice). One wrong answer of the four is dropped at
 * random and the three left are shuffled into the lanes.
 */

const MAX_TEXT = 120
const MAX_ANSWER = 22

function gateQuestion(q: Question, locale: Locale, rand: () => number): GateQuestion | null {
  const shown = questionIn(q, locale)
  if (shown.text.length > MAX_TEXT || shown.answers.some((a) => a.length > MAX_ANSWER)) return null
  const wrong = [0, 1, 2, 3].filter((i) => i !== q.correctIndex)
  wrong.splice(Math.floor(rand() * 3), 1)
  const order = [q.correctIndex, ...wrong].sort(() => rand() - 0.5)
  return {
    id: q.id,
    text: shown.text,
    reference: q.reference,
    answers: order.map((i) => shown.answers[i]) as [string, string, string],
    correct: order.indexOf(q.correctIndex) as 0 | 1 | 2,
    shown,
  }
}

/**
 * A shuffled deck of gate questions in `locale` (no repeats within a run).
 * `rand` seeded: the same deck for everyone (the Daily Run).
 */
export async function loadGateQuestions(locale: Locale, rand: () => number = Math.random): Promise<GateQuestion[]> {
  const [bank, excluded] = await Promise.all([loadBank(locale), loadExclusions()])
  const out: GateQuestion[] = []
  for (const q of bank) {
    if (q.difficulty > 3 || excluded.has(q.id)) continue
    const g = gateQuestion(q, locale, rand)
    if (g) out.push(g)
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
