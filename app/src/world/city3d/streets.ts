import { LOTS } from '../cityLayout'
import type { StreetNet } from '../cityTownsfolk'
import { graph } from '../life/nav'
import {
  ellipseE,
  GATES,
  LANDMARK_RECTS,
  landmarkRects,
  lotCentre,
  MAIN_ROADS,
  MAIN_W,
  MOUNT_PTS,
  OPEN_LOTS,
  PEN,
  PLATFORM,
  PLAZA,
  px,
  py,
  rectDist,
  RING,
  SANCTUARY,
  wallDir,
  wallRects,
  type Rect,
} from './plan'

/**
 * The 3D city's streets (units, like plan.ts) and the walkers' graph on them:
 *
 * - main: the four main roads (plaza → gate → edge of the map) and the ring
 *   round the Temple Mount plaza, paved and kerbed, MAIN_W wide;
 * - street: a lane between every two rows of lots (the lot grid is a fixed
 *   hex grid, so the rows are straight), clipped by the wall, the landmarks
 *   and the plaza (where it joins the ring);
 * - alley: between two houses of a row, every other gap, linking the lanes.
 *
 * Built once from the plan; nothing here may cross a lot (the layout check
 * tests it). The graph is in painting px (life/nav.ts, cityTownsfolk.ts):
 * named nodes are the exits X1/X2/X4/X6, the gates gN/gE/gS/gW, the ring's
 * corners rNW…, the stairs and the Temple court TT.
 */

export type StreetKind = 'main' | 'street' | 'alley' | 'stair' | 'mount'
export interface StreetSeg {
  a: [number, number]
  b: [number, number]
  kind: StreetKind
  w: number
}

export const STREET_W = 1.9
export const ALLEY_W = 2.2

/** Lot rows (z of their centres) and the x grid of lots and gaps (every half lot). */
const ROWS = [...new Set(LOTS.map((l) => Math.round(lotCentre(l)[1] * 100) / 100))].sort((a, b) => a - b)
const ROW_DZ = ROWS[1] - ROWS[0]
const HALF_DX = (() => {
  const xs = [...new Set(LOTS.map((l) => Math.round(lotCentre(l)[0] * 100) / 100))].sort((a, b) => a - b)
  return xs[1] - xs[0]
})()
const X0 = lotCentre(LOTS[0])[0]
const LIMIT = 118

const WALLS = wallRects().map((w) => w.r)
const BUILT = landmarkRects()
  .filter((l) => !l.id.startsWith('temple') && !l.id.startsWith('stairs'))
  .map((l) => l.r)

/** Main road centrelines (the ring as four sides). */
const ringPts = (() => {
  const { x, z, hw, hd } = RING
  return [
    [x - hw, z - hd],
    [x + hw, z - hd],
    [x + hw, z + hd],
    [x - hw, z + hd],
  ] as [number, number][]
})()
const MAIN_LINES: [number, number, number, number][] = [
  ...MAIN_ROADS.map((r) => [...r.from, ...r.to] as [number, number, number, number]),
  ...ringPts.map((p, i) => [...p, ...ringPts[(i + 1) % 4]] as [number, number, number, number]),
]

function nearestOnLine(x: number, z: number, [ax, az, bx, bz]: [number, number, number, number]): [number, number, number] {
  const dx = bx - ax
  const dz = bz - az
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
  const qx = ax + dx * t
  const qz = az + dz * t
  return [qx, qz, Math.hypot(x - qx, z - qz)]
}

/** Inside the ring (the plaza and the Mount). */
const inRing = (x: number, z: number) => Math.abs(x - RING.x) < RING.hw && Math.abs(z - RING.z) < RING.hd

type Why = 'ok' | 'road' | 'blocked'
/** Can a lane `h` (half width) pass here? 'road' = on a main road or the ring (it joins there). */
function where(x: number, z: number, h: number): Why {
  if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT) return 'blocked'
  for (const l of MAIN_LINES) if (nearestOnLine(x, z, l)[2] < MAIN_W / 2 + h) return 'road'
  if (inRing(x, z)) return 'road'
  const e = ellipseE(x, z)
  if (e > 0.88 && e < 1.14) for (const r of WALLS) if (rectDist(r, x, z) < h + 0.5) return 'blocked'
  for (const r of BUILT) if (rectDist(r, x, z) < h + 0.6) return 'blocked'
  for (const l of OPEN_LOTS) if (Math.abs(l.r.x - x) < 6 && Math.abs(l.r.z - z) < 6 && rectDist(l.r, x, z) < h + 0.1) return 'blocked'
  return 'ok'
}

