// Adds the German and Hungarian questions to the shipped bank and builds the
// verse files the app and the arena server show at the reveal (docs/i18n.md).
// Run after compile.mjs (which writes the English bank):
//   node scripts/compile-i18n.mjs
// In:  i18n/<lang>.json (translated questions), data/<lang>-bible.json
//      (fetch-bibles-i18n.mjs + fetch-bibles-modern.mjs), data/hu-karoli.json.
// Out: ../app/src/questions/bank.json (text/answers gain de, hu) and bank.<lang>.json
//      (the app's per-language copies),
//      ../app/src/questions/verses.<lang>.json: { [id]: { ref, text } }, the
//      reference written the way that language does ("1. Mose 2,22", "1Móz 2,22").
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BOOKS, ENGLISH, PLACE, deMark, parse, refText } from './refs.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appQ = join(root, '..', 'app', 'src', 'questions')
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

/** Schlachter's VPL text marks other versifications "(02-1)" and translator additions "[dar]" (italics in print). */
const clean = (t) => t.replace(/\s*\(\d{2,3}-\d+[a-z]?\)\s*/g, ' ').replace(/\[([^\]]*)\]/g, '$1').replace(/\s+/g, ' ').trim()

function verse(lang, bible, fallback, reference) {
  const r = parse(reference)
  const place = PLACE[lang][reference]
  if (place && !Array.isArray(place)) return { ref: refText(lang, r.book, place.ref[0], place.ref[1], place.ref[1]), text: place.text }
  const book = r.book
  const [ch, from, to] = place ? [place[0], place[1], place[2] ?? place[1]] : [r.ch, r.from, r.to]
  const texts = []
  for (let v = from; v <= to; v++) {
    let t = bible[book]?.[ch]?.[v] ?? fallback?.[book]?.[ch]?.[v]
    if (!t) throw new Error(`${lang}: no text for ${book} ${ch}:${v} (${reference})`)
    // A Psalm title in front of the verse is Schlachter's verse 1, not part of the English verse.
    const title = !place && lang === 'de' ? deMark(bible, book, ch, v)?.title : ''
    if (title) t = t.slice(t.indexOf(title) + title.length)
    texts.push(clean(t))
  }
  const shown = place?.[3] === 'keep' ? [r.ch, r.from, r.to] : [ch, from, to]
  return { ref: place || lang !== 'de' ? refText(lang, book, ...shown) : schlachterRef(bible, r), text: texts.join(' ') }
}

/**
 * German references in Schlachter's own numbering (the Psalm titles counted as verses,
 * Jonah 1:17 → 2,1, …), read from its VPL marks like Mission's tie-breakers (refs.mjs).
 */
function schlachterRef(bible, r) {
  const at = (v) => deMark(bible, r.book, r.ch, v) ?? { ch: r.ch, v }
  const a = at(r.from)
  const b = at(r.to)
  if (a.ch === b.ch) return refText('de', r.book, a.ch, a.v, b.v)
  return `${BOOKS.de[ENGLISH.indexOf(r.book)]} ${a.ch},${a.v}–${b.ch},${b.v}`
}

const bank = read(join(appQ, 'bank.json'))
for (const lang of ['de', 'hu']) {
  const tPath = join(root, 'i18n', `${lang}.json`)
  const bPath = join(root, 'data', `${lang}-bible.json`)
  if (!existsSync(bPath)) throw new Error(`${bPath} missing: run fetch-bibles-i18n.mjs and fetch-bibles-modern.mjs`)
  const bible = read(bPath)
  const fallback = lang === 'hu' && existsSync(join(root, 'data', 'hu-karoli.json')) ? read(join(root, 'data', 'hu-karoli.json')) : null
  const tr = existsSync(tPath) ? read(tPath) : {}
  let translated = 0
  const verses = {}
  for (const q of bank) {
    const t = tr[q.id]
    if (t) {
      q.text[lang] = t.text
      q.answers[lang] = t.answers
      translated++
    } else {
      delete q.text[lang]
      delete q.answers[lang]
    }
    verses[q.id] = verse(lang, bible, fallback, q.reference)
  }
  writeFileSync(join(appQ, `verses.${lang}.json`), JSON.stringify(verses))
  console.log(`${lang}: ${translated}/${bank.length} questions translated, ${Object.keys(verses).length} verses`)
}
writeFileSync(join(appQ, 'bank.json'), JSON.stringify(bank, null, 2) + '\n')
// The app downloads only the player's language (+ English as the fallback):
// bank.<lang>.json is bank.json with the other languages left out. The arena
// server keeps reading the full bank.json.
for (const lang of ['en', 'de', 'hu']) {
  const keep = (o) => Object.fromEntries(Object.entries(o).filter(([l]) => l === 'en' || l === lang))
  const slim = bank.map((q) => ({ ...q, text: keep(q.text), answers: keep(q.answers) }))
  writeFileSync(join(appQ, `bank.${lang}.json`), JSON.stringify(slim))
}
