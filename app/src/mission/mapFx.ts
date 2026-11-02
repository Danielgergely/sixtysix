import { useEffect, useLayoutEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import type { MissionRegion } from '@sixtysix/shared'
import { playSfx, type SfxName } from '../game/sfx'

/**
 * What changed on the map since this device last showed it: regions changing hands
 * (claimed, taken, or all of a fallen capital's land), walls breaking or rising, and
 * fallen capitals. The game map (MapView with `animate`) diffs every state it shows
 * against the last one it showed, so a phone that was on the question screen during
 * the reveal plays the takeover when it comes back to the map; the board plays it live.
 * MissionMapView draws the result (floods, crumbling towers, the fallen capital).
 */

export interface MapFx {
  id: number
  /** Regions changing owner (from null = a free region claimed). */
  flips: { id: string; from: number | null; to: number; delay: number }[]
  /** Capital walls changing: to < from broke, to > from rose (a new capital, Nehemiah). */
  walls: { id: string; from: number; to: number; delay: number }[]
  /** A capital's last wall fell: its whole land flips to `to`. */
  fallen: { id: string; to: number; delay: number }[]
  /** Seconds until everything has played (the static map takes over again). */
  total: number
}

interface Snapshot {
  key: string
  owners: Record<string, number | null>
  walls: Record<string, number>
}

/** The map this device showed last (one game map on screen at a time). */
let seen: Snapshot | null = null

/** Lead-in so the view has settled before anything moves. */
const LEAD = 0.35

export function diffMap(prev: Snapshot, next: Snapshot, regions: MissionRegion[], id: number): MapFx | null {
  const walls: MapFx['walls'] = []
  const fallen: MapFx['fallen'] = []
  for (const cap of Object.keys(prev.walls)) {
    const to = next.owners[cap]
    if (!(cap in next.walls) && to != null && to !== prev.owners[cap]) fallen.push({ id: cap, to, delay: LEAD })
  }
  for (const [cap, n] of Object.entries(next.walls)) {
    const p = prev.walls[cap]
    if (p === undefined) {
      if (n > 0 && prev.owners[cap] == null) walls.push({ id: cap, from: 0, to: n, delay: LEAD + 0.5 }) // a new capital: its towers rise
    } else if (p !== n) walls.push({ id: cap, from: p, to: n, delay: LEAD })
  }
  for (const f of fallen) walls.push({ id: f.id, from: prev.walls[f.id], to: 0, delay: LEAD })

  const at = new Map(regions.map((r) => [r.id, r.label]))
  const changed = Object.keys(next.owners).filter((r) => next.owners[r] != null && next.owners[r] !== prev.owners[r])
  const flips: MapFx['flips'] = []
  if (fallen.length) {
    // The capital first, then its land in a wave outward.
    const cap = fallen[0]
    const [cx, cy] = at.get(cap.id) ?? [0, 0]
    const dist = (r: string) => {
      const [x, y] = at.get(r) ?? [cx, cy]
      return Math.hypot(x - cx, y - cy)
    }
    changed
      .sort((a, b) => dist(a) - dist(b))
      .forEach((r, i) => flips.push({ id: r, from: prev.owners[r] ?? null, to: next.owners[r]!, delay: LEAD + 1.1 + i * 0.22 }))
  } else {
    changed.forEach((r, i) => flips.push({ id: r, from: prev.owners[r] ?? null, to: next.owners[r]!, delay: LEAD + i * 0.35 }))
  }
  if (!flips.length && !walls.length) return null
  const last = Math.max(0, ...flips.map((f) => f.delay), ...walls.map((w) => w.delay))
  return { id, flips, walls, fallen, total: last + (fallen.length ? 3 : 1.8) }
}

/** The sounds that go with a map change, at their moments. */
function fxSounds(fx: MapFx): [SfxName, number][] {
  const out: [SfxName, number][] = []
  if (fx.fallen.length) {
    out.push(['crumble', fx.fallen[0].delay], ['fall', fx.fallen[0].delay + 0.7])
    return out
  }
  for (const w of fx.walls) {
    if (w.to < w.from) out.push(['crumble', w.delay])
    else if (w.from > 0) out.push(['correct', w.delay]) // Nehemiah rebuilds
  }
  // A flag thud per region, up to four.
  for (const f of fx.flips.slice(0, 4)) out.push(['plant', f.delay + 0.1])
  return out
}

let nextId = 1

/**
 * The map fx to draw now. `key` (room code # game # map size) is null for maps that
 * shouldn't animate (pin pickers, the tie reveal). Reduced motion: never anything.
 */
export function useMapFx(key: string | null, owners: Record<string, number | null>, walls: Record<string, number>, regions: MissionRegion[]): MapFx | null {
  const reduced = useReducedMotion()
  const [fx, setFx] = useState<MapFx | null>(null)

  useLayoutEffect(() => {
    if (!key) return
    const now: Snapshot = { key, owners, walls }
    const prev = seen
    seen = now
    if (!prev || prev.key !== key || reduced) return
    const d = diffMap(prev, now, regions, nextId++)
    // The baseline lives outside React (it outlasts this map's mount), so the diff runs once per shown state, after commit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (d) setFx(d)
  }, [key, owners, walls, regions, reduced])

  // Sounds at their moments, then back to the static map.
  useEffect(() => {
    if (!fx) return
    const timers = fxSounds(fx).map(([name, at]) => setTimeout(() => playSfx(name), at * 1000))
    timers.push(setTimeout(() => setFx((f) => (f?.id === fx.id ? null : f)), fx.total * 1000))
    return () => timers.forEach(clearTimeout)
  }, [fx])

  return fx
}