/**
 * Where a lane running along x (or z, `alongX` false) through (x, z) meets the
 * nearest main road or the ring square on: that road's centreline straight
 * ahead. Null when the road beside it runs alongside instead.
 */
function snap(x: number, z: number, alongX: boolean): [number, number] | null {
  let best: [number, number, number] | null = null
  for (const l of MAIN_LINES) {
    const q = nearestOnLine(x, z, l)
    if (Math.abs(alongX ? q[1] - z : q[0] - x) > 0.05) continue
    if (!best || q[2] < best[2]) best = q
  }
  return best && best[2] < MAIN_W / 2 + 3 ? [best[0], best[1]] : null
}

/** The stretches of an axis-aligned line (fixed coordinate `c`, running from −LIMIT to LIMIT) a lane may use. */
function stretches(c: number, horizontal: boolean, h: number, from = -LIMIT, to = LIMIT): { a: number; b: number; snapA: boolean; snapB: boolean }[] {
  const STEP = 0.25
  const out: { a: number; b: number; snapA: boolean; snapB: boolean }[] = []
  let start: number | null = null
  let snapStart = false
  let prev: Why = 'blocked'
  for (let v = from; v <= to + 1e-6; v += STEP) {
    const w = horizontal ? where(v, c, h) : where(c, v, h)
    if (w === 'ok' && start === null) {
      start = v
      snapStart = prev === 'road'
    }
    if (w !== 'ok' && start !== null) {
      out.push({ a: start, b: v - STEP, snapA: snapStart, snapB: w === 'road' })
      start = null
    }
    prev = w
  }
  if (start !== null) out.push({ a: start, b: to, snapA: snapStart, snapB: false })
  return out
}

const key = (x: number, z: number) => `${Math.round(x * 4)},${Math.round(z * 4)}`

export interface Streets {
  segs: StreetSeg[]
  /** Walkers' graph, in painting px. */
  nodes: Record<string, { x: number; y: number }>
  links: [string, string][]
  /** Where main roads meet streets: kerbs open there. */
  junctions: [number, number][]
}

