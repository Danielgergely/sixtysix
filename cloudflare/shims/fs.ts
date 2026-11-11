// Stand-in for `node:fs` (aliased in wrangler.jsonc). The server only reads a fixed set of
// JSON data files at startup; Workers have no disk, so they are bundled and served by name.
import bank from '../../app/src/questions/bank.json'
import verses from '../../app/src/questions/verses.json'
import versesDe from '../../app/src/questions/verses.de.json'
import versesHu from '../../app/src/questions/verses.hu.json'
import spiesWords from '../../server/src/spies/words.json'
import spiesWordsDe from '../../server/src/spies/words.de.json'
import spiesWordsHu from '../../server/src/spies/words.hu.json'
import flockWords from '../../shared/src/flockWords.json'
import flockWordsDe from '../../shared/src/flockWords.de.json'
import flockWordsHu from '../../shared/src/flockWords.hu.json'
import missionNumbers from '../../shared/src/missionNumbers.json'
import missionPlaces from '../../shared/src/missionPlaces.json'

const FILES: Record<string, unknown> = {
  'bank.json': bank,
  'verses.json': verses,
  'verses.de.json': versesDe,
  'verses.hu.json': versesHu,
  'words.json': spiesWords,
  'words.de.json': spiesWordsDe,
  'words.hu.json': spiesWordsHu,
  'flockWords.json': flockWords,
  'flockWords.de.json': flockWordsDe,
  'flockWords.hu.json': flockWordsHu,
  'missionNumbers.json': missionNumbers,
  'missionPlaces.json': missionPlaces,
}

export function readFileSync(path: unknown): string {
  const name = String(path).split(/[\\/]/).pop() ?? ''
  if (!(name in FILES)) {
    const err = new Error(`ENOENT: no bundled file "${name}"`) as Error & { code?: string }
    err.code = 'ENOENT'
    throw err
  }
  return JSON.stringify(FILES[name])
}

export const existsSync = (): boolean => false
export const mkdirSync = (): undefined => undefined

export default { readFileSync, existsSync, mkdirSync }
