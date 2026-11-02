#!/usr/bin/env node
// Checks the Mission tie-breaker content (docs/mission.md → Questions):
//
//   node scripts/check-mission-numbers.mjs            numbers + places
//   node scripts/check-mission-numbers.mjs --verbose  also print every DE/HU miss with its verse
//
// shared/src/missionNumbers.json — errors (exit 1): bad id/shape, a reference
//   missing from the WEB corpus, an answer that isn't a positive integer, the
//   number not written in the WEB verse ±1 (as digits or English number words),
//   duplicate ids, duplicate (reference, answer) pairs, duplicate English text,
//   text over 110 characters, a missing translation.
//   Warnings: the number not found (as digits or number words) in the German
//   (Schlachter) or Hungarian (Károli OT / Biblica NT) verse ±1 (allowing for
//   verses those Bibles number in the next or previous chapter), or a glossary
//   name (i18n/<lang>-names.json) missing from a translation. Every warning
//   needs a human look; if a translation really has another number, drop the
//   question. A small self-test of the number matchers runs first.
// shared/src/missionPlaces.json — errors: bad shape, duplicate ids or names,
//   coordinates outside the Judah vs Israel frame, a reference missing from the
//   WEB corpus or a verse ±1 that doesn't name the place.
//
// Needs data/web-bible.json, data/de-bible.json, data/hu-bible.json (see README).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { printedAt, refText } from './refs.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const verbose = process.argv.includes('--verbose')
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const web = readJson(path.join(root, 'data', 'web-bible.json'))
const de = readJson(path.join(root, 'data', 'de-bible.json'))
const hu = readJson(path.join(root, 'data', 'hu-bible.json'))
const karoliPath = path.join(root, 'data', 'hu-karoli.json')
const karoli = fs.existsSync(karoliPath) ? readJson(karoliPath) : null

const errors = []
const warnings = []
// Glossary names that are also something else (the goddesses Ashtaroth vs the city; the
// prophet Micah vs the Micah of Judges 17): not reported.
const GLOSSARY_HOMONYMS = new Set(['Ashtaroth', 'Micah'])
// WEB spellings of a place that differ from the name we show.
const WEB_SPELLING = { Bethphage: 'Bethsphage' }
const glossary = Object.fromEntries(
  ['de', 'hu'].map((l) => {
    const p = path.join(root, 'i18n', `${l}-names.json`)
    return [l, fs.existsSync(p) ? readJson(p) : {}]
  }),
)
/** Glossary names in the English text whose translation (by stem, so inflected forms count) is missing. */
function glossaryMisses(en, l, translated) {
  const out = []
  const tr = translated.toLowerCase()
  for (const [name, x] of Object.entries(glossary[l])) {
    if (!x || name.length < 3 || GLOSSARY_HOMONYMS.has(name)) continue
    if (!new RegExp(`(^|[^A-Za-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`).test(en)) continue
    const forms = String(x).toLowerCase().split(/\s*\/\s*/)
    const found = forms.some((f) => tr.includes(f.length > 4 ? f.slice(0, Math.max(4, f.length - 3)) : f.slice(0, Math.max(2, f.length - 1))))
    if (!found) out.push(`"${name}" → "${x}"`)
  }
  return out
}

function parseRef(ref) {
  const m = /^(.+?) (\d+):(\d+)$/.exec(ref ?? '')
  return m ? { book: m[1], ch: m[2], v: Number(m[3]) } : null
}
/**
 * The verse and its neighbours (same chapter), joined. Where a translation numbers the
 * verse differently (Károli's Jonah 1:17 is 2:1), the edges of the chapters around it count too.
 */
