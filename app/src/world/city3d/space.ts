import { TEMPLE, WALL, WORLD } from '../cityLayout'
import { MOUNT_PTS, PLATFORM, px, py, S, STAIR_RUN, STAIR_SPECS, STAIR_W, stairFrame, ux, uz } from './plan'

export { lotCentre, MOUNT_PTS, px, py, S, ux, uz } from './plan'

/**
 * The 3D city's space. Everything in shared/src/cityLayout.ts is in world px
 * of the painting (x east, y south); here 1 unit = 10 px, centred on the
 * painting: x east, y up, z south. North is −z, so the default camera (south
 * of its target, looking north) shows the city the way the painting does.
 *
 * The ground is a height function, not a mesh lookup, so houses, walls,
 * walkers and the camera all stand on the same hills: a gentle plateau inside
 * the wall rising to the west, Mount Moriah under the Temple platform, the
 * Kidron valley to the east and the Hinnom to the south falling away outside
 * the wall, and the Mount of Olives rising beyond the Kidron.
 */

export const HALF = (WORLD / 2) * S

/** How far the ground runs past the painted square (units each side). */
export const GROUND_PAD = 130
export const GROUND = 2 * HALF + 2 * GROUND_PAD

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Where a point lies against the wall ellipse: < 1 inside, 1 on the wall. And its direction from the centre. */
export function wallSpace(x: number, z: number): { e: number; cos: number; sin: number } {
  const dx = (px(x) - WALL.cx) / WALL.rx
  const dy = (py(z) - WALL.cy) / WALL.ry
  const e = Math.hypot(dx, dy) || 1e-6
  return { e, cos: dx / e, sin: dy / e }
}

const TX = ux(TEMPLE.x)
const TZ = uz(TEMPLE.y)

/** Ground height (units) at x, z: the terrain only, without the Temple platform. */
export function heightAt(x: number, z: number): number {
  const { e, cos, sin } = wallSpace(x, z)
  const east = Math.max(0, cos) ** 2
  const west = Math.max(0, -cos) ** 2
  const south = Math.max(0, sin) ** 2
  const north = Math.max(0, -sin) ** 2
  // Inside: the plateau, a little higher to the west and north, Moriah under the Temple.
  let h = 3 + west * 1.6 * Math.min(e, 1) + north * 1 * Math.min(e, 1) - east * 0.6 * Math.min(e, 1)
  h += 2.2 * Math.exp(-((x - TX) ** 2 + (z - TZ) ** 2) / 900)
  // The wall stands on a low rim.
  h += 0.7 * Math.exp(-(((e - 1) / 0.05) ** 2))
  // Outside: the valleys (Kidron east, Hinnom south and west), then the hills beyond (Mount of Olives east).
  const fall = 9 * east + 8 * south + 5 * west + 2.5 * north
  h -= smooth(1.04, 1.42, e) * fall
  const rise = 22 * east + 7 * south + 9 * west + 7 * north
  h += smooth(1.45, 2.3, e) * rise
  // Uneven ground: gentle inside, rougher on the slopes.
  const rough = 0.35 + 0.9 * smooth(1, 1.5, e)
  h += rough * (Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.13 - 0.4) + 0.5 * Math.sin(x * 0.27 - z * 0.21 + 2.1))
  return h
}

/** The height of the Temple Mount platform's pavement (its corners: plan.ts MOUNT_PTS). */
export const MOUNT_TOP = heightAt(PLATFORM.x, PLATFORM.z) + 3.2

/** Inside a convex polygon (corners in order). */
export function inPolygon(x: number, z: number, pts: [number, number][], grow = 0): boolean {
  let sign = 0
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[(i + 1) % pts.length]
    const ex = bx - ax
    const ez = bz - az
    const len = Math.hypot(ex, ez)
    const c = (ex * (z - az) - ez * (x - ax)) / len
    const s = Math.sign(c) || 1
    if (sign === 0) sign = s
    // Outside this edge by more than `grow`.
    if (c * sign < -grow) return false
  }
  return true
}

/**
 * The flights of stairs up the platform, one in the middle of every side
 * (plan.ts STAIR_SPECS): from the edge point (qx, qz) they run `run` units
 * outwards (nx, nz) down to the ground, `width` wide.
 */
export interface Stair {
  qx: number
  qz: number
  nx: number
  nz: number
  /** Along the edge (unit vector). */
  ex: number
  ez: number
  run: number
  width: number
  /** Which edge of MOUNT_PTS (i → i + 1) and how far along it. */
  edge: number
  along: number
  foot: number
}

export const STAIRS: Stair[] = STAIR_SPECS.map(({ edge, along }) => {
  const { qx, qz, ex, ez, nx, nz } = stairFrame(edge, along)
  return { qx, qz, nx, nz, ex, ez, run: STAIR_RUN, width: STAIR_W, edge, along, foot: heightAt(qx + nx * STAIR_RUN, qz + nz * STAIR_RUN) }
})

/** What people walk on: the platform's pavement on the Mount, its stairs, the ground everywhere else. */
export function surfaceAt(x: number, z: number): number {
  if (inPolygon(x, z, MOUNT_PTS)) return MOUNT_TOP
  const ground = heightAt(x, z)
  for (const s of STAIRS) {
    const out = (x - s.qx) * s.nx + (z - s.qz) * s.nz
    const side = Math.abs((x - s.qx) * s.ex + (z - s.qz) * s.ez)
    if (out >= 0 && out <= s.run && side <= s.width / 2 + 0.5) return Math.max(ground, MOUNT_TOP + (s.foot - MOUNT_TOP) * (out / s.run))
  }
  return ground
}

/** A stable random number in [0, 1) for an integer seed. */
export function hash(n: number): number {
  let t = (n * 0x6d2b79f5 + 0x9e3779b9) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** A seeded random sequence (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
