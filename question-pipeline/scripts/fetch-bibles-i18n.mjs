// Downloads the German (Elberfelder 1905) and Hungarian (Károli) Bibles, both
// public domain, from getbible.net and stores them like web-bible.json:
// { [English book name]: { [chapter]: { [verse]: text } } }, books matched to
// the WEB corpus by their canonical order, so a question's reference works in
// every language. Usage: node scripts/fetch-bibles-i18n.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const englishBooks = Object.keys(JSON.parse(readFileSync(join(root, 'data', 'web-bible.json'), 'utf8')))

for (const [lang, id] of [
  ['de', 'elberfelder1905'],
  ['hu', 'karoli'],
]) {
  const res = await fetch(`https://api.getbible.net/v2/${id}.json`)
  if (!res.ok) throw new Error(`${id}: ${res.status}`)
  const raw = await res.json()
  const compact = {}
  const names = {}
  for (const book of raw.books) {
    const english = englishBooks[book.nr - 1]
    if (!english) continue
    names[english] = book.name
    compact[english] = Object.fromEntries(
      book.chapters.map((ch) => [String(ch.chapter), Object.fromEntries(ch.verses.map((v) => [String(v.verse), v.text.trim()]))]),
    )
  }
  writeFileSync(join(root, 'data', `${lang}-bible.json`), JSON.stringify(compact))
  writeFileSync(join(root, 'data', `${lang}-books.json`), JSON.stringify(names, null, 1))
  console.log(`${lang}: ${Object.keys(compact).length} books (${id})`)
}
