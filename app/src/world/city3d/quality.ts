import { smallScreen } from './rig'

/**
 * How much the 3D city spends on looks, by device (docs/graphics-plan.md,
 * Phase 4). The tier is guessed once from the device, remembered, and lowered
 * a step (for the next time the city opens) whenever the frames drawn while
 * the camera moves turn out slow (DprMonitor). `low` is the cost the city had
 * before the graphics work: no baked shade, no ground grain, a coarse shadow
 * that is never refitted.
 */
export type Tier = 'low' | 'mid' | 'high'

const KEY = 'sixtysix.gfxTier.v1'
const ORDER: Tier[] = ['low', 'mid', 'high']

function guess(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const weak = (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 4
  if (smallScreen()) return weak ? 'low' : 'mid'
  return weak ? 'mid' : 'high'
}

export function gfxTier(): Tier {
  try {
    const saved = localStorage.getItem(KEY) as Tier | null
    if (saved && ORDER.includes(saved)) return saved
    const t = guess()
    localStorage.setItem(KEY, t)
    return t
  } catch {
    return guess()
  }
}

/** The device was slow at this tier: one lower from the next opening on. */
export function lowerTier(): void {
  try {
    localStorage.setItem(KEY, ORDER[Math.max(0, ORDER.indexOf(gfxTier()) - 1)])
  } catch {
    // Storage blocked: the guess stands.
  }
}

/** What each tier turns on. */
export const QUALITY: Record<Tier, { shadowSize: number; fitShadow: boolean; bakedShade: boolean; grain: boolean }> = {
  low: { shadowSize: 1024, fitShadow: false, bakedShade: false, grain: false },
  mid: { shadowSize: 1536, fitShadow: true, bakedShade: true, grain: true },
  high: { shadowSize: 2048, fitShadow: true, bakedShade: true, grain: true },
}
