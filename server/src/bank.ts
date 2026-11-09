import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { difficultyRange, type Category, type DifficultyPreset, type Locale, type Question, type VerseText } from '@sixtysix/shared'

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

const BY_ID = new Map(BANK.map((q) => [q.id, q]))
export const questionById = (id: string): Question | undefined => BY_ID.get(id)

/**
 * Questions out of play: an open or confirmed flag (server/src/flags.ts keeps
 * this up to date). No game or scroll draws them until they are resolved.
 */
let outOfPlay = new Set<string>()
export function setOutOfPlay(ids: Iterable<string>): void {
  outOfPlay = new Set(ids)
}

/** The question's verse in every other language there is one for. */
export function versesFor(id: string): Partial<Record<Locale, VerseText>> {
  const out: Partial<Record<Locale, VerseText>> = {}
  for (const [locale, verses] of Object.entries(LOCAL_VERSES)) if (verses?.[id]) out[locale as Locale] = verses[id]
  return out
}

/** A question's reference written the way `locale` does ("1. Mose 2,22"). */
export const referenceIn = (q: Question, locale: Locale): string => LOCAL_VERSES[locale]?.[q.id]?.ref ?? q.reference

export interface PickOptions {
  categories?: Category[]
  difficulty?: DifficultyPreset
  /** Mixed only: include level 5. */
  withImpossible?: boolean
  /** Ids to avoid (recently played by this host); used only while enough remain. */
  exclude?: Set<string>
  /** Only questions whose reference is in this book (its English name, e.g. "1 Kings"). */
  book?: string
}

/** Fisher–Yates, in place (returns `xs`). */
export function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}

/** Random draw within the filters, sorted easy → hard (same ramp as Bible Blitz). */
export function pickQuestions(count: number, opts: PickOptions = {}): Question[] {
  const [min, max] = difficultyRange(opts.difficulty, opts.withImpossible)
  const cats = opts.categories?.length ? new Set(opts.categories) : null
  const eligible = BANK.filter(
    (q) =>
      q.difficulty >= min &&
      q.difficulty <= max &&
      (!cats || cats.has(q.category)) &&
      !outOfPlay.has(q.id) &&
      (!opts.book || q.reference.startsWith(opts.book + ' ')),
  )
  // Prefer unseen questions; top up with seen ones once the fresh pool runs dry.
  const fresh = shuffle(eligible.filter((q) => !opts.exclude?.has(q.id)))
  const seen = shuffle(eligible.filter((q) => opts.exclude?.has(q.id)))
  return [...fresh, ...seen].slice(0, count).sort((a, b) => a.difficulty - b.difficulty)
}
