import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Question } from '@sixtysix/shared'

// Same compiled bank the app bundles — question-pipeline/ is the single source.
const bankPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'app', 'src', 'questions', 'bank.json',
)

const BANK: Question[] = JSON.parse(readFileSync(bankPath, 'utf8'))
console.log(`[bank] loaded ${BANK.length} questions`)

/** Random draw, sorted easy → hard (same ramp as Bible Blitz). */
export function pickQuestions(count: number): Question[] {
  const pool = [...BANK]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(count, pool.length)).sort((a, b) => a.difficulty - b.difficulty)
}
