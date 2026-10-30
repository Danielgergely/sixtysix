import type { Locale } from './types'

const QUOTES: Record<Locale, [string, string]> = { en: ['“', '”'], de: ['„', '“'], hu: ['„', '”'] }

/** Wrap verse text in the language's quotes unless the text already opens with one. */
export function quoteVerse(text: string, locale: Locale = 'en'): string {
  const [open, close] = QUOTES[locale]
  return /^[“"‘'„»«]/.test(text) ? text : `${open}${text}${close}`
}
