import { useEffect } from 'react'
import type { GuideId } from './content'
import { showIntro } from './store'

/**
 * Show the guide's intro the first time this screen opens (once per player).
 * `enabled = false` waits, e.g. until the elements a tour points at exist.
 */
export function useIntro(id: GuideId, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    // After the screen transition, so the intro doesn't fight it (and tour targets have rendered).
    const timer = setTimeout(() => showIntro(id), 450)
    return () => clearTimeout(timer)
  }, [id, enabled])
}
