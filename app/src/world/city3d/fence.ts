import { BufferGeometry, Matrix4, Quaternion, Vector3 } from 'three'
import { Geo } from './geo'
import { blob } from './models'
import { C } from './palette'
import { rng } from './space'

/**
 * The fence or wall round a homestead, one look per wall level
 * (shared/src/plot.ts): 0 surveyor's stakes at the corners, 1 a thorn hedge,
 * 2 a wooden fence, 3 a stone wall, 4 a higher wall with merlons, 5 the same
 * with a watchtower. `fenceParts` lays the pieces along polylines; My Home
 * draws them instanced (one draw call per kind of piece), the city merges a
 * small ring per wall level for the lots (`lotFenceGeometries`).
 */

export type FencePiece = 'stake' | 'bush' | 'post' | 'rail' | 'wallLow' | 'wallHigh' | 'merlon' | 'tower'
export const FENCE_PIECES: FencePiece[] = ['stake', 'bush', 'post', 'rail', 'wallLow', 'wallHigh', 'merlon', 'tower']

export interface FencePart {
  piece: FencePiece
  m: Matrix4
  /** Brightness × for this piece (stone by stone, bush by bush). */
  tint: number
}

type P2 = [number, number]

const WALL_LOW = 1.6
const WALL_HIGH = 2.3
const CAP = 0.18

const geoCache = new Map<FencePiece, BufferGeometry>()
/** The unit pieces: walls and rails 1 long along x (scaled per segment), the rest at size. */
export function pieceGeometry(piece: FencePiece): BufferGeometry {
  let geo = geoCache.get(piece)
  if (geo) return geo
  const g = new Geo(rng(71 + FENCE_PIECES.indexOf(piece)))
  switch (piece) {
    case 'stake':
      g.box(0, 0, 0, 0.14, 1.6, 0.14, C.wood, { jitter: 0 })
      g.box(0.3, 1.2, 0, 0.6, 0.34, 0.03, C.red, { jitter: 0 })
      break
    case 'bush':
      blob(g, 0, 0.5, 0, 0.75, 0.6, 0.55, '#5f7a35')
      blob(g, 0.45, 0.42, 0.1, 0.5, 0.45, 0.45, '#6f8a3c', 1)
      blob(g, -0.45, 0.4, -0.05, 0.5, 0.42, 0.45, '#566f30', 2)
      break
    case 'post':
      g.box(0, 0, 0, 0.18, 1.35, 0.18, C.wood, { jitter: 0 })
      g.cone(0, 1.35, 0, 0.13, 0.15, C.wood, 4)
      break
    case 'rail':
      g.box(0, 0.5, 0, 1, 0.1, 0.07, C.woodDark, { jitter: 0 })
      g.box(0, 1.05, 0, 1, 0.1, 0.07, C.woodDark, { jitter: 0 })
      break
    case 'wallLow':
    case 'wallHigh': {
      const h = piece === 'wallLow' ? WALL_LOW : WALL_HIGH
      g.box(0, 0, 0, 1, h, 0.55, C.lime, { jitter: 0 })
      g.box(0, h, 0, 1.02, CAP, 0.68, C.limeLight, { jitter: 0 })
      // A footing course, a shade darker.
      g.box(0, 0, 0, 1.01, 0.35, 0.62, C.limeDark, { jitter: 0 })
      break
    }
    case 'merlon':
      g.box(0, 0, 0, 0.55, 0.6, 0.5, C.limeLight, { jitter: 0 })
      break
    case 'tower': {
      const w = 3.2
      const h = 7
      g.box(0, 0, 0, w + 0.4, 0.6, w + 0.4, C.limeDark)
      g.box(0, 0, 0, w, h, w, C.lime)
      g.box(0, h, 0, w + 0.5, 0.3, w + 0.5, C.limeLight)
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) g.box(x * (w / 2 + 0.05), h + 0.3, z * (w / 2 + 0.05), 0.6, 0.7, 0.6, C.limeLight)
      g.box(0, 0, w / 2 + 0.03, 0.9, 1.8, 0.06, C.dark, { jitter: 0 })
      for (const y of [3.2, 5.2]) g.box(0, y, w / 2 + 0.03, 0.3, 0.7, 0.06, C.dark, { jitter: 0 })
      g.box(w / 2 + 0.03, 4.4, 0, 0.06, 0.7, 0.3, C.dark, { jitter: 0 })
      // A banner pole.
      g.box(0, h + 0.3, 0, 0.08, 2.4, 0.08, C.woodDark, { jitter: 0 })
      g.box(0.5, h + 1.6, 0, 0.9, 0.7, 0.04, C.red, { jitter: 0 })
      break
    }
  }
  geo = g.build(3, { ao: { ground: () => 0 } })
  geoCache.set(piece, geo)
  return geo
}

const q = new Quaternion()
const yAxis = new Vector3(0, 1, 0)
const mat = (x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number) =>
  new Matrix4().compose(new Vector3(x, y, z), q.setFromAxisAngle(yAxis, ry).clone(), new Vector3(sx, sy, sz))