function build(): Streets {
  const segs: StreetSeg[] = []
  const pts = new Map<string, [number, number]>()
  const names = new Map<string, string>()
  const links: [string, string][] = []
  const id = (x: number, z: number, name?: string) => {
    const k = key(x, z)
    if (!pts.has(k)) pts.set(k, [x, z])
    if (name) names.set(k, name)
    return k
  }
  const link = (a: string, b: string) => {
    if (a !== b) links.push([a, b])
  }
  /** Points on main roads where streets join (the main roads are split there). */
  const onMain: [number, number][] = []
  const lane = new Set<string>()

  // Lanes between the rows (and one before the first and after the last).
  const lanesZ = [ROWS[0] - ROW_DZ / 2, ...ROWS.map((z) => z + ROW_DZ / 2)]
  const kMin = Math.ceil((-LIMIT - X0) / HALF_DX)
  const kMax = Math.floor((LIMIT - X0) / HALF_DX)
  for (const z of lanesZ) {
    if (Math.abs(z) > LIMIT) continue
    for (const s of stretches(z, true, STREET_W / 2)) {
      const grid: number[] = []
      for (let k = kMin; k <= kMax; k++) {
        const x = X0 + k * HALF_DX
        if (x >= s.a - 1e-6 && x <= s.b + 1e-6) grid.push(x)
      }
      const chain: [number, number][] = grid.map((x) => [x, z])
      const sa = s.snapA ? snap(s.a, z, true) : null
      const sb = s.snapB ? snap(s.b, z, true) : null
      if (sa) chain.unshift(sa)
      if (sb) chain.push(sb)
      if (chain.length < 2) continue
      for (let i = 0; i + 1 < chain.length; i++) {
        const [ax, az] = chain[i]
        const [bx, bz] = chain[i + 1]
        link(id(ax, az), id(bx, bz))
      }
      for (const p of chain) lane.add(key(...p))
      if (sa) onMain.push(sa)
      if (sb) onMain.push(sb)
      segs.push({ a: chain[0], b: chain[chain.length - 1], kind: 'street', w: STREET_W })
    }
  }

  // Alleys through every other gap of a row, staggered.
  ROWS.forEach((z, ri) => {
    const za = z - ROW_DZ / 2
    const zb = z + ROW_DZ / 2
    for (let k = kMin; k <= kMax; k++) {
      const x = X0 + k * HALF_DX
      // A gap of this row: no lot centre here.
      if (LOTS.some((l) => Math.abs(lotCentre(l)[1] - z) < 0.1 && Math.abs(lotCentre(l)[0] - x) < 0.1)) continue
      // Every other gap, staggered from row to row.
      if (((Math.floor(k / 2) % 2) + 2) % 2 !== ri % 2) continue
      for (const s of stretches(x, false, ALLEY_W / 2, za, zb)) {
        const sa = s.snapA ? snap(x, s.a, false) : null
        const sb = s.snapB ? snap(x, s.b, false) : null
        const a: [number, number] | null = sa ?? (Math.abs(s.a - za) < 0.3 ? [x, za] : null)
        const b: [number, number] | null = sb ?? (Math.abs(s.b - zb) < 0.3 ? [x, zb] : null)
        if (!a || !b) continue
        if (!sa && !lane.has(key(...a))) continue
        if (!sb && !lane.has(key(...b))) continue
        link(id(...a), id(...b))
        if (sa) onMain.push(sa)
        if (sb) onMain.push(sb)
        segs.push({ a, b, kind: 'alley', w: ALLEY_W })
      }
    }
  })

  // Main roads, split wherever a street joins; their gates and exits named.
  for (const r of MAIN_ROADS) {
    const g = GATES.find((x) => x.id === r.id)!
    const { nx, nz } = wallDir(g.t)
    const line: [number, number, number, number] = [...r.from, ...r.to]
    const stops: [number, number, string?][] = [[...r.from], [...r.to, r.exit], [g.x + nx * 5, g.z + nz * 5, `g${r.id}`]]
    for (const p of onMain) if (nearestOnLine(p[0], p[1], line)[2] < 0.05) stops.push(p)
    const len = Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1])
    const t = (p: [number, number, string?]) => ((p[0] - r.from[0]) * (r.to[0] - r.from[0]) + (p[1] - r.from[1]) * (r.to[1] - r.from[1])) / len
    stops.sort((a, b) => t(a) - t(b))
    for (let i = 0; i + 1 < stops.length; i++) link(id(stops[i][0], stops[i][1], stops[i][2]), id(stops[i + 1][0], stops[i + 1][1], stops[i + 1][2]))
    segs.push({ a: r.from, b: r.to, kind: 'main', w: MAIN_W })
  }
  // The ring: corners, the four road ends, and every street joining it.
  const ringStops: [number, number, string?][] = [
    [...ringPts[0], 'rNW'],
    [...ringPts[1], 'rNE'],
    [...ringPts[2], 'rSE'],
    [...ringPts[3], 'rSW'],
    ...MAIN_ROADS.map((r) => [...r.from] as [number, number]),
  ]
  for (let i = 0; i < 4; i++) {
    const a = ringPts[i]
    const b = ringPts[(i + 1) % 4]
    const line: [number, number, number, number] = [...a, ...b]
    const on = [...ringStops, ...onMain].filter((p) => nearestOnLine(p[0], p[1], line)[2] < 0.05)
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const t = (p: [number, number, string?]) => ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len
    on.sort((p, q) => t(p) - t(q))
    for (let j = 0; j + 1 < on.length; j++) link(id(on[j][0], on[j][1], on[j][2]), id(on[j + 1][0], on[j + 1][1], on[j + 1][2]))
    segs.push({ a, b, kind: 'main', w: MAIN_W })
  }

  // Up the stairs onto the Mount, and round the Temple's courts to the court before it (TT).
  const s = SANCTUARY.scale
  const sx0 = SANCTUARY.x - 18 * s - 1.4
  const sx1 = SANCTUARY.x + 18.5 * s + 1.4
  const sz0 = SANCTUARY.z - 12.5 * s - 1.4
  const sz1 = SANCTUARY.z + 12.5 * s + 1.4
  const C = {
    NW: id(sx0, sz0),
    NE: id(sx1, sz0),
    SE: id(sx1, sz1),
    SW: id(sx0, sz1),
    W: id(sx0, PLATFORM.z),
    E: id(sx1, PLATFORM.z),
  }
  const TT = id(SANCTUARY.x + 8 * s, SANCTUARY.z, 'TT')
  const tops: string[] = []
  MAIN_ROADS.forEach((r, i) => {
    // Edge midpoint, a step in from the top of the stairs.
    const [ax, az] = MOUNT_PTS[[0, 1, 2, 3][['N', 'E', 'S', 'W'].indexOf(r.id)]]
    const [bx, bz] = MOUNT_PTS[([0, 1, 2, 3][['N', 'E', 'S', 'W'].indexOf(r.id)] + 1) % 4]
    const mx = (ax + bx) / 2
    const mz = (az + bz) / 2
    const ix = mx + Math.sign(PLATFORM.x - mx) * (Math.abs(PLATFORM.x - mx) > 1 ? 0.9 : 0)
    const iz = mz + Math.sign(PLATFORM.z - mz) * (Math.abs(PLATFORM.z - mz) > 1 ? 0.9 : 0)
    const top = id(ix, iz, `st${r.id}`)
    tops.push(top)
    link(id(...r.from), top)
    segs.push({ a: r.from, b: [ix, iz], kind: 'stair', w: 5 })
    void i
  })
  const [tN, tE, tS, tW] = tops
  link(tN, C.NW)
  link(tN, C.NE)
  link(C.NW, C.W)
  link(C.W, tW)
  link(C.W, C.SW)
  link(C.SW, tS)
  link(tS, C.SE)
  link(C.SE, C.E)
  link(C.E, C.NE)
  link(C.E, tE)
  link(C.E, TT)
  for (const [a, b] of [
    [C.NW, C.NE],
    [C.NW, C.W],
    [C.W, C.SW],
    [C.SW, C.SE],
    [C.SE, C.E],
    [C.E, C.NE],
  ])
    segs.push({ a: pts.get(a)!, b: pts.get(b)!, kind: 'mount', w: 2 })

  // Keep the part everyone can reach from the Temple.
  const adj = new Map<string, string[]>()
  for (const [a, b] of links) {
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a)!.push(b)
    adj.get(b)!.push(a)
  }
  const seen = new Set([TT])
  const todo = [TT]
  while (todo.length) {
    for (const n of adj.get(todo.pop()!) ?? []) {
      if (seen.has(n)) continue
      seen.add(n)
      todo.push(n)
    }
  }
  const keep = (p: [number, number]) => seen.has(key(...p))
  const nodes: Record<string, { x: number; y: number }> = {}
  const rename = (k: string) => names.get(k) ?? k
  for (const k of seen) {
    const [x, z] = pts.get(k)!
    nodes[rename(k)] = { x: px(x), y: py(z) }
  }
  return {
    segs: segs.filter((s) => s.kind === 'main' || s.kind === 'stair' || s.kind === 'mount' || (keep(s.a) && keep(s.b))),
    nodes,
    links: links.filter(([a]) => seen.has(a)).map(([a, b]) => [rename(a), rename(b)]),
    junctions: onMain,
  }
}

