// Verifies candidate questions in data/generated/*.json against the WEB corpus.
//
// HARD checks (failure → rejected.json):
//   schema, unique ids, 4 unique answers, valid category/difficulty/
//   correctIndex, reference parses and exists in the Bible, and
//   DUPLICATES of an already-accepted question (across all batches and
//   approved-manual.json): same id, same reference + same correct answer,
//   or near-identical question text (token Jaccard ≥ 0.8).
//   Also: ids a human rejected in review (data/review-rejected.json).
// SOFT checks (failure → review-queue.json, for human judgement):
//   the correct answer (or a number-word form of it) appears in the cited
//   verse(s) ±2 verses of context.
//
// Questions already in approved-manual.json are skipped (never re-queued).
//
// Output: data/verified.json, data/review-queue.json, data/rejected.json
// Usage:  node scripts/verify.mjs [--quiet] [--dry-run] [--focus=<file substring>]
//   --quiet     don't list every rejected question
//   --dry-run   report only, don't write verified/review-queue/rejected.json
//   --focus=X   list rejected AND review-queued questions for batch files matching X
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataPath = (...p) => join(root, 'data', ...p)
const readJson = (p, fallback = []) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback)
const bible = readJson(dataPath('web-bible.json'), null)
if (!bible) {
  console.error('data/web-bible.json missing — run node scripts/fetch-bible.mjs')
  process.exit(1)
}
const quiet = process.argv.includes('--quiet')
const dryRun = process.argv.includes('--dry-run')
const focus = process.argv.find((a) => a.startsWith('--focus='))?.slice(8)

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
  const out = []
  for (let v = from - pad; v <= to + pad; v++) if (verses[String(v)]) out.push(verses[String(v)])
  return out.join(' ')
}

// ── numbers → words (WEB style: "one hundred twenty", "twenty-four") ──
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
function numberToWords(n) {
  if (!Number.isInteger(n) || n < 0 || n >= 1e7) return null
  if (n < 20) return ONES[n]
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '')
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numberToWords(n % 100) : '')
  if (n < 1e6) return numberToWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numberToWords(n % 1000) : '')
  return numberToWords(Math.floor(n / 1e6)) + ' million' + (n % 1e6 ? ' ' + numberToWords(n % 1e6) : '')
}
const ORDINALS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh',
  8: 'eighth', 9: 'ninth', 10: 'tenth', 11: 'eleventh', 12: 'twelfth' }