function around(bible, r, shifted = false) {
  const spread = 1
  const book = bible?.[r.book]
  const ch = book?.[r.ch]
  if (!ch) return ''
  const out = []
  for (let v = r.v - spread; v <= r.v + spread; v++) if (ch[String(v)]) out.push(ch[String(v)])
  const last = Math.max(...Object.keys(ch).map(Number))
  if (shifted && (!ch[String(r.v)] || r.v >= last - 1 || r.v <= 2)) {
    const prev = book[String(Number(r.ch) - 1)]
    const next = book[String(Number(r.ch) + 1)]
    if (prev) out.push(...Object.entries(prev).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, t]) => t))
    if (next) out.push(next['1'] ?? '', next['2'] ?? '')
  }
  return out.join(' ')
}

/**
 * Translations whose number is spelled in a way the matchers can't read, checked by hand.
 * Key: "reference|answer|lang".
 */
const CHECKED = {
  'Jonah 4:11|120000|hu': 'Károli: „tizenkétszer tízezer” (12 × 10,000)',
}

// ---- number words -------------------------------------------------------

const EN_ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
function enUnder1000(n) {
  const parts = []
  if (n >= 100) {
    parts.push(EN_ONES[Math.floor(n / 100)], 'hundred')
    n %= 100
  }
  if (n >= 20) {
    parts.push(EN_TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + EN_ONES[n % 10] : ''))
  } else if (n > 0 || parts.length === 0) parts.push(EN_ONES[n])
  return parts.join(' ')
}
/** English spellings of n as WEB writes them ("nine hundred sixty-nine", hyphens as spaces). */
function enWords(n) {
  const forms = new Set()
  const millions = Math.floor(n / 1e6)
  const thousands = Math.floor((n % 1e6) / 1000)
  const rest = n % 1000
  const parts = []
  if (millions) parts.push(enUnder1000(millions), 'million')
  if (thousands) parts.push(enUnder1000(thousands), 'thousand')
  if (rest || !parts.length) parts.push(enUnder1000(rest))
  const base = parts.join(' ')
  forms.add(base)
  forms.add(base.replace(/hundred (?=\w)/g, 'hundred and ').replace(/thousand (?=\w)/g, 'thousand and '))
  // "eleven hundred", "twelve hundred and sixty"
  if (n >= 1100 && n < 10000 && Math.floor(n / 100) % 10 !== 0) {
    const h = enUnder1000(Math.floor(n / 100))
    const r = n % 100
    forms.add(`${h} hundred${r ? ' ' + enUnder1000(r) : ''}`)
    forms.add(`${h} hundred${r ? ' and ' + enUnder1000(r) : ''}`)
  }
  // "two and twenty", "nine and thirty"
  for (const f of [...forms]) {
    forms.add(f.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety) (one|two|three|four|five|six|seven|eight|nine)\b/g, '$2 and $1'))
  }
  for (const f of [...forms]) {
    if (/^one (hundred|thousand)/.test(f)) forms.add(f.replace(/^one /, 'a '))
  }
  // ordinals ("the fortieth year")
  for (const f of [...forms]) {
    const last = f.split(' ').pop()
    const ord = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' }[last] ?? (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th')
    forms.add(f.slice(0, f.length - last.length) + ord)
  }
  return [...forms]
}
function normEn(s) {
  return ' ' + s.toLowerCase().replace(/(\d),(\d{3})/g, '$1$2').replace(/[-–—]/g, ' ').replace(/[,;:.!?()]/g, ' , ').replace(/[^a-z0-9, ]/g, ' ').replace(/\s+/g, ' ') + ' '
}
function inEnglish(text, n) {
  const t = normEn(text)
  if (new RegExp(`[^0-9]${n}[^0-9]`).test(t)) return true
  const words = t.trim().split(' ')
  const NUMBER = /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|(thir|four|fif|six|seven|eigh|nine)teen|(twen|thir|for|fif|six|seven|eigh|nine)ty|hundred|thousand|million)$/
  return enWords(n).some((f) => {
    const fw = f.split(' ')
    for (let i = 0; i + fw.length <= words.length; i++) {
      const last = words[i + fw.length - 1]
      if (!fw.every((w, k) => k === fw.length - 1 ? last === w || last === w + 's' : words[i + k] === w)) continue
      const next = words[i + fw.length] ?? ''
      const prev = words[i - 1] ?? ''
      if (NUMBER.test(next) || (next === 'and' && NUMBER.test(words[i + fw.length + 1] ?? ''))) continue
      if (NUMBER.test(prev) || (prev === 'and' && /^(hundred|thousand|million)$/.test(words[i - 2] ?? ''))) continue
      return true
    }
    return false
  })
}

