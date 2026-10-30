import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Category, DifficultyPreset, Locale, Question, VerseText } from '@sixtysix/shared'

// Same compiled bank the app bundles — question-pipeline/ is the single source.
const bankPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'app', 'src', 'questions', 'bank.json',
)

const BANK: Question[] = JSON.parse(readFileSync(bankPath, 'utf8'))
// Cited verse text by question id — compiled alongside the bank.
const VERSES: Record<string, string> = JSON.parse(readFileSync(join(dirname(bankPath), 'verses.json'), 'utf8'))
// German and Hungarian verses with their references (question-pipeline/scripts/compile-i18n.mjs).
const LOCAL_VERSES: Partial<Record<Locale, Record<string, VerseText>>> = {}
for (const locale of ['de', 'hu'] as const) {
  try {
    LOCAL_VERSES[locale] = JSON.parse(readFileSync(join(dirname(bankPath), `verses.${locale}.json`), 'utf8'))
  } catch {
    console.warn(`[bank] no verses.${locale}.json — English verses only`)
  }
}
console.log(`[bank] loaded ${BANK.length} questions`)

export const verseFor = (id: string): string => VERSES[id] ?? ''

/** The question's verse in every other language there is one for. */
export function versesFor(id: string): Partial<Record<Locale, VerseText>> {
  const out: Partial<Record<Locale, VerseText>> = {}
  for (const [locale, verses] of Object.entries(LOCAL_VERSES)) if (verses?.[id]) out[locale as Locale] = verses[id]
  return out
}

/** A question's reference written the way `locale` does ("1. Mose 2,22"). */
export const referenceIn = (q: Question, locale: Locale): string => LOCAL_VERSES[locale]?.[q.id]?.ref ?? q.reference

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
