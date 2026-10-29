import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Category, DifficultyPreset, Question } from '@sixtysix/shared'

// Same compiled bank the app bundles — question-pipeline/ is the single source.
const bankPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'app', 'src', 'questions', 'bank.json',
)

const BANK: Question[] = JSON.parse(readFileSync(bankPath, 'utf8'))
// Cited verse text by question id — compiled alongside the bank.
const VERSES: Record<string, string> = JSON.parse(readFileSync(join(dirname(bankPath), 'verses.json'), 'utf8'))
console.log(`[bank] loaded ${BANK.length} questions`)

export const verseFor = (id: string): string => VERSES[id] ?? ''

const DIFFICULTY_RANGE: Record<DifficultyPreset, [number, number]> = {
  easy: [1, 2],
  mixed: [1, 5],
  hard: [3, 5],
}

export interface PickOptions {
  categories?: Category[]
  difficulty?: DifficultyPreset
  /** Ids to avoid (recently played by this host); used only while enough remain. */
  exclude?: Set<string>
}

function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}

/** Random draw within the filters, sorted easy → hard (same ramp as Bible Blitz). */
export function pickQuestions(count: number, opts: PickOptions = {}): Question[] {
  const [min, max] = DIFFICULTY_RANGE[opts.difficulty ?? 'mixed']
  const cats = opts.categories?.length ? new Set(opts.categories) : null
  const eligible = BANK.filter(
    (q) => q.difficulty >= min && q.difficulty <= max && (!cats || cats.has(q.category)),
  )
  // Prefer unseen questions; top up with seen ones once the fresh pool runs dry.
  const fresh = shuffle(eligible.filter((q) => !opts.exclude?.has(q.id)))
  const seen = shuffle(eligible.filter((q) => opts.exclude?.has(q.id)))
  return [...fresh, ...seen].slice(0, count).sort((a, b) => a.difficulty - b.difficulty)
}
