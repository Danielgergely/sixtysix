import { LOTS, MOUNT_RECT, WALL, WORLD, lotOpen, type Lot } from '../cityLayout'

/**
 * The 3D city's plan: where everything that isn't a family's house stands,
 * in units (1 unit = 10 painting px, x east, z south, centred on the
 * painting; see space.ts). Kept free of three.js so the layout check
 * (app/scripts/city-layout-check.mts) can test it: no landmark, road, gate,
 * wall piece or tree may touch a lot's yard (LOT_HALF round its centre).
 *
 * - The Temple Mount is a rectangle square to the oval wall, centred in the
 *   space the lot grid leaves round the Temple, with a paved plaza ring
 *   between it and the houses and a flight of stairs on every side.
 * - Four main roads run from the plaza straight out through the four gates
 *   (the east one is the Sheep Gate) to the edge of the map; streets run
 *   between the rows of lots and alleys between their houses (streets.ts).
 * - The landmarks stand in the lot-free spaces along the main roads.
 *
 * Lots that had to give way are listed in RETIRED_LOTS (shared/src/cityLayout.ts).
 */

export const S = 0.1
/** Painting px → units. */
export const ux = (px: number) => (px - WORLD / 2) * S
export const uz = (py: number) => (py - WORLD / 2) * S
/** Units → painting px. */
export const px = (x: number) => x / S + WORLD / 2
export const py = (z: number) => z / S + WORLD / 2

/** The city draws every house this size (the shared models are life-size for My Home); it leaves streets between the rows. */
export const HOUSE_SCALE = 0.75
/** Half the widest yard a lot can show (a house of cedar's foundation or its wall ring), at HOUSE_SCALE. */
export const LOT_HALF = 4.65 * HOUSE_SCALE

/**
 * Where a lot's house stands (units). The painting's lots are foot points (the
 * bottom of a sprite drawn upwards), so the house sits a little north of it.
 */
export function lotCentre(l: Lot): [number, number] {
  return [ux(l.x), uz(l.y - 26)]
}

/** A box seen from above: centre, half sizes along its own x / z, turned by ry about y (three.js sense). */
export interface Rect {
  x: number
  z: number
  hw: number
  hd: number
  ry: number
}
export const rect = (x: number, z: number, hw: number, hd: number, ry = 0): Rect => ({ x, z, hw, hd, ry })
export const grow = (r: Rect, by: number): Rect => ({ ...r, hw: r.hw + by, hd: r.hd + by })

/** The rectangle's corners (x, z). */
export function corners(r: Rect): [number, number][] {
  const c = Math.cos(r.ry)
  const s = Math.sin(r.ry)
  // Local x → (cos, −sin), local z → (sin, cos).
  return [
    [-r.hw, -r.hd],
    [r.hw, -r.hd],
    [r.hw, r.hd],
    [-r.hw, r.hd],
  ].map(([a, b]) => [r.x + a * c + b * s, r.z - a * s + b * c])
}

/** Do two rectangles overlap (separating axes)? */
export function overlaps(a: Rect, b: Rect): boolean {
  const pa = corners(a)
  const pb = corners(b)
  for (const r of [a, b]) {
    for (const [ax, az] of [
      [Math.cos(r.ry), -Math.sin(r.ry)],
      [Math.sin(r.ry), Math.cos(r.ry)],
    ]) {
      const proj = (ps: [number, number][]) => ps.map(([x, z]) => x * ax + z * az)
      const A = proj(pa)
      const B = proj(pb)
      if (Math.max(...A) <= Math.min(...B) || Math.max(...B) <= Math.min(...A)) return false
    }
  }
  return true
}

/** Distance from a point to a rectangle (0 inside). */
export function rectDist(r: Rect, x: number, z: number): number {
  const c = Math.cos(r.ry)
  const s = Math.sin(r.ry)
  const dx = x - r.x
  const dz = z - r.z
  const a = dx * c - dz * s
  const b = dx * s + dz * c
  return Math.hypot(Math.max(0, Math.abs(a) - r.hw), Math.max(0, Math.abs(b) - r.hd))
}

