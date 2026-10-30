import type { GameLocale } from '@sixtysix/shared'

/**
 * Wolf in the Flock: is the caught wolf's typed guess the secret word?
 *
 * 'match' — the word or an alias, ignoring case, accents, punctuation, little
 *           words ("the", "a", "of"…), plural/possessive "s" and small typos;
 * 'close' — near enough that the flock should judge it (one key word in common,
 *           or a bigger typo);
 * 'no'    — clearly something else.
 *
 * Languages (docs/i18n.md). Every function takes the languages seated in the
 * room (`langs`, default English only, which behaves exactly as before):
 * - German "ß" always counts as "ss".
 * - German and Hungarian articles and little words are filler like the English
 *   ones. The few that are also English words ("die", "den", "am") only when a
 *   German player is in the room, so the Lions' Den keeps its den.
 * - With a Hungarian player in the room a word is also read without a common
 *   case ending ("Noét", "Betlehemben", "Mózest"; `huStem`).
 */

export type GuessVerdict = 'match' | 'close' | 'no'
export type Langs = readonly GameLocale[]
const EN: Langs = ['en']

/** German (not English words) and Hungarian little words: a, az, egy, és (accents are gone by now). */
export const FOREIGN_FILLER = new Set(['der', 'das', 'des', 'dem', 'ein', 'eine', 'einen', 'einem', 'einer', 'und', 'von', 'vom', 'im', 'zu', 'zum', 'zur', 'az', 'egy', 'es'])
/** German little words that are also English words: filler only with a German player in the room. */
export const FILLER_DE = new Set(['die', 'den', 'am'])
const FILLER = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'at', 'from', 'into', 'with', ...FOREIGN_FILLER])

/** Is this (folded) word filler in a room with these languages? */
export const isFiller = (t: string, langs: Langs = EN): boolean => FILLER.has(t) || (FILLER_DE.has(t) && langs.includes('de'))

/** Lower case without accents; German ß → ss (it has no accent to drop). */
export const fold = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')

const plural = (t: string) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t)

/** Lower-case words without accents, punctuation, filler words or a plural / possessive "s". */
export function tokens(s: string, langs: Langs = EN): string[] {
  return fold(s)
    .replace(/&/g, ' and ')
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !isFiller(t, langs))
    .map(plural)
}

/** Hungarian case endings and possessives (accents folded), longest first. */
const HU_SUFFIXES = ['ban', 'ben', 'bol', 'val', 'vel', 'nak', 'nek', 'hoz', 'hez', 'rol', 'ra', 're', 'ot', 'et', 'at', 'ja', 'je', 't', 'a', 'e']

/**
 * A token without its Hungarian case ending ("betlehemben" → "betlehem",
 * "noet" → "noe", "mozest" → "moze" like the token of "Mózes"), or the token
 * itself. Only when at least 3 letters remain.
 */
export function huStem(t: string): string {
  for (const suf of HU_SUFFIXES) if (t.endsWith(suf) && t.length - suf.length >= 3) return plural(t.slice(0, -suf.length))
  return t
}

/** The ways to read these tokens: as they are, plus (Hungarian in the room) without case endings. */
export function readings(ts: string[], langs: Langs = EN): string[][] {
  if (!langs.includes('hu')) return [ts]
  const stemmed = ts.map(huStem)
  return stemmed.join(' ') === ts.join(' ') ? [ts] : [ts, stemmed]
}

function distance(a: string, b: string): number {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/**
 * Typos forgiven for an automatic match. None up to 4 letters: short names are
 * one letter apart from each other (Mary / Mark, Paul / Saul), so those go to the flock.
 */
const typoAllowance = (len: number) => (len >= 12 ? 3 : len >= 8 ? 2 : len >= 5 ? 1 : 0)

function compare(guess: string[], target: string[]): GuessVerdict {
  const g = guess.join('')
  const t = target.join('')
  if (!g || !t) return 'no'
  const d = distance(g, t)
  if (d <= typoAllowance(t.length)) return 'match'
  // Close: a bigger typo, or a key word (4+ letters) shared or nearly shared.
  if (d <= Math.ceil(t.length * 0.4)) return 'close'
  const key = (xs: string[]) => xs.filter((x) => x.length >= 4)
  for (const a of key(guess)) for (const b of key(target)) if (a === b || distance(a, b) <= typoAllowance(b.length)) return 'close'
  return 'no'
}

/** Edit distance from the guess to the nearest of these names. */
function nearest(guess: string[], names: readonly string[], langs: Langs): number {
  const g = guess.join('')
  return Math.min(...names.map((n) => distance(g, tokens(n, langs).join(''))))
}

const RANK: Record<GuessVerdict, number> = { no: 0, close: 1, match: 2 }
/** The better of two verdicts. */
export const bestVerdict = (a: GuessVerdict, b: GuessVerdict): GuessVerdict => (RANK[b] > RANK[a] ? b : a)

/**
 * `rivals` = the category's other entries (word + aliases each): a guess at least
 * as close to one of them is not taken as a typo of this word (Jeremiah ≠ Nehemiah).
 * `langs`: the room's languages (filler words; with Hungarian the guess is also
 * read without case endings, and the best reading counts).
 */
export function judgeGuess(
  guess: string,
  word: string,
  aliases: readonly string[] = [],
  rivals: readonly (readonly string[])[] = [],
  langs: Langs = EN,
): GuessVerdict {
  let best: GuessVerdict = 'no'
  for (const g of readings(tokens(guess, langs), langs)) best = bestVerdict(best, judgeTokens(g, word, aliases, rivals, langs))
  return best
}

function judgeTokens(g: string[], word: string, aliases: readonly string[], rivals: readonly (readonly string[])[], langs: Langs): GuessVerdict {
  let best: GuessVerdict = 'no'
  for (const target of [word, ...aliases]) {
    const v = compare(g, tokens(target, langs))
    if (v === 'match') {
      best = 'match'
      break
    }
    if (v === 'close') best = 'close'
  }
  if (best === 'no' || rivals.length === 0) return best
  const mine = nearest(g, [word, ...aliases], langs)
  const theirs = Math.min(...rivals.map((r) => nearest(g, r, langs)))
  if (theirs < mine) return 'no'
  if (theirs === mine) return 'close'
  return best
}
