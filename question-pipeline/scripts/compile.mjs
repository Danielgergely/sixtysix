// Compiles verified + manually-approved questions into the app's bundled bank.
// Sources: data/verified.json (auto-passed) + data/approved-manual.json
// (questions from review-queue.json that a human confirmed).
// Output:  ../app/src/questions/bank.json
// Usage:   node scripts/compile.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [])

const verified = read(join(root, 'data', 'verified.json'))
const manual = read(join(root, 'data', 'approved-manual.json')).map(
  ({ file, _verse, _flag, ...q }) => q, // strip review metadata
)

const all = [...verified, ...manual].sort((a, b) => a.id.localeCompare(b.id))

const ids = new Set()
for (const q of all) {
  if (ids.has(q.id)) throw new Error(`duplicate id after merge: ${q.id}`)
  ids.add(q.id)
}

const out = join(root, '..', 'app', 'src', 'questions', 'bank.json')
writeFileSync(out, JSON.stringify(all, null, 2))

const stats = {}
for (const q of all) {
  stats[q.category] ??= { total: 0, byDifficulty: {} }
  stats[q.category].total++
  stats[q.category].byDifficulty[q.difficulty] = (stats[q.category].byDifficulty[q.difficulty] ?? 0) + 1
}
console.log(`📦 wrote ${all.length} questions to app/src/questions/bank.json`)
for (const [cat, s] of Object.entries(stats).sort()) {
  console.log(
    `   ${cat.padEnd(9)} ${String(s.total).padStart(3)}  ` +
      [1, 2, 3, 4, 5].map((d) => `d${d}:${s.byDifficulty[d] ?? 0}`).join(' '),
  )
}