/** A road piece from a to b, `w` wide, as a rectangle. */
export function segRect(ax: number, az: number, bx: number, bz: number, w: number): Rect {
  return rect((ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az) / 2, w / 2, Math.atan2(-(bz - az), bx - ax))
}

/** A lot's yard (square: houses only turn by quarters). */
export function lotRect(l: Lot): Rect {
  const [x, z] = lotCentre(l)
  return rect(x, z, LOT_HALF, LOT_HALF)
}

/** The lots that can carry a house (retired ones never do). */
export const OPEN_LOTS: { n: number; lot: Lot; r: Rect }[] = LOTS.map((lot, i) => ({ n: i + 1, lot, r: lotRect(lot) })).filter((l) => lotOpen(l.n))

// ── The Temple Mount ─────────────────────────────────────────────────────

/**
 * The platform: 46 × 30 units, square to the wall's axes, in the middle of
 * the space the lots leave round the Temple (the TEMPLE anchor, which only
 * orders the lots, lies on it).
 */
export const PLATFORM = rect(ux(MOUNT_RECT.x), uz(MOUNT_RECT.y), MOUNT_RECT.hw * S, MOUNT_RECT.hh * S)
/** Its corners NW, NE, SE, SW: edge 0 is the north side, 1 east, 2 south (the Royal Stoa), 3 west. */
export const MOUNT_PTS = corners(PLATFORM) as [number, number][]
/** The walkers' ring round the platform runs this far out from its edge; the paved plaza reaches PLAZA_OUT. */
export const RING_OFF = 5.5
export const PLAZA_OUT = 7.6
export const RING = grow(PLATFORM, RING_OFF)
export const PLAZA = grow(PLATFORM, PLAZA_OUT)
/** One flight of stairs in the middle of every side, where the main roads arrive: edge, distance along it. */
export const STAIR_RUN = 4
export const STAIR_W = 5
export const STAIR_SPECS: { edge: number; along: number }[] = [0, 1, 2, 3].map((edge) => ({ edge, along: edge % 2 ? PLATFORM.hd : PLATFORM.hw }))
/** Herod's Temple in its courts (buildings.ts sanctuary(); local size ±18.5 × ±12.5 before scaling), a little east of the middle. */
export const SANCTUARY = { x: 13.4, z: -16, scale: 0.72 }
/** The Antonia fortress in the platform's north-west corner (local ±7.8 × ±6.8 before scaling). */
export const ANTONIA = { x: PLATFORM.x - PLATFORM.hw + 5, z: PLATFORM.z - PLATFORM.hd + 4.4, scale: 0.6 }

// ── Landmarks ───────────────────────────────────────────────────────────

export type PlanLandmark = 'market' | 'governor' | 'pool'
/** Each landmark's model frame (centre, turn) and its footprint (half sizes in the model's own axes). */
export const LANDMARK_RECTS: Record<PlanLandmark, Rect> = {
  // North of the west road, between the wall and the houses.
  market: rect(-68, -27.5, 11, 8),
  // South of the east road, its colonnade facing north onto it.
  governor: rect(75, -2.5, 9.7, 7, Math.PI / 2),
  // The stepped basin in the south-west.
  pool: rect(-31, 38.8, 9.6, 7.9),
}
/** The sheep pen (an oval fence) by the east road, inside the Sheep Gate. */
export const PEN = { x: 50, z: -24.4, rx: 6.4, rz: 3.9 }
export const PEN_RECT = rect(PEN.x, PEN.z, PEN.rx + 0.3, PEN.rz + 0.3)

// ── The wall ────────────────────────────────────────────────────────────

export const W_CX = ux(WALL.cx)
export const W_CZ = uz(WALL.cy)
export const W_RX = WALL.rx * S
export const W_RZ = WALL.ry * S
export const WALL_H = 5.5
const SEG = 3.2
export const GATE_W = 4.6
const TOWER = 5.6
const TOWER_GAP = 34

