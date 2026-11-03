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

/**
 * The list version of `useIsFirstKey`: the keys that were already there when the list was
 * first shown (pass null while it isn't shown yet). Give those items `initial={false}` and the
 * rest their enter animation, instead of `<AnimatePresence initial={false}>` around the list.
 * A key that leaves the list is forgotten, so an item that comes back animates in again.
 */
export function useFirstKeys(keys: readonly (string | null | undefined)[] | null): ReadonlySet<string> {
  const [first, setFirst] = useState<Set<string> | null>(() => (keys ? new Set(keys.filter((k): k is string => !!k)) : null))
  if (!keys) return first ?? EMPTY
  if (!first) {
    const next = new Set(keys.filter((k): k is string => !!k))
    setFirst(next)
    return next
  }
  const present = new Set(keys)
  if ([...first].some((k) => !present.has(k))) {
    const next = new Set([...first].filter((k) => present.has(k)))
    setFirst(next)
    return next
  }
  return first
}

const EMPTY: ReadonlySet<string> = new Set()
