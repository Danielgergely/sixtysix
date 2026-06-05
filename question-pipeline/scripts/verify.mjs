// Verifies candidate questions in data/generated/*.json against the WEB corpus.
//
// HARD checks (failure → rejected.json):
//   schema, unique ids, unique question text, 4 unique answers, valid
//   category/difficulty/correctIndex, reference parses and exists in the Bible.
// SOFT checks (failure → review-queue.json, for human judgement):
//   the correct answer (or a number-word form of it) appears in the cited
//   verse(s) ±2 verses of context.
//
// Output: data/verified.json, data/review-queue.json, data/rejected.json
// Usage:  node scripts/verify.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bible = JSON.parse(readFileSync(join(root, 'data', 'web-bible.json'), 'utf8'))

const CATEGORIES = ['torah', 'history', 'wisdom', 'prophets', 'gospels', 'epistles']

// "1 Samuel 17:50" | "Matthew 26:14-16"  →  { book, chapter, from, to }
function parseReference(ref) {
  const m = /^([1-3]?\s?[A-Za-z ]+?)\s(\d+):(\d+)(?:-(\d+))?$/.exec(ref?.trim() ?? '')
  if (!m) return null
  const book = m[1].trim()
  if (!bible[book]) return null
  const chapter = m[2]
  if (!bible[book][chapter]) return null
  const from = Number(m[3])
  const to = m[4] ? Number(m[4]) : from
  if (to < from) return null
  for (let v = from; v <= to; v++) if (!bible[book][chapter][String(v)]) return null
  return { book, chapter, from, to }
}

function contextText({ book, chapter, from, to }, pad = 2) {
  const verses = bible[book][chapter]
  let out = []
  for (let v = from - pad; v <= to + pad; v++) if (verses[String(v)]) out.push(verses[String(v)])
  return out.join(' ')
}

const NUMBER_WORDS = {
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven',
  8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve', 14: 'fourteen',
  18: 'eighteen', 24: 'twenty-four', 30: 'thirty', 40: 'forty', 50: 'fifty',
  70: 'seventy', 100: 'one hundred', 120: 'one hundred twenty',
  140: 'one hundred forty', 150: 'one hundred fifty',
  153: 'one hundred fifty-three', 300: 'three hundred', 450: 'four hundred fifty',
  666: 'six hundred sixty-six', 969: 'nine hundred sixty-nine',
}

const normalize = (s) => s.toLowerCase().replace(/[’'".,;:!?()]/g, '').trim()

const STOP_WORDS = new Set(['the', 'and', 'his', 'her', 'with', 'from', 'into', 'king', 'lord'])

/** Does the correct answer plausibly appear in the cited context? */
function answerInContext(q, ref) {
  const ctx = normalize(contextText(ref))
  const ans = normalize(q.answers.en[q.correctIndex])
  const stripped = ans.replace(/^(a|an|the|on|in)\s+/, '').replace(/s$/, '')
  const candidates = [ans, stripped]
  const num = Number(ans.replace(/,/g, ''))
  if (!Number.isNaN(num) && NUMBER_WORDS[num]) candidates.push(NUMBER_WORDS[num])
  // Also pass if any distinctive word (≥4 chars, not a stop word) appears.
  const words = ans.split(/\s+/).filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
  return candidates.some((c) => c && ctx.includes(c)) || words.some((w) => ctx.includes(w))
}

function hardErrors(q, seenIds, seenTexts) {
  const errs = []
  if (!q.id || typeof q.id !== 'string') errs.push('missing id')
  else if (seenIds.has(q.id)) errs.push(`duplicate id ${q.id}`)
  if (!CATEGORIES.includes(q.category)) errs.push(`bad category ${q.category}`)
  if (![1, 2, 3, 4, 5].includes(q.difficulty)) errs.push(`bad difficulty ${q.difficulty}`)
  if (![0, 1, 2, 3].includes(q.correctIndex)) errs.push(`bad correctIndex ${q.correctIndex}`)
  const text = q.text?.en
  if (!text || text.length < 10 || text.length > 160) errs.push('question text missing or bad length')
  else if (seenTexts.has(normalize(text))) errs.push('duplicate question text')
  const answers = q.answers?.en
  if (!Array.isArray(answers) || answers.length !== 4) errs.push('need exactly 4 answers')
  else {
    if (answers.some((a) => !a || a.length > 50)) errs.push('empty or overlong answer')
    if (new Set(answers.map(normalize)).size !== 4) errs.push('answers not unique')
  }
  if (!parseReference(q.reference)) errs.push(`reference invalid or not in corpus: "${q.reference}"`)
  return errs
}

// ── run ────────────────────────────────────────────────────────────────
const files = readdirSync(join(root, 'data', 'generated')).filter((f) => f.endsWith('.json'))
const verified = []
const review = []
const rejected = []
const seenIds = new Set()
const seenTexts = new Set()

for (const file of files.sort()) {
  const batch = JSON.parse(readFileSync(join(root, 'data', 'generated', file), 'utf8'))
  for (const q of batch) {
    const errs = hardErrors(q, seenIds, seenTexts)
    if (errs.length) {
      rejected.push({ file, id: q.id, errors: errs, question: q.text?.en })
      continue
    }
    seenIds.add(q.id)
    seenTexts.add(normalize(q.text.en))
    const ref = parseReference(q.reference)
    if (!answerInContext(q, ref)) {
      review.push({
        file,
        ...q,
        _verse: contextText(ref, 0),
        _flag: 'correct answer not found in cited verse(s) — confirm manually',
      })
      continue
    }
    verified.push(q)
  }
}

writeFileSync(join(root, 'data', 'verified.json'), JSON.stringify(verified, null, 2))
writeFileSync(join(root, 'data', 'review-queue.json'), JSON.stringify(review, null, 2))
writeFileSync(join(root, 'data', 'rejected.json'), JSON.stringify(rejected, null, 2))
console.log(`✅ verified: ${verified.length}   👀 review: ${review.length}   ❌ rejected: ${rejected.length}`)
if (rejected.length) for (const r of rejected) console.log(`   ❌ ${r.file} ${r.id}: ${r.errors.join('; ')}`)
