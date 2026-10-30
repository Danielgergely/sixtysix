import { Fragment, type ReactNode } from 'react'

/**
 * A translated message with <b>…</b> / <em>…</em> in it, rendered as bold or
 * emphasised text. Keeps a sentence whole in the translation files instead of
 * splitting it around the bold part.
 */
export function rich(text: string): ReactNode {
  return text.split(/(<b>.*?<\/b>|<em>.*?<\/em>)/g).map((part, i) => {
    if (part.startsWith('<b>')) return <b key={i}>{part.slice(3, -4)}</b>
    if (part.startsWith('<em>')) return <em key={i}>{part.slice(4, -5)}</em>
    return <Fragment key={i}>{part}</Fragment>
  })
}