/** Points every ~`step` along a polyline, with the direction (ry) of the segment they lie on. */
function along(path: P2[], step: number): { x: number; z: number; ry: number }[] {
  const out: { x: number; z: number; ry: number }[] = []
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i]
    const [bx, bz] = path[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(1, Math.round(len / step))
    const ry = Math.atan2(-(bz - az), bx - ax)
    for (let k = i === 0 ? 0 : 1; k <= n; k++) out.push({ x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n, ry })
  }
  return out
}

/** The segments of a polyline cut into pieces of about `step`. */
function pieces(path: P2[], step: number): { x: number; z: number; ry: number; len: number }[] {
  const out: { x: number; z: number; ry: number; len: number }[] = []
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i]
    const [bx, bz] = path[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(1, Math.round(len / step))
    const ry = Math.atan2(-(bz - az), bx - ax)
    for (let k = 0; k < n; k++) out.push({ x: ax + ((bx - ax) * (k + 0.5)) / n, z: az + ((bz - az) * (k + 0.5)) / n, ry, len: len / n })
  }
  return out
}

/**
 * The pieces of a fence at `level` along `paths` (x, z polylines). `k` scales
 * the pieces (1 = My Home, smaller round a city lot), `step` their spacing; `corners` get the
 * stakes at level 0; `tower` (x, z, ry) is where the watchtower stands at 5.
 */
export function fenceParts(level: number, paths: P2[][], o: { k?: number; step?: number; wallStep?: number; corners?: P2[]; tower?: [number, number, number]; seed?: number } = {}): FencePart[] {
  const k = o.k ?? 1
  /** Spacing × (the city's rings use fewer, bigger pieces). */
  const st = o.step ?? 1
  /** Length × of a stretch of wall and spacing × of the merlons (the city's rings: one stretch a side, fewer and wider merlons). */
  const ws = o.wallStep ?? 1
  const wide = ws > 1 ? 1.35 : 1
  const rand = rng(o.seed ?? 3)
  const out: FencePart[] = []
  const tint = (spread: number) => 1 + (rand() * 2 - 1) * spread
  if (level <= 0) {
    for (const [x, z] of o.corners ?? []) out.push({ piece: 'stake', m: mat(x, 0, z, rand() * 3, k, k, k), tint: 1 })
    return out
  }
  if (level === 1) {
    for (const path of paths) {
      for (const p of along(path, 1.15 * k * st)) {
        const s = k * st * (0.8 + rand() * 0.45)
        out.push({ piece: 'bush', m: mat(p.x + (rand() - 0.5) * 0.25 * k, 0, p.z + (rand() - 0.5) * 0.25 * k, p.ry + (rand() - 0.5) * 0.8, s, s * (0.85 + rand() * 0.3), s), tint: tint(0.12) })
      }
    }
    return out
  }
  if (level === 2) {
    for (const path of paths) {
      for (const p of along(path, 2.1 * k * st)) out.push({ piece: 'post', m: mat(p.x, 0, p.z, p.ry, k, k * (0.92 + rand() * 0.16), k), tint: tint(0.1) })
      for (const p of pieces(path, 2.1 * k * st)) out.push({ piece: 'rail', m: mat(p.x, 0, p.z, p.ry + (rand() - 0.5) * 0.02, p.len + 0.05, k, k), tint: tint(0.08) })
    }
    return out
  }
  const high = level >= 4
  for (const path of paths) {
    // Stretches of wall, each a little different in stone and height.
    for (const p of pieces(path, 2.4 * k * ws)) out.push({ piece: high ? 'wallHigh' : 'wallLow', m: mat(p.x, 0, p.z, p.ry, p.len + 0.04, k * (0.97 + rand() * 0.06), k), tint: tint(0.06) })
    if (high) for (const p of along(path, 1.15 * k * Math.min(ws, 1.7))) out.push({ piece: 'merlon', m: mat(p.x, (WALL_HIGH + CAP) * k, p.z, p.ry, k * wide, k, k), tint: tint(0.05) })
  }
  if (level >= 5 && o.tower) {
    const [x, z, ry] = o.tower
    out.push({ piece: 'tower', m: mat(x, 0, z, ry, k, k, k), tint: 1 })
  }
  return out
}

/** Merges fence parts into one geometry (the city's lot rings). */
function mergeFence(parts: FencePart[]): BufferGeometry {
  const g = new Geo()
  for (const p of parts) g.addColored(pieceGeometry(p.piece), p.m, p.tint)
  return g.build(3)
}

/**
 * The ring round a city lot for each wall level 1…5 (index 0 = level 1),
 * sized for a 7-unit yard with the gate gap at the front (+z); the city
 * scales each to its house's yard. Up to 400 are drawn, so they are built
 * from few pieces: bigger bushes, wider post spacing, one stretch of wall a
 * side, fewer and wider merlons.
 */
export function lotFenceGeometries(): BufferGeometry[] {
  const s = 3.7
  const gap = 0.95
  const ring: P2[] = [[gap, s], [s, s], [s, -s], [-s, -s], [-s, s], [-gap, s]]
  return [1, 2, 3, 4, 5].map((level) => mergeFence(fenceParts(level, [ring], { k: 0.55, step: level === 1 ? 1.9 : 1.5, wallStep: 6, tower: [-s + 0.3, -s + 0.3, 0], seed: 40 + level })))
}
