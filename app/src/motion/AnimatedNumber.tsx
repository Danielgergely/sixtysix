import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'motion/react'

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

const format = (n: number) => Math.round(n).toLocaleString('en-US')

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

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const start = shown.current
    if (reduced || start === value) {
      shown.current = value
      node.textContent = prefix + format(value)
      return
    }
    const controls = animate(start, value, {
      duration,
      delay,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shown.current = v
        node.textContent = prefix + format(v)
      },
    })
    return () => controls.stop()
  }, [value, duration, delay, prefix, reduced])

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix + format(initial)}
    </span>
  )
}
