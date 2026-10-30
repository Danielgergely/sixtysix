import { useEffect, useState } from 'react'
import { questionIn } from '@sixtysix/shared'
import { useLocale } from '../i18n'
import { loadVerses } from './provider'
import type { Locale, Question, VerseText } from './types'

/**
 * Questions in the player's language (docs/i18n.md): `questionIn` picks the
 * text and answers (English where a translation is missing), `useVerses`
 * loads the cited verses of the current language.
 */
export { questionIn }

/** The current language's verses by question id; null while loading. Follows a language switch. */
export function useVerses(): Record<string, VerseText> | null {
  const locale = useLocale((s) => s.locale)
  const [loaded, setLoaded] = useState<{ locale: Locale; verses: Record<string, VerseText> } | null>(null)
  useEffect(() => {
    let live = true
    loadVerses(locale)
      .then((verses) => live && setLoaded({ locale, verses }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [locale])
  return loaded?.locale === locale ? loaded.verses : null
}

/** A question's verse and its reference in the current language (falls back to the English reference). */
export function verseOf(verses: Record<string, VerseText> | null, q: Pick<Question, 'id' | 'reference'>): VerseText {
  const v = verses?.[q.id]
  return { ref: v?.ref || q.reference, text: v?.text ?? '' }
}
