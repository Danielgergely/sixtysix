import { Fragment, type ReactNode } from 'react'

/**
 * Put React nodes into a translated text: `rich(t('quiz.question.answered', { total: 8 }), { done: <AnimatedNumber … /> })`
 * with `{done}` left in the text (t() keeps placeholders it has no value for). Word order stays the translation's.
 */
export function rich(text: string, nodes: Record<string, ReactNode>): ReactNode {
  return text.split(/\{(\w+)\}/).map((part, i) => (i % 2 ? <Fragment key={i}>{part in nodes ? nodes[part] : `{${part}}`}</Fragment> : part))
}