const DE_ONES = ['', 'ein', 'zwei', '(?:drei|drit)', 'vier', 'fünf', 'sechs', '(?:sieben|sieb)', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn']
const DE_TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig']
function deUnder1000(n, alone) {
  let s = ''
  if (n >= 100) {
    s += (Math.floor(n / 100) === 1 ? '(?:ein)?' : DE_ONES[Math.floor(n / 100)]) + 'hundert(?:und)?'
    n %= 100
  }
  if (n >= 20) s += (n % 10 ? DE_ONES[n % 10] + 'und' : '') + DE_TENS[Math.floor(n / 10)]
  else if (n > 0) s += n === 1 && alone ? 'eins?' : DE_ONES[n]
  return s
}
function deRegex(n) {
  const thousands = Math.floor(n / 1000)
  const rest = n % 1000
  let s = ''
  if (thousands) s += (thousands === 1 ? '(?:ein)?' : deUnder1000(thousands)) + 'tausend(?:und)?'
  s += deUnder1000(rest, !thousands)
  return s.replace(/ß/g, '(?:ß|ss)')
}
/** Do 1–6 neighbouring words, joined, spell the number (`num`, a regex source) plus an allowed ending? */
function tokenMatch(tokens, num, endings) {
  const re = new RegExp(`^${num}(?:${endings})$`)
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j <= Math.min(tokens.length, i + 6); j++) if (re.test(tokens.slice(i, j).join(''))) return true
  }
  return false
}
const DE_ENDINGS = '|e|en|er|es|n|s|mal|fach|fältig|ste|sten|ster|te|ten|ter|tel|jährig|jährige[nrs]?|tägig|tägige[nrs]?'
function inGerman(text, n) {
  const t = text.toLowerCase().replace(/(\d)[.,' ](\d{3})/g, '$1$2')
  if (new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(t)) return true
  const tokens = t.split(/[^a-zäöüß0-9]+/).filter(Boolean)
  return tokenMatch(tokens, deRegex(n), DE_ENDINGS)
}

const HU_ONES = ['', 'egy', 'ket(?:to|te|t)?', '(?:harom|harmad)', 'negy', 'ot', 'hat', 'het', 'nyolc', 'kilenc']
const HU_ONES_PREFIX = ['', 'egy', 'ket', 'harom', 'negy', 'ot', 'hat', 'het', 'nyolc', 'kilenc']
const HU_TENS = ['', 'tiz', 'husz', 'harminc', 'negyven', 'otven', 'hatvan', 'hetven', 'nyolcvan', 'kilencven']
const HU_TENS_JOIN = ['', 'tizen', 'huszon', 'harminc', 'negyven', 'otven', 'hatvan', 'hetven', 'nyolcvan', 'kilencven']
function huUnder1000(n, final) {
  let s = ''
  if (n >= 100) {
    s += (Math.floor(n / 100) === 1 ? '(?:egy)?' : HU_ONES_PREFIX[Math.floor(n / 100)]) + 'szaz'
    n %= 100
    if (n) s += '(?:es)?'
  }
  const t = Math.floor(n / 10)
  const o = n % 10
  if (t) s += o ? HU_TENS_JOIN[t] : HU_TENS[t]
  if (o) s += final ? HU_ONES[o] : HU_ONES_PREFIX[o]
  return s
}
function huRegex(n) {
  const thousands = Math.floor(n / 1000)
  const rest = n % 1000
  let s = ''
  if (thousands) s += (thousands === 1 ? '(?:egy)?' : huUnder1000(thousands, false)) + 'ezer'
  if (thousands && rest) s += '(?:es)?'
  if (rest) s += huUnder1000(rest, true)
  return s
}
const stripHu = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/cz/g, 'c')
const HU_ENDINGS = '|mal|mel|nal|nel|szerte|nap|napig|napon|napra|napos|eves|esztendos|szorte|szoros|szorosan|ten|tot|tet|en|an|on|at|et|ot|t|szor|szer|ban|ben|bol|nak|nek|ra|re|ig|al|el|val|vel|ad|ed|od|edik|adik|odik|dik|ik|a|e|je|ja|uk|ok|ek|ak|nyi|s|an?nyi'
function inHungarian(text, n) {
  const t = stripHu(text).replace(/(\d)[.,  ](\d{3})/g, '$1$2')
  if (new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(t)) return true
  const tokens = t.split(/[^a-z0-9]+/).filter(Boolean)
  return tokenMatch(tokens, huRegex(n), HU_ENDINGS)
}

// ---- self-test of the matchers (cheap; guards against a matcher that accepts everything) ----
{
  const cases = [
    [inEnglish, 'All the days of Methuselah were nine hundred sixty-nine years', 969, true],
    [inEnglish, 'two and twenty thousand head of cattle', 22000, true],
    [inEnglish, 'with twelve hundred chariots', 1200, true],
    [inEnglish, 'in the four hundred and eightieth year', 480, true],
    [inEnglish, 'nine hundred sixty-nine years', 960, false],
    [inGerman, 'also daß Methusalahs ganzes Alter 969 Jahre betrug', 969, true],
    [inGerman, 'hundertdreiundfünfzig; und wiewohl', 153, true],
    [inGerman, 'zweiundzwanzigtausend Rinder', 22000, true],
    [inGerman, 'zweiundzwanzigtausend Rinder', 27000, false],
    [inGerman, 'sieben Söhne', 70, false],
    [inGerman, 'Es war aber die dritte Stunde', 3, true],
    [inEnglish, 'a spirit of infirmity eighteen years', 18, true],
    [inHungarian, 'kilenczszáz hatvankilencz esztendő', 969, true],
    [inHungarian, 'ezer és négyszáz szekere', 1400, true],
    [inHungarian, 'tizenkét oroszlán', 12, true],
    [inHungarian, 'huszonkétezer emberre', 27000, false],
    [inHungarian, 'hatalmas sereg', 6, false],
  ]
  for (const [fn, text, n, want] of cases) if (fn(text, n) !== want) errors.push(`self-test: ${fn.name}(${JSON.stringify(text)}, ${n}) should be ${want}`)
}

// ---- numbers --------------------------------------------------------------

const numbersPath = path.resolve(root, '../shared/src/missionNumbers.json')
const numbers = readJson(numbersPath)
const ids = new Set()
const pairs = new Map()
const texts = new Map()
const diff = {}
let deMiss = 0
let huMiss = 0
for (const q of numbers) {
  const id = q.id
  if (!/^n_\d{3}$/.test(id ?? '')) errors.push(`${id}: bad id`)
  if (ids.has(id)) errors.push(`${id}: duplicate id`)
  ids.add(id)
  const r = parseRef(q.reference)
  if (!r || !web[r.book]?.[r.ch]?.[String(r.v)]) {
    errors.push(`${id}: reference "${q.reference}" not in WEB`)
    continue
  }
  if (!Number.isInteger(q.answer) || q.answer <= 0) errors.push(`${id}: answer ${q.answer} is not a positive integer`)
  if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 5) errors.push(`${id}: difficulty ${q.difficulty}`)
  diff[q.difficulty] = (diff[q.difficulty] ?? 0) + 1
  if (q.unit !== undefined && (typeof q.unit !== 'string' || !q.unit)) errors.push(`${id}: bad unit`)
  for (const l of ['en', 'de', 'hu']) {
    const s = q.text?.[l]
    if (typeof s !== 'string' || !s.trim()) errors.push(`${id}: missing text.${l}`)
    else if (s.length > 110) errors.push(`${id}: text.${l} is ${s.length} chars (max 110)`)
    else if (/\d/.test(s.replace(/\b\d+(?=[.:,]\d)/g, '')) && new RegExp(`\\b${q.answer}\\b`).test(s)) errors.push(`${id}: text.${l} gives the answer away`)
  }
  for (const l of ['de', 'hu']) {
    for (const miss of glossaryMisses(q.text?.en ?? '', l, q.text?.[l] ?? '')) warnings.push(`${id}: ${l} glossary: ${miss} not found`)
  }
  const key = `${q.reference}|${q.answer}`
  if (pairs.has(key)) errors.push(`${id}: same reference and answer as ${pairs.get(key)}`)
  pairs.set(key, id)
  const tkey = (q.text?.en ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (texts.has(tkey)) errors.push(`${id}: same English text as ${texts.get(tkey)}`)
  texts.set(tkey, id)
  if (!inEnglish(around(web, r), q.answer)) errors.push(`${id}: ${q.answer} not found in WEB ${q.reference} ±1`)
  if (!inGerman(around(de, r, true), q.answer) && !CHECKED[`${q.reference}|${q.answer}|de`]) {
    deMiss++
    warnings.push(`${id}: de: ${q.answer} not found in Schlachter ${q.reference} ±1` + (verbose ? `\n    ${around(de, r, true)}` : ''))
  }
  if (!inHungarian(around(hu, r, true), q.answer) && !(karoli && inHungarian(around(karoli, r, true), q.answer)) && !CHECKED[`${q.reference}|${q.answer}|hu`]) {
    huMiss++
    warnings.push(`${id}: hu: ${q.answer} not found in ${q.reference} ±1` + (verbose ? `\n    ${around(hu, r, true)}` : ''))
  }
}

// ---- the references shown in German and Hungarian (mission-refs.mjs) ----------
// `ref.de` / `ref.hu` must be what refs.mjs gives, and the answer must be in exactly that verse.
/** Cited verses checked by hand: "id|lang" → why the matcher misses. */
const REF_OK = {
  'n_039|de': 'Schlachter starts 35:23 with "Jakob aber hatte zwölf Söhne"; Luther has it in 35,22',
  'n_353|hu': 'ötezren', 'n_355|hu': 'négyezren', 'n_356|hu': 'száz juha', 'n_363|hu': 'kétezren', 'n_381|hu': 'százfontnyit',
  'place shunem|de': 'Sunem', 'place bethany|hu': 'Bethániából',
}
const verseAt = (bible, book, ch, v) => bible?.[book]?.[String(ch)]?.[String(v)] ?? ''
// Places: names are spelled many ways, so only a shift is reported: the name missing from
// the verse cited but found next to it (the verse is printed under another number).
function checkRefs(id, e, found, shiftOnly = false) {
  for (const [l, bible] of [['de', de], ['hu', hu]]) {
    const at = printedAt(l, e.reference, de)
    const want = refText(l, at.book, at.ch, at.v, at.v)
    if (e.ref?.[l] !== want) errors.push(`${id}: ref.${l} is "${e.ref?.[l]}", expected "${want}" (run scripts/mission-refs.mjs)`)
    const get = (ch, v) => verseAt(bible, at.book, ch, v) || (l === 'hu' ? verseAt(karoli, at.book, ch, v) : '')
    const text = get(at.text.ch, at.text.v)
    if (found(l, text) || REF_OK[`${id}|${l}`]) continue
    const near = [get(at.text.ch, at.text.v - 1), get(at.text.ch, at.text.v + 1), get(at.text.ch + 1, 1), get(at.text.ch + 1, 2)]
    if (!shiftOnly || near.some((t) => found(l, t))) warnings.push(`${id}: ${l}: not in the verse cited as ${want}` + (verbose ? `\n    ${text}` : ''))
  }
}
for (const q of numbers) {
  if (CHECKED[`${q.reference}|${q.answer}|de`] || CHECKED[`${q.reference}|${q.answer}|hu`]) continue
  checkRefs(q.id, q, (l, text) => (l === 'de' ? inGerman(text, q.answer) : inHungarian(text, q.answer)))
}

// ---- places ---------------------------------------------------------------

const placesPath = path.resolve(root, '../shared/src/missionPlaces.json')
let placeCount = 0
if (fs.existsSync(placesPath)) {
  const file = readJson(placesPath)
  if (typeof file._source !== 'string' || !/OpenBible/.test(file._source)) errors.push('missionPlaces: _source must credit OpenBible.info')
  const seen = new Set()
  const names = new Set()
  for (const p of file.places ?? []) {
    placeCount++
    const id = p.id
    if (!/^[a-z0-9-]+$/.test(id ?? '')) errors.push(`place ${id}: bad id`)
    if (seen.has(id)) errors.push(`place ${id}: duplicate id`)
    seen.add(id)
    for (const l of ['en', 'de', 'hu']) {
      if (typeof p.name?.[l] !== 'string' || !p.name[l].trim()) errors.push(`place ${id}: missing name.${l}`)
    }
    for (const l of ['de', 'hu']) {
      for (const miss of glossaryMisses(p.name?.en ?? '', l, p.name?.[l] ?? '')) warnings.push(`place ${id}: ${l} glossary: ${miss} not found`)
    }
    if (names.has(p.name?.en)) errors.push(`place ${id}: duplicate name ${p.name.en}`)
    names.add(p.name?.en)
    if (!(p.lon >= 34.2 && p.lon <= 36.6 && p.lat >= 30.9 && p.lat <= 33.6)) errors.push(`place ${id}: ${p.lat},${p.lon} outside the map frame`)
    if (!['high', 'medium'].includes(p.confidence)) errors.push(`place ${id}: confidence ${p.confidence}`)
    const r = parseRef(p.reference)
    if (!r || !web[r.book]?.[r.ch]?.[String(r.v)]) {
      errors.push(`place ${id}: reference "${p.reference}" not in WEB`)
      continue
    }
    // The place must be named in the verse: its English name without "Mount"/"the"/"Valley of".
    const core = (WEB_SPELLING[p.name.en] ?? p.name.en).replace(/^(Mount|Valley of) /, '').toLowerCase()
    if (!around(web, r).toLowerCase().includes(core)) errors.push(`place ${id}: "${core}" not in WEB ${p.reference} ±1`)
    // The German / Hungarian verse cited should name it too (first letters, spelling varies).
    const stem = (s) => stripHu(s).replace(/[^a-z]/g, '').replace(/^(berg|hegy|tal|volgy)/, '')
    checkRefs(`place ${id}`, p, (l, text) => {
      const words = (p.name?.[l] ?? '').split(/[\s-]+/).map(stem).filter((w) => w.length >= 3 && !/^(berg|hegy|tal|volgy|quelle|forras|wuste|puszta|see|to|bach|patak)$/.test(w))
      return words.some((w) => stem(text).includes(w.slice(0, 4)))
    }, true)
  }
}

// ---- report ---------------------------------------------------------------

for (const w of warnings) console.log('warn  ' + w)
for (const e of errors) console.log('ERROR ' + e)
console.log(
  `\n${numbers.length} number questions (difficulty ${[1, 2, 3, 4, 5].map((d) => `${d}: ${diff[d] ?? 0}`).join(', ')}), ` +
    `${placeCount} places; ${errors.length} errors, ${warnings.length} warnings (de ${deMiss}, hu ${huMiss})`,
)
process.exit(errors.length ? 1 : 0)
