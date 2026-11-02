import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Bridge } from './bridge'

/**
 * Drops to one device pixel per CSS pixel when the device struggles. Only
 * frames drawn while you move the camera count: then the loop runs flat out,
 * whereas the townsfolk's own frames come slowly on purpose (a frame counter
 * like drei's PerformanceMonitor would take those for a slow device).
 */

const SAMPLES = 45
/** Median frame time (ms) above which the picture gets coarser (~36 fps). */
const SLOW_MS = 28

export function DprMonitor({ bridge, onDecline }: { bridge: Bridge; onDecline: () => void }) {
  const times = useRef<number[]>([])
  const done = useRef(false)
  useFrame((_, delta) => {
    if (done.current || !bridge.controls?.active) return
    const ms = delta * 1000
    // A pause between gestures is not a slow frame.
    if (ms > 250) return
    times.current.push(ms)
    if (times.current.length < SAMPLES) return
    const sorted = [...times.current].sort((a, b) => a - b)
    times.current = []
    if (sorted[sorted.length >> 1] > SLOW_MS) {
      done.current = true
      onDecline()
    }
  })
  return null
}