const normalize = (s) => s.toLowerCase().replace(/[’‘'"“”.,;:!?()]/g, '').replace(/\s+/g, ' ').trim()

const STOP_WORDS = new Set(['the', 'and', 'his', 'her', 'with', 'from', 'into', 'king', 'lord', 'that', 'this', 'they', 'them'])

/** Does the correct answer plausibly appear in the cited context? */
function answerInContext(q, ref) {
  const ctx = normalize(contextText(ref))
  const ans = normalize(q.answers.en[q.correctIndex])
  const stripped = ans.replace(/^(a|an|the|on|in|to|at|by)\s+/, '').replace(/s$/, '')
  const candidates = [ans, stripped]
  const numStr = ans.replace(/,/g, '').replace(/\s*(years?|days?|men|cubits?|shekels?|times|sons|talents)$/, '')
  const num = Number(numStr)
  if (numStr !== '' && !Number.isNaN(num)) {
    const w = numberToWords(num)
    if (w) candidates.push(w, w.replace(/-/g, ' '))
    if (ORDINALS[num]) candidates.push(ORDINALS[num])
  }
  // Also pass if any distinctive word (≥4 chars, not a stop word) appears.
  const words = ans.split(/\s+/).filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
  return candidates.some((c) => c && ctx.includes(c)) || words.some((w) => ctx.includes(w))
}

// ── duplicate detection ────────────────────────────────────────────────
const TEXT_STOP = new Set(('a an the of to in on at by for from with and or but is was were be been are ' +
  'did does do what who whom whose which where when why how that this these those as into his her their ' +
  'its he she it they them him according bible verse said say says name named called').split(' '))
const tokens = (s) => new Set(normalize(s).replace(/[-—–]/g, ' ').split(' ').filter((w) => w && !TEXT_STOP.has(w)))
function jaccard(a, b) {
  if (!a.size && !b.size) return 1
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}
const refAnswerKey = (q) => `${q.reference.replace(/\s+/g, ' ').trim().toLowerCase()}|${normalize(q.answers.en[q.correctIndex])}`

class Pool {
  constructor() { this.ids = new Map(); this.refAns = new Map(); this.items = [] }
  add(q, origin) {
    const entry = { q, origin, tokens: tokens(q.text.en) }
    this.ids.set(q.id, entry)
    this.refAns.set(refAnswerKey(q), entry)
    this.items.push(entry)
  }
  /** → reason string if q duplicates something in the pool, else null */
  duplicateOf(q) {
    if (this.ids.has(q.id)) return `duplicate id ${q.id} (${this.ids.get(q.id).origin})`
    const ra = this.refAns.get(refAnswerKey(q))
    if (ra) return `duplicate: same reference + correct answer as ${ra.q.id}`
    const t = tokens(q.text.en)
    for (const e of this.items) {
      const j = jaccard(t, e.tokens)
      if (j >= 0.8) return `duplicate: near-identical text to ${e.q.id} (jaccard ${j.toFixed(2)})`
    }
    return null
  }
}

function schemaErrors(q) {
  const errs = []
  if (!q.id || typeof q.id !== 'string') errs.push('missing id')
  if (!CATEGORIES.includes(q.category)) errs.push(`bad category ${q.category}`)
  if (![1, 2, 3, 4, 5].includes(q.difficulty)) errs.push(`bad difficulty ${q.difficulty}`)
  if (![0, 1, 2, 3].includes(q.correctIndex)) errs.push(`bad correctIndex ${q.correctIndex}`)
  const text = q.text?.en
  if (!text || text.length < 10 || text.length > 160) errs.push('question text missing or bad length')
  const answers = q.answers?.en
  if (!Array.isArray(answers) || answers.length !== 4) errs.push('need exactly 4 answers')
  else {
    if (answers.some((a) => !a || typeof a !== 'string' || a.length > 50)) errs.push('empty or overlong answer')
    else if (new Set(answers.map(normalize)).size !== 4) errs.push('answers not unique')
  }
  if (!parseReference(q.reference)) errs.push(`reference invalid or not in corpus: "${q.reference}"`)
  return errs
}

// ── run ────────────────────────────────────────────────────────────────
const approved = readJson(dataPath('approved-manual.json'))
const humanRejected = new Set(readJson(dataPath('review-rejected.json')).map((r) => r.id))
const approvedIds = new Set(approved.map((q) => q.id))

const pool = new Pool()
for (const q of approved) pool.add(q, 'approved-manual.json')

const files = readdirSync(dataPath('generated')).filter((f) => f.endsWith('.json')).sort()
const verified = []
const review = []
const rejected = []
const perFile = []
const seenBatchIds = new Set()

/** bucket a reason string into a short tally key */
const reasonKey = (e) => e.replace(/ q_[\w]+.*$/, '').replace(/ \(.*\)$/, '').replace(/: ".*"$/, '').replace(/ \d+$/, '')

for (const file of files) {
  const batch = JSON.parse(readFileSync(dataPath('generated', file), 'utf8'))
  const stats = { file, verified: 0, review: 0, rejected: 0, approved: 0, reasons: {} }
  perFile.push(stats)
  const reject = (q, errs) => {
    rejected.push({ file, id: q.id, errors: errs, question: q.text?.en, reference: q.reference })
    stats.rejected++
    for (const e of errs) stats.reasons[reasonKey(e)] = (stats.reasons[reasonKey(e)] ?? 0) + 1
  }
  for (const q of batch) {
    const errs = schemaErrors(q)
    if (!errs.length && seenBatchIds.has(q.id)) errs.push(`duplicate id ${q.id} (generated batches)`)
    if (errs.length) { reject(q, errs); continue }
    seenBatchIds.add(q.id)
    if (approvedIds.has(q.id)) { stats.approved++; continue } // already shipped via approved-manual
    if (humanRejected.has(q.id)) { reject(q, ['rejected in human review']); continue }
    const dup = pool.duplicateOf(q)
    if (dup) { reject(q, [dup]); continue }
    pool.add(q, file)
    const ref = parseReference(q.reference)
    if (!answerInContext(q, ref)) {
      review.push({
        file,
        ...q,
        _verse: contextText(ref, 0),
        _flag: 'correct answer not found in cited verse(s) — confirm manually',
      })
      stats.review++
      continue
    }
    verified.push(q)
    stats.verified++
  }
}

if (!dryRun) {
  writeFileSync(dataPath('verified.json'), JSON.stringify(verified, null, 2))
  writeFileSync(dataPath('review-queue.json'), JSON.stringify(review, null, 2))
  writeFileSync(dataPath('rejected.json'), JSON.stringify(rejected, null, 2))
}

// ── report ─────────────────────────────────────────────────────────────
console.log('Per batch:')
for (const s of perFile) {
  const reasons = Object.entries(s.reasons).map(([k, n]) => `${k} ×${n}`).join('; ')
  console.log(
    `  ${s.file.padEnd(36)} ✅ ${String(s.verified).padStart(3)}  👀 ${String(s.review).padStart(2)}  ` +
      `❌ ${String(s.rejected).padStart(2)}` + (s.approved ? `  ✔ approved ${s.approved}` : '') +
      (reasons ? `   [${reasons}]` : ''),
  )
}
const tally = {}
for (const s of perFile) for (const [k, n] of Object.entries(s.reasons)) tally[k] = (tally[k] ?? 0) + n
if (Object.keys(tally).length) {
  console.log('Rejection reasons (all batches):')
  for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`)
}

function table(title, items) {
  const grid = {}
  for (const c of CATEGORIES) grid[c] = [0, 0, 0, 0, 0]
  for (const q of items) if (grid[q.category]) grid[q.category][q.difficulty - 1]++
  console.log(`${title} (${items.length}):`)
  console.log(`  ${'category'.padEnd(9)}   d1   d2   d3   d4   d5  total`)
  const col = [0, 0, 0, 0, 0]
  for (const c of CATEGORIES) {
    grid[c].forEach((n, i) => (col[i] += n))
    console.log(`  ${c.padEnd(9)} ${grid[c].map((n) => String(n).padStart(4)).join(' ')}  ${String(grid[c].reduce((a, b) => a + b, 0)).padStart(5)}`)
  }
  console.log(`  ${'total'.padEnd(9)} ${col.map((n) => String(n).padStart(4)).join(' ')}  ${String(items.length).padStart(5)}`)
}
table('Shippable = verified + approved-manual', [...verified, ...approved])
if (review.length) table('Review queue', review)

console.log(`✅ verified: ${verified.length}   ✔ approved-manual: ${approved.length}   👀 review: ${review.length}   ❌ rejected: ${rejected.length}`)
if (focus) {
  for (const r of rejected.filter((r) => r.file.includes(focus))) console.log(`   ❌ ${r.file} ${r.id}: ${r.errors.join('; ')}  — ${r.question}`)
  for (const q of review.filter((q) => q.file.includes(focus)))
    console.log(`   👀 ${q.file} ${q.id} [${q.reference}] ${q.text.en} → "${q.answers.en[q.correctIndex]}"`)
} else if (!quiet && rejected.length) for (const r of rejected) console.log(`   ❌ ${r.file} ${r.id}: ${r.errors.join('; ')}`)
if (dryRun) console.log('(dry run — nothing written)')
