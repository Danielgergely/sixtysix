// Adds the German and Hungarian questions to the shipped bank and builds the
// verse files the app and the arena server show at the reveal (docs/i18n.md).
// Run after compile.mjs (which writes the English bank):
//   node scripts/compile-i18n.mjs
// In:  i18n/<lang>.json (translated questions), data/<lang>-bible.json
//      (fetch-bibles-i18n.mjs + fetch-bibles-modern.mjs), data/hu-karoli.json.
// Out: ../app/src/questions/bank.json (text/answers gain de, hu),
//      ../app/src/questions/verses.<lang>.json: { [id]: { ref, text } }, the
//      reference written the way that language does ("1. Mose 2,22", "1Móz 2,22").
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appQ = join(root, '..', 'app', 'src', 'questions')
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

const ENGLISH = Object.keys(read(join(root, 'data', 'web-bible.json')))
// Book names in canonical order (same order as the WEB corpus).
const BOOKS = {
  // Luther 2017 / Loccumer Richtlinien
  de: ['1. Mose', '2. Mose', '3. Mose', '4. Mose', '5. Mose', 'Josua', 'Richter', 'Rut', '1. Samuel', '2. Samuel', '1. Könige', '2. Könige', '1. Chronik', '2. Chronik', 'Esra', 'Nehemia', 'Ester', 'Hiob', 'Psalm', 'Sprüche', 'Prediger', 'Hoheslied', 'Jesaja', 'Jeremia', 'Klagelieder', 'Hesekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadja', 'Jona', 'Micha', 'Nahum', 'Habakuk', 'Zefanja', 'Haggai', 'Sacharja', 'Maleachi', 'Matthäus', 'Markus', 'Lukas', 'Johannes', 'Apostelgeschichte', 'Römer', '1. Korinther', '2. Korinther', 'Galater', 'Epheser', 'Philipper', 'Kolosser', '1. Thessalonicher', '2. Thessalonicher', '1. Timotheus', '2. Timotheus', 'Titus', 'Philemon', 'Hebräer', 'Jakobus', '1. Petrus', '2. Petrus', '1. Johannes', '2. Johannes', '3. Johannes', 'Judas', 'Offenbarung'],
  // The usual Hungarian abbreviations (RÚF)
  hu: ['1Móz', '2Móz', '3Móz', '4Móz', '5Móz', 'Józs', 'Bír', 'Ruth', '1Sám', '2Sám', '1Kir', '2Kir', '1Krón', '2Krón', 'Ezsd', 'Neh', 'Eszt', 'Jób', 'Zsolt', 'Péld', 'Préd', 'Énekek', 'Ézs', 'Jer', 'JSir', 'Ez', 'Dán', 'Hós', 'Jóel', 'Ám', 'Abd', 'Jón', 'Mik', 'Náh', 'Hab', 'Zof', 'Hag', 'Zak', 'Mal', 'Mt', 'Mk', 'Lk', 'Jn', 'ApCsel', 'Róm', '1Kor', '2Kor', 'Gal', 'Ef', 'Fil', 'Kol', '1Thessz', '2Thessz', '1Tim', '2Tim', 'Tit', 'Filem', 'Zsid', 'Jak', '1Pt', '2Pt', '1Jn', '2Jn', '3Jn', 'Júd', 'Jel'],
}
/**
 * Károli numbers a few Old Testament verses differently from the WEB, and its
 * digital text runs Job 41:25–34 together; these point the Hungarian verse at
 * the right place ([book, chapter, verse] in Károli, or literal text).
 */
const KAROLI_PLACE = {
  'Jonah 1:17': ['Jonah', 2, 1],
  'Job 38:41': ['Job', 39, 3],
  'Song of Songs 6:13': ['Song of Songs', 6, 10],
  'Job 41:34': { ref: [41, 25], text: 'Lenéz minden nagy állatot, ő a király minden ragadozó felett.' },
}

function parse(reference) {
  const m = reference.match(/^(.+?) (\d+):(\d+)(?:[-–](\d+))?$/)
  if (!m) throw new Error(`can't parse reference ${reference}`)
  return { book: m[1], ch: +m[2], from: +m[3], to: +(m[4] ?? m[3]) }
}

/** Schlachter's VPL text marks other versifications "(02-1)" and translator additions "[dar]" (italics in print). */
const clean = (t) => t.replace(/\s*\(\d{2,3}-\d+[a-z]?\)\s*/g, ' ').replace(/\[([^\]]*)\]/g, '$1').replace(/\s+/g, ' ').trim()

const refText = (lang, book, ch, from, to) => `${BOOKS[lang][ENGLISH.indexOf(book)]} ${ch},${from}${to !== from ? `–${to}` : ''}`

function verse(lang, bible, fallback, reference) {
  const r = parse(reference)
  const place = lang === 'hu' ? KAROLI_PLACE[reference] : undefined
  if (place && !Array.isArray(place)) return { ref: refText(lang, r.book, place.ref[0], place.ref[1], place.ref[1]), text: place.text }
  const [book, ch, from, to] = Array.isArray(place) ? [place[0], place[1], place[2], place[2]] : [r.book, r.ch, r.from, r.to]
  const texts = []
  for (let v = from; v <= to; v++) {
    const t = bible[book]?.[ch]?.[v] ?? fallback?.[book]?.[ch]?.[v]
    if (!t) throw new Error(`${lang}: no text for ${book} ${ch}:${v} (${reference})`)
    texts.push(clean(t))
  }
  return { ref: refText(lang, book, ch, from, to), text: texts.join(' ') }
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