/** Where a point lies against the wall ellipse: < 1 inside, 1 on the wall. */
export const ellipseE = (x: number, z: number) => Math.hypot((x - W_CX) / W_RX, (z - W_CZ) / W_RZ)

export const onWall = (t: number): [number, number] => [W_CX + W_RX * Math.cos(t), W_CZ + W_RZ * Math.sin(t)]

/** Arc length along the wall ↔ ellipse angle. */
const ARC = (() => {
  const M = 2048
  const len: number[] = [0]
  let prev = onWall(0)
  for (let i = 1; i <= M; i++) {
    const p = onWall((i / M) * Math.PI * 2)
    len.push(len[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]))
    prev = p
  }
  return { M, len, total: len[M] }
})()
export const WALL_LENGTH = ARC.total

export function tAt(s: number): number {
  const { M, len, total } = ARC
  const x = ((s % total) + total) % total
  let lo = 0
  let hi = M
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (len[mid] <= x) lo = mid
    else hi = mid
  }
  const f = (x - len[lo]) / (len[hi] - len[lo] || 1)
  return ((lo + f) / M) * Math.PI * 2
}

function sAt(t: number): number {
  const { M, len } = ARC
  const u = ((((t / (Math.PI * 2)) % 1) + 1) % 1) * M
  const i = Math.floor(u)
  return len[i] + (len[Math.min(M, i + 1)] - len[i]) * (u - i)
}

const arcDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % ARC.total
  return Math.min(d, ARC.total - d)
}

/** Direction of the wall at t (unit x, z), the outward normal, and the turn of a box laid along it. */
export function wallDir(t: number) {
  const dx = -W_RX * Math.sin(t)
  const dz = W_RZ * Math.cos(t)
  const l = Math.hypot(dx, dz)
  const nx = Math.cos(t) / W_RX
  const nz = Math.sin(t) / W_RZ
  const nl = Math.hypot(nx, nz)
  return { dx: dx / l, dz: dz / l, nx: nx / nl, nz: nz / nl, ry: Math.atan2(-dz / l, dx / l) }
}

// ── Main roads and gates ────────────────────────────────────────────────

export const MAIN_W = 4.2
/** The map's edge where the main roads leave it. */
const EDGE = 118

export interface MainRoad {
  id: 'N' | 'E' | 'S' | 'W'
  /** From the plaza ring out to the edge of the map. */
  from: [number, number]
  to: [number, number]
  /** The walkers' exit node at its end (cityTownsfolk.ts EXITS). */
  exit: string
}

const { x: PX, z: PZ } = PLATFORM
export const MAIN_ROADS: MainRoad[] = [
  { id: 'N', from: [PX, RING.z - RING.hd], to: [PX, -EDGE], exit: 'X1' },
  { id: 'E', from: [RING.x + RING.hw, PZ], to: [EDGE, PZ], exit: 'X2' },
  { id: 'S', from: [PX, RING.z + RING.hd], to: [PX, EDGE], exit: 'X4' },
  { id: 'W', from: [RING.x - RING.hw, PZ], to: [-EDGE, PZ], exit: 'X6' },
]

export interface Gate {
  id: string
  x: number
  z: number
  /** Arc length and angle along the wall. */
  s: number
  t: number
  /** The Sheep Gate: bigger, with banners. */
  sheep: boolean
}

/** A gate wherever a main road crosses the wall; the east one is the Sheep Gate. */
export const GATES: Gate[] = MAIN_ROADS.map((r) => {
  const at = (p: number): [number, number] => [r.from[0] + (r.to[0] - r.from[0]) * p, r.from[1] + (r.to[1] - r.from[1]) * p]
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (ellipseE(...at(mid)) < 1) lo = mid
    else hi = mid
  }
  const [x, z] = at(lo)
  const t = Math.atan2((z - W_CZ) / W_RZ, (x - W_CX) / W_RX)
  return { id: r.id, x, z, s: sAt(t), t, sheep: r.id === 'E' }
})

