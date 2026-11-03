import { useEffect, useState } from 'react'
import type { Bridge } from './bridge'

/**
 * The speech bubble over a tapped figure in both 3D scenes (the city, My
 * Home): HTML over the canvas (SpeechBubble.tsx), placed by Townsfolk3D over
 * the figure's head on every frame drawn, fading on its own.
 */

export interface Bubble {
  /** The actor who talks. */
  id: string
  text: string
  /** A new key starts the bubble (and its timer) afresh. */
  key: number
}

const BUBBLE_MS = 3600

/** The open bubble and its setter; it closes itself after a while. */
export function useSpeechBubble(bridge: Bridge) {
  const [bubble, setBubble] = useState<Bubble | null>(null)
  useEffect(() => {
    if (!bubble) {
      bridge.bubble = null
      return
    }
    // A frame to place it (it then follows its figure on the frames drawn anyway).
    bridge.invalidate()
    const id = setTimeout(() => setBubble((b) => (b?.key === bubble.key ? null : b)), BUBBLE_MS)
    return () => clearTimeout(id)
  }, [bubble, bridge])
  return [bubble, setBubble] as const
}
