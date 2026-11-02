import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import { useLocale } from '../i18n'

interface Props {
  value: number
  /** Seconds for the count. */
  duration?: number
  /** Value to start from on mount (default: `value`, i.e. no initial count). */
  from?: number
  /** Seconds to wait before counting. */
  delay?: number
  className?: string
  /** Prefix such as '+' for gains. */
  prefix?: string
}

/** Grouped the way the active language writes numbers (1,234 / 1.234 / 1234). */
const format = (n: number, locale: string) => Math.round(n).toLocaleString(locale)

/**
 * Counts from the previously shown value to `value`. Writes straight to the
 * DOM node, so a count-up never re-renders React 60 times a second.
 */
export function AnimatedNumber({ value, duration = 0.9, from, delay = 0, className, prefix = '' }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef(from ?? value)
  // React only renders the first frame; later frames are written imperatively.
  const [initial] = useState(from ?? value)
  const reduced = useReducedMotion()
  const locale = useLocale((s) => s.locale)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const start = shown.current
    if (reduced || start === value) {
      shown.current = value
      node.textContent = prefix + format(value, locale)
      return
    }
    const controls = animate(start, value, {
      duration,
      delay,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shown.current = v
        node.textContent = prefix + format(v, locale)
      },
      onComplete: () => settle(),
    })
    // Always end on the exact value, even when animation frames are throttled (background tab).
    const settle = () => {
      shown.current = value
      node.textContent = prefix + format(value, locale)
    }
    const fallback = setTimeout(settle, (delay + duration) * 1000 + 120)
    return () => {
      clearTimeout(fallback)
      controls.stop()
    }
  }, [value, duration, delay, prefix, reduced, locale])

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix + format(initial, locale)}
    </span>
  )
}
