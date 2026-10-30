// Downloads the newest Bible texts that are free to use, from ebible.org:
//  - German: Schlachter 1951 (deu1951, CC BY 4.0: "Schlachter-Bibel 1951,
//    © Genfer Bibelgesellschaft, CC BY 4.0, via ebible.org")
//  - Hungarian New Testament: Biblica Nyitott Újszövetség 2021 (hun,
//    CC BY-SA 4.0: "Biblica® Nyitott Újszövetség, © 2021 Biblica, Inc.,
//    CC BY-SA 4.0"); the Old Testament stays Károli (public domain).
// Stored like web-bible.json: { [English book name]: { [chapter]: { [verse]: text } } }.
// Usage: node scripts/fetch-bibles-modern.mjs   (needs `unzip`)
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const englishBooks = Object.keys(JSON.parse(readFileSync(join(root, 'data', 'web-bible.json'), 'utf8')))
// ebible.org's VPL book codes, in canonical order (index = WEB book order).
const CODES = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SOL ISA JER LAM EZE DAN HOS JOE AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MAR LUK JOH ACT ROM 1CO 2CO GAL EPH PHI COL 1TH 2TH 1TI 2TI TIT PHM HEB JAM 1PE 2PE 1JO 2JO 3JO JUD REV'.split(' ')

async function vpl(id) {
  const res = await fetch(`https://ebible.org/Scriptures/${id}_vpl.zip`)
  if (!res.ok) throw new Error(`${id}: ${res.status}`)
  const dir = mkdtempSync(join(tmpdir(), `${id}-`))
  writeFileSync(join(dir, 'b.zip'), Buffer.from(await res.arrayBuffer()))
  execFileSync('unzip', ['-o', '-q', join(dir, 'b.zip'), '-d', dir])
  const file = readdirSync(dir).find((f) => f.endsWith('_vpl.txt'))
  const out = {}
  for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
    const m = line.match(/^(\w{3}) (\d+):(\d+) (.*)$/)
    if (!m) continue
    const book = englishBooks[CODES.indexOf(m[1])]
    if (!book) continue
    const text = m[4].replace(/\s+/g, ' ').trim()
    if (!text) continue
    ;((out[book] ??= {})[m[2]] ??= {})[m[3]] = text
  }
  return out
}

const de = await vpl('deu1951')
writeFileSync(join(root, 'data', 'de-bible.json'), JSON.stringify(de))
console.log(`de: Schlachter 1951, ${Object.keys(de).length} books`)

const huNt = await vpl('hun')
// Károli (fetch-bibles-i18n.mjs), kept whole in hu-karoli.json: compile falls back to it for
// verses the modern NT numbers differently (e.g. 1 Cor 13:13 is part of 13:12 there).
const karoliPath = join(root, 'data', 'hu-karoli.json')
let karoli
try {
  karoli = JSON.parse(readFileSync(karoliPath, 'utf8'))
} catch {
  karoli = JSON.parse(readFileSync(join(root, 'data', 'hu-bible.json'), 'utf8'))
  writeFileSync(karoliPath, JSON.stringify(karoli))
}
const hu = structuredClone(karoli)
for (const [book, chapters] of Object.entries(huNt)) hu[book] = chapters
writeFileSync(join(root, 'data', 'hu-bible.json'), JSON.stringify(hu))
writeFileSync(join(root, 'data', 'hu-sources.json'), JSON.stringify(Object.fromEntries(Object.keys(hu).map((b) => [b, b in huNt ? 'biblica-nyitott-2021' : 'karoli-1908'])), null, 1))
console.log(`hu: Károli OT + Biblica Nyitott Újszövetség NT (${Object.keys(huNt).length} books)`)
