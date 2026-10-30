/**
 * Wolf in the Flock: is the caught wolf's typed guess the secret word?
 *
 * 'match' — the word or an alias, ignoring case, accents, punctuation, little
 *           words ("the", "a", "of"…), plural/possessive "s" and small typos;
 * 'close' — near enough that the flock should judge it (one key word in common,
 *           or a bigger typo);
 * 'no'    — clearly something else.
 */

export type GuessVerdict = 'match' | 'close' | 'no'

const FILLER = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'at', 'from', 'into', 'with'])

/** Lower-case words without accents, punctuation, filler words or a plural / possessive "s". */
export function tokens(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !FILLER.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
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

export function judgeGuess(guess: string, word: string, aliases: readonly string[] = []): GuessVerdict {
  const g = tokens(guess)
  let best: GuessVerdict = 'no'
  for (const target of [word, ...aliases]) {
    const v = compare(g, tokens(target))
    if (v === 'match') return 'match'
    if (v === 'close') best = 'close'
  }
  return best
}
