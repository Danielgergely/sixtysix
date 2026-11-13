/**
 * Offensive-name check for every player-chosen name (arena, board games, accounts).
 * `parts`: long roots matched anywhere in the squashed name; `words`: short ones only as whole words
 * (so "Shittim", "Titus", "Cockburn", "Assaf" pass). Text is lower-cased, de-accented, de-leeted.
 */
const LISTS: Record<'en' | 'de' | 'hu', { parts: string[]; words: string[] }> = {
  en: {
    parts: [
      'fuck', 'bullshit', 'shithead', 'shitty', 'shitface', 'shitbag', 'dipshit', 'horseshit', 'bitch', 'asshole', 'arsehole',
      'dickhead', 'cocksucker', 'motherfuck', 'wanker', 'bollocks', 'nigger', 'nigga', 'faggot', 'whore', 'jizz', 'dildo',
      'blowjob', 'handjob', 'orgasm', 'pornhub', 'pedophil', 'paedo', 'cumshot', 'rapist', 'hitler', 'masturbat', 'bukkake',
    ],
    words: [
      'shit', 'cunt', 'cunts', 'cock', 'cocks', 'twat', 'prick', 'fag', 'fags', 'slut', 'sluts', 'pussy', 'penis', 'vagina', 'tits',
      'boobs', 'cum', 'anal', 'rape', 'nazi', 'nazis', 'kkk', 'pedo', 'sex', 'sexy', 'horny', 'wank', 'bastard', 'dyke', 'tranny',
      'retard', 'retarded', 'spic', 'chink', 'kike', 'coon', 'fck', 'fuk', 'porn', 'bdsm', 'ass', 'arse',
    ],
  },
  de: {
    parts: [
      'scheiss', 'arschloch', 'arschgeige', 'arschkriech', 'hurensohn', 'fotze', 'wichser', 'schlampe', 'schwuchtel', 'missgeburt',
      'hundesohn', 'drecksau', 'vollidiot', 'pimmel', 'ficker', 'ficken', 'abschaum', 'dreckskerl', 'miststueck', 'kackbratze',
      'wixer', 'fickdich', 'fickt', 'neonazi', 'judensau', 'schwanzlutscher', 'wichs',
    ],
    words: [
      'arsch', 'fick', 'hure', 'huren', 'nutte', 'nutten', 'spast', 'spasti', 'mongo', 'neger', 'tunte', 'kacke', 'kacka', 'pisser',
      'schwanz', 'muschi', 'titte', 'titten', 'fotzen', 'bastard', 'wixxer', 'nazi', 'hitler', 'idiot',
      'blowjob', 'sex', 'bumsen', 'vagina', 'penis',
    ],
  },
  hu: {
    parts: [
      'kurva', 'fasz', 'geci', 'picsa', 'baszd', 'baszki', 'basszus', 'bazmeg', 'kibaszott', 'csicska', 'kocsog', 'rohadek',
      'rohadt', 'anyad', 'faszfej', 'faszszopo', 'segglyuk', 'szarhazi', 'buzeran', 'szopd', 'szopj',
      'kurvaanyad', 'picsaba', 'lofasz', 'faszom', 'hulyegyerek', 'nyomorek', 'genyo',
    ],
    words: [
      'buzi', 'buzik', 'segg', 'szar', 'pocs', 'baszas', 'basz', 'baszik', 'pina', 'pinak', 'geci', 'gecis', 'cigany', 'ciganyok',
      'szex', 'szexi', 'fasz', 'kurvak', 'ribanc', 'lotyo', 'kapca', 'kreten', 'faszkalap',
    ],
  },
}

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '€': 'e' }

const fold = (s: string): string =>
  s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ø/g, 'o')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0134577@$!€]/g, (c) => LEET[c] ?? c)

const PARTS = [...new Set(Object.values(LISTS).flatMap((l) => l.parts.map(fold)))]
const WORDS = new Set(Object.values(LISTS).flatMap((l) => l.words.map(fold)))

/** "a s s" / "f.u.c.k" → one token: runs of single letters (split by anything) are glued together. */
function tokens(folded: string): string[] {
  const raw = folded.split(/[^a-z]+/).filter(Boolean)
  const out: string[] = []
  let run = ''
  for (const t of raw) {
    if (t.length === 1) run += t
    else {
      if (run) out.push(run)
      run = ''
      out.push(t)
    }
  }
  if (run) out.push(run)
  return out
}

/** Stretched letters: "fuuuck" → "fuck", "assss" → "ass". */
const squeezes = (s: string): string[] => [s, s.replace(/(.)\1{2,}/g, '$1'), s.replace(/(.)\1{2,}/g, '$1$1')]

/** True when the name has no offensive word. Any alphabet; anything it can't read counts as fine. */
export function isNameAllowed(name: unknown): boolean {
  if (typeof name !== 'string') return true
  const folded = fold(name)
  const toks = tokens(folded)
  if (toks.some((t) => squeezes(t).some((v) => WORDS.has(v)))) return false
  const squashed = folded.replace(/[^a-z]+/g, '')
  return !squeezes(squashed).some((v) => PARTS.some((p) => v.includes(p)))
}

const WORDS_BY_LANG = Object.fromEntries(Object.entries(LISTS).map(([l, list]) => [l, new Set(list.words.map(fold))])) as Record<
  keyof typeof LISTS,
  Set<string>
>

/**
 * Longer player text (question decks): word by word, short words only in the text's own language
 * (Swiss German "ass" = ate), long roots in any language. Never across word boundaries.
 */
export function isTextAllowed(text: unknown, lang: keyof typeof LISTS): boolean {
  if (typeof text !== 'string') return true
  const words = WORDS_BY_LANG[lang]
  return !tokens(fold(text)).some((t) => squeezes(t).some((v) => words.has(v) || PARTS.some((p) => v.includes(p))))
}
