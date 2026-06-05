// Downloads the World English Bible (public domain) and compacts it into
// data/web-bible.json — the ground-truth corpus for verify.mjs.
// Usage: node scripts/fetch-bible.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const res = await fetch('https://api.getbible.net/v2/web.json')
if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
const raw = await res.json()

const compact = {}
for (const book of raw.books) {
  const chapters = {}
  for (const ch of book.chapters) {
    chapters[String(ch.chapter)] = Object.fromEntries(
      ch.verses.map((v) => [String(v.verse), v.text.trim()]),
    )
  }
  compact[book.name] = chapters
}

mkdirSync(join(root, 'data'), { recursive: true })
writeFileSync(join(root, 'data', 'web-bible.json'), JSON.stringify(compact))
console.log(`Wrote ${Object.keys(compact).length} books to data/web-bible.json`)
