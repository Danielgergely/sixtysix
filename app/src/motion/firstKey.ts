import { useState } from 'react'

/**
 * True while `key` is still the first key this component showed (null = nothing shown yet).
 *
 * Use it instead of `<AnimatePresence initial={false}>` to skip the enter animation of the
 * first child: Motion keeps that `initial: false` in the child's presence context for as long
 * as the child lives, so every motion element mounted inside it later (map effects, cards,
 * banners) silently jumps to its end state. Put `initial={first ? false : …}` on the child itself.
 */
export function useIsFirstKey(key: string | null): boolean {
  const [first, setFirst] = useState<string | null | undefined>(key ?? undefined)
  let current = first
  if (first === undefined && key !== null) {
    setFirst(key)
    current = key
  } else if (typeof first === 'string' && key !== null && key !== first) {
    setFirst(null)
    current = null
  }
  return key !== null && key === current
}
