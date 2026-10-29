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

// Cited verse text per question id (WEB), shown at the reveal. Kept out of
// bank.json so the bank stays small; the server and Practice load it apart.
const biblePath = join(root, 'data', 'web-bible.json')
if (!existsSync(biblePath)) throw new Error('data/web-bible.json missing — run scripts/fetch-bible.mjs')
const bible = JSON.parse(readFileSync(biblePath, 'utf8'))
const verses = {}
for (const q of all) {
  const m = /^(.+?)\s(\d+):(\d+)(?:-(\d+))?$/.exec(q.reference)
  const chapter = m && bible[m[1]]?.[m[2]]
  if (!chapter) throw new Error(`${q.id}: unresolvable reference ${q.reference}`)
  const text = []
  for (let v = Number(m[3]); v <= Number(m[4] ?? m[3]); v++) if (chapter[String(v)]) text.push(chapter[String(v)])
  verses[q.id] = text.join(' ')
}
writeFileSync(join(root, '..', 'app', 'src', 'questions', 'verses.json'), JSON.stringify(verses, null, 1))

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
