/**
 * Checks a translation of the board-game word lists against the English originals
 * and the server's real matching rules.
 *
 *   npx tsx scripts/check-words-i18n.mts de
 *
 * - Wolf in the Flock: shared/src/flockWords.<lang>.json — same categories, order and
 *   length as shared/src/flockWords.json; each entry { en, word, hint, ref, wolfHint, aliases, clues }.
 * - Twelve Spies: server/src/spies/words.<lang>.json — { "<English word>": "<translation>" }.
 *
 * Exits 1 on any error (warnings don't fail).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { judgeGuess, tokens } from '../server/src/flock/match.ts'
import { revealsWord, saysWord } from '../server/src/flock/handlers.ts'

const lang = process.argv[2]
if (!lang || !/^[a-z]{2}$/.test(lang) || lang === 'en') {
  console.error('usage: npx tsx scripts/check-words-i18n.mts <lang>   (e.g. de, hu)')
  process.exit(2)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))

const errors: string[] = []
const warnings: string[] = []
const err = (m: string) => errors.push(m)
const warn = (m: string) => warnings.push(m)

// ── Wolf in the Flock ───────────────────────────────────────────────────

interface Entry {
  en: string
  word: string
  hint: string
  ref: string
  wolfHint: string
  aliases: string[]
  clues: string[]
}

const enFlock: Record<string, { word: string }[]> = readJson('shared/src/flockWords.json')
const flock: Record<string, Entry[]> = readJson(`shared/src/flockWords.${lang}.json`)

const enCats = Object.keys(enFlock)
const cats = Object.keys(flock)
if (cats.join() !== enCats.join()) err(`flock: categories ${cats.join()} ≠ English ${enCats.join()}`)

let flockCount = 0
for (const cat of enCats) {
  const list = flock[cat] ?? []
  const enList = enFlock[cat]
  if (list.length !== enList.length) err(`flock ${cat}: ${list.length} entries, English has ${enList.length}`)
  const rivalsOf = (e: Entry) => list.filter((o) => o !== e).map((o) => [o.word, ...(o.aliases ?? [])])
  list.forEach((e, i) => {
    flockCount++
    const at = `flock ${cat}[${i}] ${e?.word ?? '?'}`
    if (enList[i] && e.en !== enList[i].word) err(`${at}: en "${e.en}" ≠ English "${enList[i].word}"`)
    for (const f of ['en', 'word', 'hint', 'ref', 'wolfHint'] as const) {
      if (typeof e[f] !== 'string' || !e[f].trim()) err(`${at}: missing ${f}`)
    }
    if (!Array.isArray(e.aliases) || e.aliases.some((a) => typeof a !== 'string' || !a.trim())) err(`${at}: aliases must be a list of strings`)
    if (!Array.isArray(e.clues) || e.clues.some((c) => typeof c !== 'string' || !c.trim())) {
      err(`${at}: clues must be a list of strings`)
      return
    }
    if (typeof e.word !== 'string') return
    const aliases = e.aliases ?? []
    if (Array.from(e.word).length > 22) err(`${at}: word longer than 22 characters`)
    if (Array.from(e.hint ?? '').length > 60) err(`${at}: hint longer than 60 characters (${Array.from(e.hint).length})`)
    if (e.clues.length < 8 || e.clues.length > 10) err(`${at}: ${e.clues.length} clues (want 8–10)`)

    // The word and each alias count as the word (with the category's other entries as rivals).
    const rivals = rivalsOf(e)
    for (const name of [e.word, ...aliases]) {
      const v = judgeGuess(name, e.word, aliases, rivals)
      if (v !== 'match') err(`${at}: "${name}" is judged "${v}", not a match`)
      if (!tokens(name).length) err(`${at}: "${name}" has no letters the server can compare`)
    }
    // No other entry of the category is taken for this one.
    for (const o of list) {
      if (o === e) continue
      for (const name of [o.word, ...(o.aliases ?? [])]) {
        if (judgeGuess(name, e.word, aliases, rivals) === 'match') err(`${at}: "${name}" (${o.word}) is also judged a match`)
      }
    }
    // Neither the wolf hint nor a clue gives the word away.
    if (saysWord(e.wolfHint, e) || revealsWord(e.wolfHint, e.word)) err(`${at}: wolfHint "${e.wolfHint}" says the word`)
    const seen = new Map<string, string>()
    for (const c of e.clues) {
      if (saysWord(c, e)) err(`${at}: clue "${c}" says the word or an alias`)
      if (c.trim().split(/\s+/).length > 3 || Array.from(c).length > 24) err(`${at}: clue "${c}" is too long for a player clue (≤ 3 words, 24 chars)`)
      for (const t of new Set(tokens(c).filter((t) => t.length >= 3))) {
        if (seen.has(t)) err(`${at}: clues "${seen.get(t)}" and "${c}" repeat "${t}"`)
        else seen.set(t, c)
      }
    }
    if (/ß/.test([e.word, ...aliases].join(' '))) warn(`${at}: "ß" in the word/aliases — the server's tokens() turns it into a word break`)
  })
}

// ── Twelve Spies ────────────────────────────────────────────────────────

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')

const enSpies: string[] = readJson('server/src/spies/words.json')
const spies: Record<string, string> = readJson(`server/src/spies/words.${lang}.json`)
for (const w of enSpies) {
  const t = spies[w]
  if (typeof t !== 'string' || !t.trim()) err(`spies: no translation for "${w}"`)
  else if (Array.from(t).length > 12) err(`spies: "${w}" → "${t}" is longer than 12 characters`)
  else if (Array.from(t).length > 11) warn(`spies: "${w}" → "${t}" has 12 characters (tight on a phone grid)`)
  if (typeof t === 'string' && !/^[\p{L}\p{N}'’ -]+$/u.test(t)) err(`spies: "${w}" → "${t}" has unexpected characters`)
}
for (const k of Object.keys(spies)) if (!enSpies.includes(k)) err(`spies: "${k}" is not an English word of the list`)
const vals = enSpies.map((w) => [w, spies[w]] as const).filter(([, t]) => typeof t === 'string' && t.trim())
for (const [w, t] of vals) {
  for (const [w2, t2] of vals) {
    if (w === w2) continue
    const a = fold(t)
    const b = fold(t2)
    if (a === b) {
      if (w < w2) err(`spies: "${w}" and "${w2}" both → "${t}"`)
    } else if (a.includes(b)) err(`spies: "${t}" (${w}) contains "${t2}" (${w2})`)
  }
}

// ── report ──────────────────────────────────────────────────────────────

for (const w of warnings) console.log(`warning: ${w}`)
for (const e of errors) console.log(`ERROR: ${e}`)
console.log(`${lang}: ${flockCount} flock entries, ${vals.length}/${enSpies.length} spies words — ${errors.length} errors, ${warnings.length} warnings`)
process.exit(errors.length ? 1 : 0)
