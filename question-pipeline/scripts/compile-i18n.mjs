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
 * Károli numbers the Psalms' titles as verses and Numbers 13, 1 Samuel 24,
 * 1 Kings 18/22, Job 39–41, Daniel 4, Hosea 14, Jonah, Isaiah 64 and Song of
 * Songs 6 differently; its digital text runs some verses together or drops one
 * (Job 37, Proverbs 12, Ecclesiastes 1–2 and 8–12, Isaiah 3–4, Hosea 1–2,
 * Job 41:25–34, Song of Songs 5:16), and the Biblica NT splits John 1:38/39 and
 * ends Titus 1:3 with the address. [chapter, from, to?] in the same book (with
 * 'keep' when only the digital text is off: the printed Bible has the English
 * number, so the reference keeps it), or a
 * literal { ref, text } (text '' = show only the reference). Each entry was
 * checked by reading the verse; re-check them if the Bible source changes.
 */
const HU_PLACE = {
  'Numbers 13:6': [13, 7], 'Numbers 13:8': [13, 9], 'Numbers 13:16': [13, 17], 'Numbers 13:20': [13, 21],
  'Numbers 13:21': [13, 22],
  'Numbers 13:22': [13, 23], 'Numbers 13:23': [13, 24], 'Numbers 13:25': [13, 26], 'Numbers 13:30': [13, 31],
  'Numbers 13:33': [13, 34],
  '1 Samuel 24:1': [24, 2], '1 Samuel 24:2': [24, 3], '1 Samuel 24:4': [24, 5], '1 Samuel 24:6': [24, 7],
  '1 Samuel 24:14': [24, 15],
  '1 Kings 18:33': [18, 34], '1 Kings 22:48': [22, 49],
  'Job 37:9': [37, 8, 8, 'keep'], 'Job 38:39': [39, 1], 'Job 38:41': [39, 3], 'Job 39:1': [39, 4], 'Job 39:5': [39, 8],
  'Job 39:9': [39, 12], 'Job 39:13': [39, 16], 'Job 39:19': [39, 22], 'Job 39:26': [39, 29], 'Job 39:27': [39, 30],
  'Job 40:4': [39, 37], 'Job 40:15-17': [40, 10, 12], 'Job 40:15': [40, 10], 'Job 40:18': [40, 13],
  'Job 41:31': { ref: [41, 25], text: 'Felkavarja a mély vizet, mint a fazekat, a tengert olyanná teszi, mint a festékedény.' },
  'Job 41:34': { ref: [41, 25], text: 'Lenéz minden nagy állatot, ő a király minden ragadozó felett.' },
  'Psalms 3:3': [3, 4], 'Psalms 3:5': [3, 6], 'Psalms 4:7': [4, 8], 'Psalms 4:8': [4, 9], 'Psalms 5:3': [5, 4],
  'Psalms 5:9': [5, 10], 'Psalms 6:6': [6, 7], 'Psalms 8:1': [8, 2], 'Psalms 8:2': [8, 3], 'Psalms 8:3': [8, 4],
  'Psalms 8:4': [8, 5], 'Psalms 8:5': [8, 6], 'Psalms 9:1': [9, 2], 'Psalms 9:9': [9, 10], 'Psalms 12:6': [12, 7],
  'Psalms 18:1': [18, 2], 'Psalms 18:2': [18, 3], 'Psalms 18:10': [18, 11], 'Psalms 18:16': [18, 17], 'Psalms 18:29': [18, 30],
  'Psalms 18:33': [18, 34], 'Psalms 19:1': [19, 2], 'Psalms 19:5': [19, 6], 'Psalms 19:7': [19, 8], 'Psalms 19:10': [19, 11],
  'Psalms 19:14': [19, 15], 'Psalms 20:1': [20, 2], 'Psalms 20:7': [20, 8], 'Psalms 21:3': [21, 4], 'Psalms 22:1': [22, 2],
  'Psalms 22:6': [22, 7], 'Psalms 22:14': [22, 15], 'Psalms 22:18': [22, 19], 'Psalms 30:5': [30, 6], 'Psalms 30:11': [30, 12],
  'Psalms 31:5': [31, 6], 'Psalms 31:12': [31, 13], 'Psalms 31:15': [31, 16], 'Psalms 34:1': [34, 2], 'Psalms 34:7': [34, 8],
  'Psalms 34:8': [34, 9], 'Psalms 34:10': [34, 11], 'Psalms 34:20': [34, 21], 'Psalms 36:9': [36, 10], 'Psalms 38:4': [38, 5],
  'Psalms 39:12': [39, 13], 'Psalms 40:1': [40, 2], 'Psalms 40:2': [40, 3], 'Psalms 40:3': [40, 4], 'Psalms 41:1': [41, 2],
  'Psalms 41:9': [41, 10], 'Psalms 42:1': [42, 2], 'Psalms 42:3': [42, 4], 'Psalms 42:5': [42, 6], 'Psalms 42:7': [42, 8],
  'Psalms 44:22': [44, 23], 'Psalms 45:1': [45, 2], 'Psalms 45:6': [45, 7], 'Psalms 45:8': [45, 9], 'Psalms 46:1': [46, 2],
  'Psalms 46:4': [46, 5], 'Psalms 46:9': [46, 10], 'Psalms 46:10': [46, 11], 'Psalms 47:1': [47, 2], 'Psalms 48:2': [48, 3],
  'Psalms 48:12': [48, 13], 'Psalms 49:20': [49, 21], 'Psalms 51:7': [51, 9], 'Psalms 51:10': [51, 12], 'Psalms 51:11': [51, 13],
  'Psalms 51:17': [51, 19], 'Psalms 52:8': [52, 10], 'Psalms 54:4': [54, 6], 'Psalms 55:6': [55, 7], 'Psalms 55:17': [55, 18],
  'Psalms 55:22': [55, 23], 'Psalms 56:3': [56, 4], 'Psalms 56:8': [56, 9], 'Psalms 57:1': [57, 2], 'Psalms 58:4': [58, 5],
  'Psalms 59:6': [59, 7], 'Psalms 60:8': [60, 10], 'Psalms 61:2': [61, 3], 'Psalms 62:1': [62, 2], 'Psalms 63:1': [63, 2],
  'Psalms 63:6': [63, 7], 'Psalms 64:3': [64, 4], 'Psalms 65:9': [65, 10], 'Psalms 67:1': [67, 2], 'Psalms 68:5': [68, 6],
  'Psalms 68:6': [68, 7], 'Psalms 68:27': [68, 28], 'Psalms 68:31': [68, 32], 'Psalms 69:2': [69, 3], 'Psalms 69:9': [69, 10],
  'Psalms 69:21': [69, 22], 'Psalms 75:7': [75, 8], 'Psalms 76:2': [76, 3], 'Psalms 77:20': [77, 21], 'Psalms 80:1': [80, 2],
  'Psalms 80:8': [80, 9], 'Psalms 81:3': [81, 4], 'Psalms 81:16': [81, 17], 'Psalms 83:9': [83, 10], 'Psalms 84:3': [84, 4],
  'Psalms 84:10': [84, 11], 'Psalms 84:11': [84, 12], 'Psalms 85:10': [85, 11], 'Psalms 88:18': [88, 19],
  'Psalms 89:9': [89, 10],
  'Psalms 89:10': [89, 11], 'Psalms 89:12': [89, 13], 'Psalms 89:20': [89, 21], 'Psalms 92:12': [92, 13],
  'Psalms 102:6': [102, 7],
  'Psalms 102:7': [102, 8], 'Psalms 108:2': [108, 3], 'Psalms 140:3': [140, 4], 'Psalms 142:4': [142, 5],
  'Proverbs 12:4': [12, 3, 3, 'keep'], 'Proverbs 12:10': [12, 9, 9, 'keep'], 'Proverbs 12:15': [12, 14, 14, 'keep'],
  'Proverbs 12:19': [12, 18, 18, 'keep'], 'Proverbs 12:22': [12, 21, 21, 'keep'],
  'Proverbs 12:25': [12, 24, 24, 'keep'],
  'Ecclesiastes 1:18': [2, 1, 1, 'keep'], 'Ecclesiastes 2:4': [2, 5, 5, 'keep'], 'Ecclesiastes 2:6': [2, 7, 7, 'keep'],
  'Ecclesiastes 2:8': [2, 9, 9, 'keep'], 'Ecclesiastes 2:14': [2, 15, 15, 'keep'],
  'Ecclesiastes 9:4': [9, 6, 6, 'keep'], 'Ecclesiastes 9:7': [9, 9, 9, 'keep'], 'Ecclesiastes 9:11': [9, 13, 13, 'keep'],
  'Ecclesiastes 9:15': [9, 17, 17, 'keep'], 'Ecclesiastes 9:16': [9, 18, 18, 'keep'],
  'Ecclesiastes 10:1': { ref: [10, 1], text: '' },
  'Ecclesiastes 10:4': [10, 1, 1, 'keep'], 'Ecclesiastes 10:8': [10, 5, 5, 'keep'], 'Ecclesiastes 10:18': [10, 15, 15, 'keep'],
  'Ecclesiastes 10:19': [10, 16, 16, 'keep'], 'Ecclesiastes 10:20': [10, 17, 17, 'keep'],
  'Ecclesiastes 11:9': [12, 1, 1, 'keep'], 'Ecclesiastes 12:1': [12, 3, 3, 'keep'], 'Ecclesiastes 12:6': [12, 8, 8, 'keep'],
  'Ecclesiastes 12:7': [12, 9, 9, 'keep'], 'Ecclesiastes 12:9': [12, 11, 11, 'keep'],
  'Ecclesiastes 12:11': [12, 13, 13, 'keep'], 'Ecclesiastes 12:12': [12, 14, 14, 'keep'],
  'Ecclesiastes 12:13': [12, 15, 15, 'keep'],
  'Song of Songs 6:2': { ref: [5, 16], text: 'Az én szerelmesem, elment az ő kertébe, a drága füveknek táblái közé, hogy lakozzék a kertekben, és liliomokat szedjen.' },
  'Song of Songs 6:4': [6, 1], 'Song of Songs 6:9': [6, 6], 'Song of Songs 6:13': [6, 10],
  'Isaiah 4:1': { ref: [4, 1], text: 'És megragad hét asszony egy férfit ama napon, mondván: A magunk kenyerét eszszük és a mi ruhánkba öltözködünk, csak hadd neveztessünk a te nevedről, és vedd le rólunk gyalázatunkat!' },
  'Isaiah 4:5': [4, 4, 4, 'keep'], 'Isaiah 64:6': [64, 5], 'Isaiah 64:8': [64, 7],
  'Daniel 4:11': [4, 8], 'Daniel 4:16': [4, 13], 'Daniel 4:30': [4, 27], 'Daniel 4:33': [4, 30], 'Daniel 4:34': [4, 31],
  'Daniel 4:37': [4, 34],
  'Hosea 2:15': [2, 14, 14, 'keep'], 'Hosea 2:16': [2, 15, 15, 'keep'], 'Hosea 14:1': [14, 2], 'Hosea 14:5': [14, 6],
  'Jonah 1:17': [2, 1], 'Jonah 2:1': [2, 2], 'Jonah 2:5': [2, 6], 'Jonah 2:9': [2, 10], 'Jonah 2:10': [2, 11],
  'John 1:38': [1, 39], 'John 1:39': [1, 40], 'John 1:41-42': [1, 42, 43], 'John 1:42': [1, 43], 'John 1:44': [1, 45],
  'John 1:46': [1, 47], 'John 1:47': [1, 48], 'John 1:48': [1, 49], 'John 1:49': [1, 50],
  '2 Corinthians 13:14': [13, 13],
  'Galatians 5:23': [5, 22, 23],
  'Titus 1:4': [1, 3, 4],
}
/**
 * The same for German. Schlachter's digital text joins Numbers 1:45–46 and
 * spreads 1:47 over 46–47; it divides 1 Samuel 24:1–2, Romans 16:4–5 and
 * Philippians 4:12–13 at other places than the WEB; 1 Kings 18:34 starts at
 * "Fill four jars" (Hebrew numbering); the fruit of the Spirit ends in
 * Galatians 5:22.
 */
const DE_PLACE = {
  'Numbers 1:46': [1, 45, 45, 'keep'], 'Numbers 1:47': [1, 46, 47, 'keep'],
  '1 Samuel 24:1': [24, 1, 2], '1 Kings 18:33': [18, 34],
  'Romans 16:5': [16, 4, 5], 'Galatians 5:23': [5, 22, 23], 'Philippians 4:12': [4, 12, 13],
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
