// Interactive human review of data/review-queue.json (no dependencies).
//
// For each queued question it shows the question, the answers (correct one
// marked), the reference and the verse text (cited verses ±2 for context).
//   a = approve → appended to data/approved-manual.json, removed from queue
//   r = reject  → appended to data/review-rejected.json, removed from queue
//                 (verify.mjs then keeps it out of the queue for good)
//   s = skip    → stays in the queue
//   q = quit    → save and exit
// Decisions are saved after every keypress, so quitting/crashing loses nothing.
// Usage: node scripts/review.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataPath = (f) => join(root, 'data', f)
const readJson = (p, fallback = []) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback)
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n')

const QUEUE = dataPath('review-queue.json')
const APPROVED = dataPath('approved-manual.json')
const REJECTED = dataPath('review-rejected.json')

let queue = readJson(QUEUE)
const bible = readJson(dataPath('web-bible.json'), null)

const B = (s) => `\x1b[1m${s}\x1b[0m`
const G = (s) => `\x1b[32m${s}\x1b[0m`
const D = (s) => `\x1b[2m${s}\x1b[0m`

function verseBlock(ref) {
  const m = /^([1-3]?\s?[A-Za-z ]+?)\s(\d+):(\d+)(?:-(\d+))?$/.exec(ref?.trim() ?? '')
  const ch = m && bible?.[m[1].trim()]?.[m[2]]
  if (!ch) return D('  (verse text unavailable)')
  const from = Number(m[3])
  const to = m[4] ? Number(m[4]) : from
  const lines = []
  for (let v = from - 2; v <= to + 2; v++) {
    const t = ch[String(v)]
    if (!t) continue
    const cited = v >= from && v <= to
    lines.push(cited ? `  ${B(`${v}`)} ${t}` : D(`  ${v} ${t}`))
  }
  return lines.join('\n')
}

function show(q, i, total) {
  const ans = q.answers.en
    .map((a, k) => (k === q.correctIndex ? G(`  ✔ ${'ABCD'[k]}. ${a}`) : `    ${'ABCD'[k]}. ${a}`))
    .join('\n')
  console.log(
    `\n${D('─'.repeat(70))}\n${D(`[${i + 1}/${total}] ${q.id} · ${q.category} · d${q.difficulty} · ${q.file ?? ''}`)}\n` +
      `${B(q.text.en)}\n${ans}\n\n${B(q.reference)}\n${verseBlock(q.reference)}\n` +
      (q._flag ? D(`  flag: ${q._flag}\n`) : ''),
  )
}

const strip = ({ _verse, _flag, ...q }) => q

if (!queue.length) {
  console.log('Review queue is empty. 🎉')
  process.exit(0)
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false })
const lines = rl[Symbol.asyncIterator]()
async function ask(prompt) {
  process.stdout.write(prompt)
  const { value, done } = await lines.next()
  return done ? null : value.trim().toLowerCase()
}

const total = queue.length
let approvedN = 0
let rejectedN = 0
let idx = 0
const pending = [...queue]
for (const q of pending) {
  show(q, idx++, total)
  let key
  for (;;) {
    key = await ask('[a]pprove  [r]eject  [s]kip  [q]uit > ')
    if (key === null) key = 'q' // stdin closed → quit cleanly
    if (['a', 'r', 's', 'q'].includes(key[0])) { key = key[0]; break }
  }
  if (key === 'q') break
  if (key === 's') continue
  queue = queue.filter((x) => x.id !== q.id)
  if (key === 'a') {
    const approved = readJson(APPROVED)
    if (!approved.some((x) => x.id === q.id)) approved.push(strip(q))
    writeJson(APPROVED, approved)
    approvedN++
  } else {
    const rej = readJson(REJECTED)
    if (!rej.some((x) => x.id === q.id)) rej.push({ ...strip(q), rejectedAt: new Date().toISOString() })
    writeJson(REJECTED, rej)
    rejectedN++
  }
  writeJson(QUEUE, queue)
}
rl.close()
console.log(`\nApproved ${approvedN}, rejected ${rejectedN}, ${queue.length} left in queue.` +
  (approvedN ? ' Run node scripts/compile.mjs to ship approved questions.' : ''))
