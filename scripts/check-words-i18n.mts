/**
 * Checks a translation of the board-game word lists against the English ones,
 * using the server's real matching rules.
 *
 *   npx tsx scripts/check-words-i18n.mts <lang>     (e.g. de, hu)
 *
 * Wolf in the Flock: shared/src/flockWords.<lang>.json
 *   { category: [{ en, word, hint, ref, wolfHint, aliases, clues }] } — same
 *   categories, order and length as flockWords.json; `en` = the English word.
 * Twelve Spies: server/src/spies/words.<lang>.json
 *   { "<English word>": "<translated word>" } for every word of words.json.
 *
 * Exits 1 and lists every problem if anything fails.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { judgeGuess, tokens } from '../server/src/flock/match.ts'
import { saysWord } from '../server/src/flock/handlers.ts'
import { FLOCK_CLUE_MAX, type FlockWord } from '../shared/src/flock.ts'

const lang = process.argv[2]
if (!lang || !/^[a-z]{2}$/.test(lang) || lang === 'en') {
  console.error('usage: npx tsx scripts/check-words-i18n.mts <lang>   (e.g. de, hu)')
  process.exit(2)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))

const WORD_MAX = 22
const HINT_MAX = 60
const CLUES_MIN = 8
const CLUES_MAX = 10
const CLUE_WORDS_MAX = 3
const SPIES_MAX = 12

const errors: string[] = []
const fail = (where: string, msg: string) => errors.push(`${where}: ${msg}`)

// ── Wolf in the Flock ───────────────────────────────────────────────────

type Entry = FlockWord & { en: string }
const enFlock: Record<string, FlockWord[]> = readJson('shared/src/flockWords.json')
const flockPath = `shared/src/flockWords.${lang}.json`
const flock: Record<string, Entry[]> = readJson(flockPath)

const enCats = Object.keys(enFlock)
const cats = Object.keys(flock)
if (cats.join() !== enCats.join()) fail(flockPath, `categories ${cats.join(', ')} ≠ English ${enCats.join(', ')}`)

const str = (x: unknown) => typeof x === 'string' && x.trim() !== '' && x === x.trim()
const strList = (x: unknown) => Array.isArray(x) && x.every(str)

let entries = 0
for (const cat of enCats) {
  const list = flock[cat] ?? []
  const enList = enFlock[cat]
  if (list.length !== enList.length) fail(`${cat}`, `${list.length} entries, English has ${enList.length}`)
  const rivalsOf = (e: Entry) => list.filter((o) => o !== e).map((o) => [o.word, ...(o.aliases ?? [])])

  list.forEach((e, i) => {
    entries++
    const at = `${cat}[${i}] ${e?.word ?? '?'}`
    if (enList[i] && e.en !== enList[i].word) fail(at, `en "${e.en}" ≠ English "${enList[i].word}" (order or id)`)
    for (const k of ['en', 'word', 'hint', 'ref', 'wolfHint'] as const) if (!str(e[k])) fail(at, `missing or untrimmed "${k}"`)
    if (!strList(e.aliases)) fail(at, '"aliases" must be a list of strings')
    if (!strList(e.clues)) fail(at, '"clues" must be a list of strings')
    if (!str(e.word) || !strList(e.aliases) || !strList(e.clues)) return

    if (e.word.length > WORD_MAX) fail(at, `word longer than ${WORD_MAX}`)
    if (e.hint.length > HINT_MAX) fail(at, `hint longer than ${HINT_MAX} (${e.hint.length})`)

    // The word and every alias count as the word (with the category as rivals, like the server).
    const rivals = rivalsOf(e)
    for (const name of [e.word, ...e.aliases]) {
      const v = judgeGuess(name, e.word, e.aliases, rivals)
      if (v !== 'match') fail(at, `"${name}" is judged "${v}", not a match`)
    }
    // No other entry's word is taken for this one.
    for (const o of list) {
      if (o === e) continue
      if (judgeGuess(o.word, e.word, e.aliases, rivals) === 'match') fail(at, `the other entry "${o.word}" is judged a match`)
    }

    if (saysWord(e.wolfHint, e)) fail(at, `wolfHint "${e.wolfHint}" reveals the word or an alias`)

    if (e.clues.length < CLUES_MIN || e.clues.length > CLUES_MAX) fail(at, `${e.clues.length} clues (want ${CLUES_MIN}–${CLUES_MAX})`)
    const seen = new Map<string, string>()
    for (const c of e.clues) {
      if (saysWord(c, e)) fail(at, `clue "${c}" reveals the word or an alias`)
      if (c.length > FLOCK_CLUE_MAX) fail(at, `clue "${c}" longer than ${FLOCK_CLUE_MAX}`)
      if (c.split(/\s+/).length > CLUE_WORDS_MAX) fail(at, `clue "${c}" has more than ${CLUE_WORDS_MAX} words`)
      for (const t of new Set(tokens(c).filter((t) => t.length >= 3))) {
        if (seen.has(t)) fail(at, `clues "${seen.get(t)}" and "${c}" repeat "${t}"`)
        else seen.set(t, c)
      }
    }
  })
}

// ── Twelve Spies ────────────────────────────────────────────────────────

const enSpies: string[] = readJson('server/src/spies/words.json')
const spiesPath = `server/src/spies/words.${lang}.json`
const spies: Record<string, string> = readJson(spiesPath)
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')

for (const w of enSpies) if (!(w in spies)) fail(spiesPath, `no translation for "${w}"`)
for (const w of Object.keys(spies)) if (!enSpies.includes(w)) fail(spiesPath, `"${w}" is not in words.json`)
const values = Object.entries(spies)
for (const [w, t] of values) {
  if (!str(t)) fail(spiesPath, `"${w}": empty or untrimmed`)
  else if (Array.from(t).length > SPIES_MAX) fail(spiesPath, `"${w}" → "${t}" longer than ${SPIES_MAX}`)
  else if (/\s/.test(t)) fail(spiesPath, `"${w}" → "${t}" has a space`)
}
// The dealing rule, case- and accent-insensitive: no word contains another.
for (const [w1, a] of values)
  for (const [w2, b] of values) {
    if (w1 === w2) continue
    if (fold(a) === fold(b)) {
      if (w1 < w2) fail(spiesPath, `"${w1}" and "${w2}" both → "${a}"`)
    } else if (fold(a).includes(fold(b))) fail(spiesPath, `"${a}" (${w1}) contains "${b}" (${w2})`)
  }

// ── report ──────────────────────────────────────────────────────────────

console.log(`${lang}: ${entries} flock entries (${cats.map((c) => `${c} ${flock[c]?.length ?? 0}`).join(', ')}), ${values.length} spies words`)
if (errors.length) {
  for (const e of errors) console.log(`✗ ${e}`)
  console.log(`${errors.length} problem(s)`)
  process.exit(1)
}
console.log('✓ all checks passed')
