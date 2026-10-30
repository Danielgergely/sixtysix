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
 * Where the Hungarian verse really is, when it isn't at the English number:
 * Károli numbers the Psalms' titles as verses and Job 39–41, Daniel 4, Jonah
 * and Song of Songs 6 differently, its digital text runs some verses together
 * or drops one (Proverbs 12:1, Ecclesiastes 8–12, Job 41:25–34), and the
 * Biblica NT splits John 1:38/39. [chapter, from, to?] in the same book (with
 * 'keep' when only the digital text is off: the printed Bible has the English
 * number, so the reference keeps it), or a
 * literal { ref, text } (text '' = show only the reference). Each entry was
 * checked by reading the verse; re-check them if the Bible source changes.
 */
const HU_PLACE = {
  'Psalms 8:2': [8, 3], 'Psalms 8:3': [8, 4], 'Psalms 19:1': [19, 2], 'Psalms 19:10': [19, 11], 'Psalms 19:14': [19, 15],
  'Psalms 22:1': [22, 2], 'Psalms 22:18': [22, 19], 'Psalms 30:5': [30, 6], 'Psalms 34:8': [34, 9], 'Psalms 40:2': [40, 3],
  'Psalms 40:3': [40, 4], 'Psalms 42:1': [42, 2], 'Psalms 45:8': [45, 9], 'Psalms 46:4': [46, 5], 'Psalms 46:10': [46, 11],
  'Psalms 48:2': [48, 3], 'Psalms 51:7': [51, 9], 'Psalms 51:10': [51, 12], 'Psalms 55:6': [55, 7], 'Psalms 60:8': [60, 10],
  'Psalms 68:5': [68, 6], 'Psalms 69:21': [69, 22], 'Psalms 76:2': [76, 3], 'Psalms 80:8': [80, 9], 'Psalms 83:9': [83, 10],
  'Psalms 84:10': [84, 11], 'Psalms 89:12': [89, 13],
  'Numbers 13:16': [13, 17], 'Numbers 13:22': [13, 23], 'Numbers 13:23': [13, 24], 'Numbers 13:33': [13, 34],
  '1 Samuel 24:4': [24, 5],
  'Job 38:41': [39, 3], 'Job 39:9': [39, 12], 'Job 39:13': [39, 16], 'Job 39:19': [39, 22], 'Job 39:26': [39, 29],
  'Job 40:4': [39, 37], 'Job 40:15-17': [40, 10, 12],
  'Job 41:34': { ref: [41, 25], text: 'Lenéz minden nagy állatot, ő a király minden ragadozó felett.' },
  'Proverbs 12:4': [12, 3, 3, 'keep'],
  'Ecclesiastes 9:4': [9, 6, 6, 'keep'], 'Ecclesiastes 9:11': [9, 13, 13, 'keep'], 'Ecclesiastes 10:1': { ref: [10, 1], text: '' },
  'Ecclesiastes 12:1': [12, 3, 3, 'keep'], 'Ecclesiastes 12:6': [12, 8, 8, 'keep'],
  'Ecclesiastes 12:12': [12, 14, 14, 'keep'], 'Ecclesiastes 12:13': [12, 15, 15, 'keep'],
  'Song of Songs 6:4': [6, 1], 'Song of Songs 6:13': [6, 10],
  'Isaiah 64:8': [64, 7], 'Daniel 4:33': [4, 30],
  'Jonah 1:17': [2, 1], 'Jonah 2:1': [2, 2], 'Jonah 2:10': [2, 11],
  'John 1:41-42': [1, 42, 43], 'John 1:44': [1, 45], 'John 1:46': [1, 47], 'John 1:48': [1, 49],
  'Galatians 5:23': [5, 22, 23],
}
/** The same for German (Schlachter's digital text joins Numbers 1:45–46; the fruit of the Spirit ends in 5:22). */
const DE_PLACE = {
  'Numbers 1:46': [1, 45, 45, 'keep'],
  'Galatians 5:23': [5, 22, 23],
}
const PLACE = { de: DE_PLACE, hu: HU_PLACE }

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
  const place = PLACE[lang][reference]
  if (place && !Array.isArray(place)) return { ref: refText(lang, r.book, place.ref[0], place.ref[1], place.ref[1]), text: place.text }
  const book = r.book
  const [ch, from, to] = place ? [place[0], place[1], place[2] ?? place[1]] : [r.ch, r.from, r.to]
  const texts = []
  for (let v = from; v <= to; v++) {
    const t = bible[book]?.[ch]?.[v] ?? fallback?.[book]?.[ch]?.[v]
    if (!t) throw new Error(`${lang}: no text for ${book} ${ch}:${v} (${reference})`)
    texts.push(clean(t))
  }
  const shown = place?.[3] === 'keep' ? [r.ch, r.from, r.to] : [ch, from, to]
  return { ref: refText(lang, book, ...shown), text: texts.join(' ') }
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
