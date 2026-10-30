import { useEffect } from 'react'
import { playSfx } from './sfx'

/** Below this many ms left the clock ticks twice a second, louder. */
export const URGENT_MS = 5000

/**
 * A soft clock while the answer window is open: tick-tock each second, then
 * faster and brighter in the last 5 s. Ticks land on whole seconds (half
 * seconds when urgent) of the time left, so they match the timer. Muted with
 * the app's sound setting (sfx.ts). No tick at zero: the reveal has its own sound.
 */
export function useClockTicks(endsAt: number, active: boolean): void {
  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const scheduleNext = () => {
      const left = endsAt - Date.now()
      const step = left > URGENT_MS ? 1000 : 500
      // Next boundary strictly below `left` (5 s itself is the first urgent tick).
      const at = Math.ceil(left / step) * step - step
      if (at <= 0) return
      timer = setTimeout(() => {
        playSfx(at <= URGENT_MS ? 'clockUrgent' : (at / 1000) % 2 === 0 ? 'clock' : 'clockTock')
        scheduleNext()
      }, left - at)
    }
    scheduleNext()
    return () => clearTimeout(timer)
  }, [endsAt, active])
}
