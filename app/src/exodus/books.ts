import type { Locale } from '@sixtysix/shared'
import { t } from '../i18n'
import type { GateQuestion } from './sim'

/**
 * The "66" gates: which book comes after (or before) this one? The 66 books
 * in order, named as each language's Bibles name them (English as the WEB,
 * German as Luther / the Loccum rules, Hungarian as the RÚF names them in
 * full). Data, not interface text: like the word lists of the board games.
 */
const BOOKS: Record<Locale, readonly string[]> = {
  en: ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Songs', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation'],
  de: ['1. Mose', '2. Mose', '3. Mose', '4. Mose', '5. Mose', 'Josua', 'Richter', 'Rut', '1. Samuel', '2. Samuel', '1. Könige', '2. Könige', '1. Chronik', '2. Chronik', 'Esra', 'Nehemia', 'Ester', 'Hiob', 'Psalmen', 'Sprüche', 'Prediger', 'Hoheslied', 'Jesaja', 'Jeremia', 'Klagelieder', 'Hesekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadja', 'Jona', 'Micha', 'Nahum', 'Habakuk', 'Zefanja', 'Haggai', 'Sacharja', 'Maleachi', 'Matthäus', 'Markus', 'Lukas', 'Johannes', 'Apostelgeschichte', 'Römer', '1. Korinther', '2. Korinther', 'Galater', 'Epheser', 'Philipper', 'Kolosser', '1. Thessalonicher', '2. Thessalonicher', '1. Timotheus', '2. Timotheus', 'Titus', 'Philemon', 'Hebräer', 'Jakobus', '1. Petrus', '2. Petrus', '1. Johannes', '2. Johannes', '3. Johannes', 'Judas', 'Offenbarung'],
  hu: ['1Mózes', '2Mózes', '3Mózes', '4Mózes', '5Mózes', 'Józsué', 'Bírák', 'Ruth', '1Sámuel', '2Sámuel', '1Királyok', '2Királyok', '1Krónikák', '2Krónikák', 'Ezsdrás', 'Nehémiás', 'Eszter', 'Jób', 'Zsoltárok', 'Példabeszédek', 'Prédikátor', 'Énekek éneke', 'Ézsaiás', 'Jeremiás', 'Siralmak', 'Ezékiel', 'Dániel', 'Hóseás', 'Jóel', 'Ámósz', 'Abdiás', 'Jónás', 'Mikeás', 'Náhum', 'Habakuk', 'Zofóniás', 'Haggeus', 'Zakariás', 'Malakiás', 'Máté', 'Márk', 'Lukács', 'János', 'Apostolok cselekedetei', 'Róma', '1Korinthus', '2Korinthus', 'Galata', 'Efezus', 'Filippi', 'Kolossé', '1Thesszalonika', '2Thesszalonika', '1Timóteus', '2Timóteus', 'Titusz', 'Filemon', 'Zsidók', 'Jakab', '1Péter', '2Péter', '1János', '2János', '3János', 'Júdás', 'Jelenések'],
}

/** Ids of book-order questions: no bank entry, so no verse and no flag. */
export const isBookQuestion = (id: string) => id.startsWith('book:')

/** "Which book comes after Ruth?" — the right one and two near it (so it takes knowing the order, not guessing). */
export function bookQuestion(locale: Locale, rand: () => number): GateQuestion {
  const names = BOOKS[locale]
  const after = rand() < 0.65
  // A book that has a neighbour on the asked side.
  const i = after ? Math.floor(rand() * 65) : 1 + Math.floor(rand() * 65)
  const answer = after ? i + 1 : i - 1
  const near = [answer - 2, answer - 1, answer + 1, answer + 2].filter((k) => k >= 0 && k < 66 && k !== i && k !== answer)
  const wrong: number[] = []
  while (wrong.length < 2 && near.length) wrong.push(near.splice(Math.floor(rand() * near.length), 1)[0])
  const options = [answer, ...wrong].sort(() => rand() - 0.5)
  const text = t(after ? 'exodus.books.after' : 'exodus.books.before', { book: names[i] })
  const answers = options.map((k) => names[k]) as [string, string, string]
  return {
    id: `book:${i}:${after ? 'a' : 'b'}`,
    text,
    answers,
    correct: options.indexOf(answer) as 0 | 1 | 2,
    reference: t('exodus.books.ref'),
    shown: { text, answers: [...answers, ''] as [string, string, string, string] },
  }
}
