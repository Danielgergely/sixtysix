#!/usr/bin/env node
// Writes each Mission tie-breaker's reference the way German and Hungarian Bibles
// print it ("2. Korinther 11,24", "2Kor 11,24") into shared/src/missionNumbers.json and
// missionPlaces.json as `ref: { de, hu }`. Uses the same book names and verse
// placement as the bank (refs.mjs). Run after editing either file:
//   node scripts/mission-refs.mjs
// Then node scripts/check-mission-numbers.mjs checks the answer is in the verse cited.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { printedAt, refText } from './refs.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shared = join(root, '..', 'shared', 'src')
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
const de = read(join(root, 'data', 'de-bible.json'))
const localRefs = (reference) => {
  const out = {}
  for (const [lang, bible] of [['de', de], ['hu', null]]) {
    const at = printedAt(lang, reference, bible)
    out[lang] = refText(lang, at.book, at.ch, at.v, at.v)
  }
  return out
}

// missionNumbers.json: one entry per line.
const numPath = join(shared, 'missionNumbers.json')
const numbers = read(numPath).map(({ ref: _old, ...e }) => {
  const { difficulty, ...rest } = e
  return { ...rest, ref: localRefs(e.reference), difficulty }
})
writeFileSync(numPath, '[\n' + numbers.map((e) => '  ' + JSON.stringify(e)).join(',\n') + '\n]\n')

// missionPlaces.json: keeps its layout (one place per line).
const plPath = join(shared, 'missionPlaces.json')
const file = read(plPath)
const places = file.places.map(({ ref: _old, ...p }) => {
  const { confidence, ...rest } = p
  return { ...rest, ref: localRefs(p.reference), confidence }
})
const inline = (v) =>
  v && typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : JSON.stringify(v)
const fmt = (p) => '  ' + inline(p)
writeFileSync(plPath, `{\n "_source": ${JSON.stringify(file._source)},\n "places": [ \n${file.places.length ? places.map(fmt).join(', \n') : ''} \n ]\n}\n`)
const changed = numbers.filter((e) => !e.ref.hu.endsWith(e.reference.split(' ').pop().replace(':', ','))).length
console.log(`${numbers.length} numbers, ${places.length} places; ${changed} Hungarian references differ from the English numbering`)
