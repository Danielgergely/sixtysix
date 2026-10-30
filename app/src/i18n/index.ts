import { create } from 'zustand'

/**
 * Translations (docs/i18n.md). Each area of the app keeps its messages in
 * `i18n/<locale>/<namespace>.ts` (a default-exported object, nested freely);
 * keys are `namespace.path.to.message`. English is bundled; German and
 * Hungarian load when picked. Missing keys fall back to English, then to the
 * key itself. `npm run i18n:check --workspace app` lists keys that are used
 * but not defined, and keys a language is missing.
 *
 * - Interpolation: `t('flock.lobby.waiting', { n: 2 })` with `{n}` in the text.
 * - Plurals: pass `count`; a key `x` resolves `x_one` / `x_other` (… per
 *   Intl.PluralRules of the locale) when they exist.
 */

export type Locale = 'en' | 'de' | 'hu'
export const LOCALES: { id: Locale; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'de', name: 'Deutsch' },
  { id: 'hu', name: 'Magyar' },
]

type Tree = { [k: string]: string | Tree }
type Dict = Record<string, string>

/** Flatten { a: { b: 'x' } } → { 'ns.a.b': 'x' }. */
function flatten(tree: Tree, prefix: string, out: Dict): Dict {
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else flatten(v, key, out)
  }
  return out
}

function fromModules(mods: Record<string, unknown>): Dict {
  const out: Dict = {}
  for (const [path, mod] of Object.entries(mods)) {
    const ns = path.split('/').pop()!.replace(/\.ts$/, '')
    flatten((mod as { default: Tree }).default, ns, out)
  }
  return out
}

const EN = fromModules(import.meta.glob('./en/*.ts', { eager: true }))
const LAZY: Record<Exclude<Locale, 'en'>, Record<string, () => Promise<unknown>>> = {
  de: import.meta.glob('./de/*.ts'),
  hu: import.meta.glob('./hu/*.ts'),
}
const loaded: Partial<Record<Locale, Dict>> = { en: EN }

async function load(locale: Locale): Promise<Dict> {
  if (loaded[locale]) return loaded[locale]!
  if (locale === 'en') return EN
  const entries = Object.entries(LAZY[locale])
  const mods = await Promise.all(entries.map(([, imp]) => imp()))
  loaded[locale] = fromModules(Object.fromEntries(entries.map(([p], i) => [p, mods[i]])))
  return loaded[locale]!
}

const KEY = 'sixtysix.locale.v1'
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'de' || saved === 'hu') return saved
  } catch {
    // storage unavailable
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase()
  return nav.startsWith('de') ? 'de' : nav.startsWith('hu') ? 'hu' : 'en'
}

interface LocaleStore {
  locale: Locale
  /** The active locale's messages (English until another one has loaded). */
  dict: Dict
  setLocale: (locale: Locale) => void
}

export const useLocale = create<LocaleStore>((set) => ({
  locale: 'en',
  dict: EN,
  setLocale: (locale) => {
    try {
      localStorage.setItem(KEY, locale)
    } catch {
      // storage unavailable
    }
    set({ locale })
    void load(locale).then((dict) => {
      if (useLocale.getState().locale === locale) {
        set({ dict })
        document.documentElement.lang = locale
      }
    })
  },
}))
useLocale.getState().setLocale(initialLocale())

const plurals = new Map<Locale, Intl.PluralRules>()
const pluralOf = (locale: Locale, n: number) => {
  let rules = plurals.get(locale)
  if (!rules) plurals.set(locale, (rules = new Intl.PluralRules(locale)))
  return rules.select(n)
}

export type Vars = Record<string, string | number>

/** Translate outside React (stores, toasts). Prefer `useT` in components so they re-render on a switch. */
export function t(key: string, vars?: Vars): string {
  const { locale, dict } = useLocale.getState()
  return translate(dict, locale, key, vars)
}

function translate(dict: Dict, locale: Locale, key: string, vars?: Vars): string {
  let k = key
  if (vars && typeof vars.count === 'number') {
    const form = `${key}_${pluralOf(locale, vars.count)}`
    if (dict[form] ?? EN[form]) k = form
    else if (dict[`${key}_other`] ?? EN[`${key}_other`]) k = `${key}_other`
  }
  let text = dict[k] ?? EN[k] ?? key
  if (vars) text = text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
  return text
}

/** `const t = useT()` — re-renders the component when the language changes. */
export function useT(): (key: string, vars?: Vars) => string {
  const locale = useLocale((s) => s.locale)
  const dict = useLocale((s) => s.dict)
  return (key, vars) => translate(dict, locale, key, vars)
}

/**
 * Server messages arrive in English (acks and errors from the socket and REST
 * handlers). Each area lists them in its `server` sub-object, keyed by the
 * English text: `{ server: { 'Not your turn': 'Nicht dran' } }`. Messages
 * with a value in them use `{x}` in the key and are matched as a pattern.
 */
export function tServer(message: string): string {
  const { dict, locale } = useLocale.getState()
  if (locale === 'en' || !message) return message
  for (const [k, v] of Object.entries(dict)) {
    const i = k.indexOf('.server.')
    if (i < 0) continue
    const english = k.slice(i + 8)
    if (english === message) return v
    if (english.includes('{')) {
      const names: string[] = []
      const re = new RegExp(`^${english.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{(\w+)\\?\}/g, (_m, n: string) => (names.push(n), '(.+?)'))}$`)
      const m = message.match(re)
      if (m) return names.reduce((s, n, j) => s.replace(`{${n}}`, m[j + 1]), v)
    }
  }
  return message
}