const gateGap = (g: Gate) => (g.sheep ? 6.5 : 5.2) + GATE_W / 2
const nearGate = (s: number, extra = 0) => GATES.some((g) => arcDist(s, g.s) < gateGap(g) + extra)

/** The curtain wall's pieces (arc length from → to) between the gates. */
export const WALL_SEGS: [number, number][] = []
for (let s0 = 0; s0 < ARC.total - 0.01; s0 += SEG) {
  const s1 = Math.min(ARC.total, s0 + SEG)
  if (!nearGate((s0 + s1) / 2, -SEG / 2)) WALL_SEGS.push([s0, s1])
}
/** Towers along the wall (arc length), clear of the gates. */
export const TOWER_AT: number[] = []
for (let s = 8; s < ARC.total - 8; s += TOWER_GAP) if (!nearGate(s, 8)) TOWER_AT.push(s)
export const TOWER_SIZE = TOWER

/** Everything the wall stands on, as rectangles: curtain, towers, gatehouses. */
export function wallRects(): { kind: 'wall' | 'tower' | 'gate'; r: Rect; id: string }[] {
  const out: { kind: 'wall' | 'tower' | 'gate'; r: Rect; id: string }[] = []
  for (const [s0, s1] of WALL_SEGS) {
    const p0 = onWall(tAt(s0))
    const p1 = onWall(tAt(s1))
    const { ry } = wallDir(tAt((s0 + s1) / 2))
    const [x, z] = onWall(tAt((s0 + s1) / 2))
    out.push({ kind: 'wall', id: `wall@${Math.round(s0)}`, r: rect(x, z, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 2 + 0.15, 1.25, ry) })
  }
  for (const s of TOWER_AT) {
    const t = tAt(s)
    const [x, z] = onWall(t)
    const { nx, nz, ry } = wallDir(t)
    out.push({ kind: 'tower', id: `tower@${Math.round(s)}`, r: rect(x + nx * 0.8, z + nz * 0.8, TOWER / 2, TOWER / 2, ry) })
  }
  for (const g of GATES) {
    const { nx, nz, ry } = wallDir(g.t)
    const tw = g.sheep ? 6.6 : 5.2
    out.push({ kind: 'gate', id: `gate ${g.id}`, r: rect(g.x + nx * 0.6, g.z + nz * 0.6, GATE_W / 2 + tw + 0.2, 3.5, ry) })
  }
  return out
}

/** Everything built that isn't a house or a road, for the layout check and the street planner. */
export function landmarkRects(): { id: string; r: Rect }[] {
  const out: { id: string; r: Rect }[] = [{ id: 'temple platform', r: PLATFORM }]
  for (const s of STAIR_SPECS) out.push({ id: `stairs ${'NESW'[s.edge]}`, r: stairRect(s.edge, s.along) })
  for (const [id, r] of Object.entries(LANDMARK_RECTS)) out.push({ id, r })
  out.push({ id: 'sheep pen', r: PEN_RECT })
  return out
}

/** A flight of stairs as a rectangle (with its side walls). */
export function stairRect(edge: number, along: number): Rect {
  const [ax, az] = MOUNT_PTS[edge]
  const [bx, bz] = MOUNT_PTS[(edge + 1) % 4]
  const len = Math.hypot(bx - ax, bz - az)
  const ex = (bx - ax) / len
  const ez = (bz - az) / len
  // Outwards: away from the middle.
  let [nx, nz] = [-ez, ex]
  const qx = ax + ex * along
  const qz = az + ez * along
  if ((qx - PLATFORM.x) * nx + (qz - PLATFORM.z) * nz < 0) [nx, nz] = [ez, -ex]
  return rect(qx + (nx * STAIR_RUN) / 2, qz + (nz * STAIR_RUN) / 2, STAIR_W / 2 + 0.8, STAIR_RUN / 2, Math.atan2(-ez, ex))
}