export const STREETS: Streets = build()

/** Distance from a point to the nearest street surface's edge (negative = on it). */
export function streetClearance(x: number, z: number, segs = STREETS.segs): number {
  let best = Infinity
  for (const s of segs) {
    const d = nearestOnLine(x, z, [...s.a, ...s.b])[2] - s.w / 2
    if (d < best) best = d
  }
  return best
}

/** A street piece's surface as a rectangle. */
export const segFootprint = (s: StreetSeg): Rect => {
  const [ax, az] = s.a
  const [bx, bz] = s.b
  return { x: (ax + bx) / 2, z: (az + bz) / 2, hw: Math.hypot(bx - ax, bz - az) / 2, hd: s.w / 2, ry: Math.atan2(-(bz - az), bx - ax) }
}

const P = (x: number, z: number) => ({ x: px(x), y: py(z) })
const area = (x: number, z: number, rx: number, rz: number) => ({ x: px(x), y: py(z), rx: rx * 10, ry: rz * 10 })
const sheepGate = GATES.find((g) => g.sheep) ?? GATES[0]
const M = LANDMARK_RECTS

/** The townsfolk's roads in the 3D city: these streets, their stops at the landmarks, the animals' patches. */
export const CITY_NET: StreetNet = {
  base: graph(STREETS.nodes, STREETS.links),
  landmarks: {
    // In front of each, on the road it faces.
    'lm-market': P(M.market.x, M.market.z + M.market.hd + 1.4),
    'lm-governor': P(M.governor.x, M.governor.z - M.governor.hw - 0.6),
    'lm-pool': P(M.pool.x, M.pool.z - M.pool.hd - 0.8),
    'lm-gate': P(sheepGate.x - 7, sheepGate.z),
  },
  temple: 'TT',
  dogStart: ['rNW', 'rSE', 'gW', 'gS'],
  dogStops: ['rNW', 'rNE', 'rSE', 'rSW', 'gN', 'gE', 'gS', 'gW', 'TT'],
  donkeyStops: ['lm-market', 'gW', 'rSW', 'lm-gate'],
  areas: {
    sheep: area(PEN.x, PEN.z, PEN.rx * 0.7, PEN.rz * 0.6),
    hen: area(M.market.x, M.market.z + 2, 5, 2),
    // On the grass between the wall and the new quarters, south-east.
    goat: area(72, 37, 2.5, 1.2),
    cat: area(PLAZA.x - PLAZA.hw + 2, PLAZA.z + PLAZA.hd - 2, 2, 1),
    kitten: area(PLAZA.x + PLAZA.hw - 2, PLAZA.z - PLAZA.hd + 2, 2, 1),
  },
}
