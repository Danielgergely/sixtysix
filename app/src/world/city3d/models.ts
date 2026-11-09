import { BufferGeometry, IcosahedronGeometry, Matrix4, type ColorRepresentation } from 'three'
import { maxLevel, type YardSpot } from '@sixtysix/shared'
import { Geo, place } from './geo'
import { C } from './palette'
import { rng } from './space'

/**
 * The homestead's buildings as low-poly models, one per building and level
 * (shared/src/plot.ts), shared by both 3D scenes: My Home (PlotScene3D) draws
 * all nine spots, the city (CityScene) draws each family's house on its lot
 * from the same house models, so a home looks the same in both places.
 *
 * Every model stands on y = 0 with its front facing +z, in city units (a
 * person is ~2.2 tall). The house models carry their own yard plate; the
 * city adds the foundation that sinks into the hillside (houses.ts).
 */

// ── Small parts ─────────────────────────────────────────────────────────

/** Flat roof with a low parapet round it. */
function flatRoof(g: Geo, x: number, y: number, z: number, w: number, d: number, color: string = C.roof, wall: string = C.lime) {
  g.box(x, y, z, w + 0.2, 0.3, d + 0.2, color)
  g.box(x, y + 0.3, z - d / 2, w + 0.2, 0.45, 0.22, wall)
  g.box(x, y + 0.3, z + d / 2, w + 0.2, 0.45, 0.22, wall)
  g.box(x - w / 2, y + 0.3, z, 0.22, 0.45, d + 0.2, wall)
  g.box(x + w / 2, y + 0.3, z, 0.22, 0.45, d + 0.2, wall)
}

const door = (g: Geo, x: number, z: number, w = 0.9, h = 1.8, frame: string = C.woodDark) => {
  g.box(x, 0, z + 0.03, w + 0.3, h + 0.2, 0.06, frame, { jitter: 0 })
  g.box(x, 0, z + 0.07, w, h, 0.06, C.dark, { jitter: 0 })
}
const windowAt = (g: Geo, x: number, y: number, z: number, w = 0.55, h = 0.6) => g.box(x, y, z + 0.04, w, h, 0.06, C.dark, { jitter: 0 })
const sideWindow = (g: Geo, x: number, y: number, z: number, w = 0.55, h = 0.6) => g.box(x + 0.04 * Math.sign(x), y, z, 0.06, h, w, C.dark, { jitter: 0 })

/** The yard plate a house stands on. */
function plate(g: Geo, size: number, color: string = C.earth) {
  g.box(0, 0, 0, size, 0.14, size, color, { jitter: 0.03 })
}

const ICO = new IcosahedronGeometry(1, 0)
/** A lumpy round thing (a bush, a heap, a crown of leaves): an icosahedron squashed to rx × ry × rz, centred at y. */
export function blob(g: Geo, x: number, y: number, z: number, rx: number, ry: number, rz: number, color: ColorRepresentation, ry0 = 0) {
  g.add(ICO, place(x, y, z, { ry: ry0 }).multiply(new Matrix4().makeScale(rx, ry, rz)), color, 0.08)
}

/** An olive tree, s = size (1 = a grown tree in a court). */
function olive(g: Geo, x: number, z: number, s = 1) {
  g.cyl(x, 0.1, z, 0.12 * s, 0.18 * s, 1.3 * s, C.trunk, 5)
  g.cyl(x, 1.1 * s, z, 0.9 * s, 1.0 * s, 0.9 * s, C.olive, 7)
  g.cone(x, 1.95 * s, z, 0.8 * s, 0.6 * s, C.olive, 7)
}

/** A water jar. */
const jar = (g: Geo, x: number, z: number, s = 1, color: string = C.mud) => {
  g.cyl(x, 0.1, z, 0.22 * s, 0.3 * s, 0.55 * s, color, 7)
  g.cyl(x, 0.1 + 0.55 * s, z, 0.12 * s, 0.22 * s, 0.2 * s, color, 7)
}
/** A sack of grain. */
const sack = (g: Geo, x: number, z: number, ry = 0) => g.cyl(x, 0.08, z, 0.26, 0.34, 0.6, '#d8c49a', 6, { ry })
/** A log lying along x (or turned by ry). */
const log = (g: Geo, x: number, y: number, z: number, len: number, r = 0.16, ry = 0) => g.cyl(x, y - len / 2 + r, z, r, r, len, C.wood, 6, { rz: Math.PI / 2, ry })
/** A stack of bricks. */
function bricks(g: Geo, x: number, z: number, rows = 3, cols = 3, ry = 0) {
  const c = Math.cos(ry)
  const s = Math.sin(ry)
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const lx = (k - (cols - 1) / 2) * 0.46 + (r % 2 ? 0.12 : 0)
      g.box(x + lx * c, 0.1 + r * 0.22, z - lx * s, 0.42, 0.2, 0.62, r % 2 ? '#b8683f' : '#c47a4a', { ry, jitter: 0.08 })
    }
  }
}
/** A post-and-rail fence along a straight line from (ax, az) to (bx, bz). */
function rails(g: Geo, ax: number, az: number, bx: number, bz: number, h = 1, every = 1.1) {
  const len = Math.hypot(bx - ax, bz - az)
  const ry = -Math.atan2(bz - az, bx - ax)
  const n = Math.max(1, Math.round(len / every))
  for (let i = 0; i <= n; i++) g.box(ax + ((bx - ax) * i) / n, 0, az + ((bz - az) * i) / n, 0.14, h, 0.14, C.wood, { ry, jitter: 0.1 })
  for (const y of [h * 0.45, h * 0.85]) g.box((ax + bx) / 2, y, (az + bz) / 2, len, 0.1, 0.08, C.woodDark, { ry, jitter: 0.04 })
}
/** A ring of rough stones (a dry-stone wall), radius r, height h, with a gap round angle `gapAt` (0 = +z). */
function stoneRing(g: Geo, r: number, h: number, gapAt = 0, gap = 0.5, rand: () => number = Math.random) {
  const n = Math.round(r * 5)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    let d = Math.abs(a - gapAt)
    d = Math.min(d, Math.PI * 2 - d)
    if (d < gap) continue
    const w = ((Math.PI * 2 * r) / n) * 1.05
    g.box(Math.sin(a) * r, 0, Math.cos(a) * r, w, h * (0.85 + rand() * 0.3), 0.55, rand() < 0.5 ? C.lime : C.limeDark, { ry: a, jitter: 0.1 })
  }
}

// ── The house: tent → mud-brick → stone house → courtyard house → two storeys → villa → house of cedar ──

function tent(g: Geo) {
  plate(g, 6.2)
  g.prism(0, 0.1, -0.2, 4.4, 2.3, 3.6, C.goatHair)
  g.prism(0, 0.1, -0.2, 4.0, 2.31, 3.62, '#5a443a', { jitter: 0.02 })
  g.box(0, 0.1, 1.62, 1.0, 1.3, 0.05, C.dark, { jitter: 0 })
  for (const x of [-2.15, 2.15]) g.cyl(x, 0.1, 1.8, 0.05, 0.05, 1.6, C.wood, 4)
  // A fire ring and a water jar.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    g.box(1.6 + Math.cos(a) * 0.45, 0.12, 2.3 + Math.sin(a) * 0.45, 0.25, 0.2, 0.25, C.limeDark)
  }
  g.cyl(-2.2, 0.12, 2.3, 0.28, 0.22, 0.7, C.mud, 7)
}

function mudBrick(g: Geo) {
  plate(g, 6.4)
  g.box(0, 0.1, -0.3, 4.2, 2.7, 3.8, C.mud)
  g.box(0, 2.8, -0.3, 4.5, 0.3, 4.1, C.mudDark)
  for (const x of [-1.6, -0.55, 0.55, 1.6]) g.box(x, 2.82, 1.75, 0.16, 0.16, 0.5, C.woodDark, { jitter: 0 })
  door(g, -0.6, 1.6, 0.85, 1.7)
  windowAt(g, 1.1, 1.5, 1.6, 0.5, 0.45)
  g.cyl(1.9, 0.12, 2.4, 0.3, 0.24, 0.75, C.mudDark, 7)
  g.box(-2.1, 0.12, 2.3, 1.2, 0.5, 0.7, '#c9b07a')
}

function stoneHouse(g: Geo) {
  plate(g, 7)
  g.box(0, 0.1, -0.4, 5, 3.2, 4.4, C.lime)
  flatRoof(g, 0, 3.3, -0.4, 5, 4.4)
  door(g, -0.9, 1.8)
  windowAt(g, 1.0, 1.7, 1.8)
  sideWindow(g, 2.5, 1.7, -0.4)
  // Outside stair up to the roof.
  g.slope(-2.95, 0.1, -0.4, 0.9, 3.2, 3.6, 0.5, C.limeDark, { ry: Math.PI / 2 })
  g.cyl(1.9, 0.12, 2.6, 0.32, 0.25, 0.8, C.mud, 7)
}

/** The courtyard house and every level above it share this plan: rooms at the back and left, a walled court in front. */
function courtyard(g: Geo, o: { size: number; wall: string; storey?: boolean; upper?: boolean; cedar?: boolean }) {
  const s = o.size
  const h = s / 2 - 0.3
  plate(g, s, '#d4b27c')
  // Back rooms and the left wing.
  const backD = s * 0.38
  const bz = -h + backD / 2
  g.box(0, 0.1, bz, s - 0.6, 3.3, backD, o.wall)
  const wingW = s * 0.3
  const wx = -h + wingW / 2
  g.box(wx, 0.1, (bz + backD / 2 + h) / 2, wingW, 3.0, h - (bz + backD / 2), o.wall)
  if (o.cedar) {
    // A right wing too: the court enclosed on three sides.
    g.box(-wx, 0.1, (bz + backD / 2 + h) / 2, wingW, 3.0, h - (bz + backD / 2), o.wall)
  }
  // Court walls and gate.
  const cw = o.cedar ? 0 : 1
  if (cw) g.box(h - 0.12, 0.1, (bz + backD / 2 + h) / 2, 0.24, 1.7, h - (bz + backD / 2), o.wall)
  const frontL = o.cedar ? -wx - wingW / 2 : h
  g.box((wx + wingW / 2 + frontL) / 2 - 0.9, 0.1, h - 0.12, (frontL - wx - wingW / 2) / 2 - 0.4, 1.7, 0.24, o.wall)
  g.box((wx + wingW / 2 + frontL) / 2 + 1.4, 0.1, h - 0.12, (frontL - wx - wingW / 2) / 2 - 1.2, 1.7, 0.24, o.wall)
  g.box((wx + wingW / 2 + frontL) / 2 + 0.25, 1.8, h - 0.12, 1.6, 0.25, 0.3, C.woodDark, { jitter: 0 })
  // Doors and windows on the court.
  door(g, 0.6, bz + backD / 2, 0.9, 1.9, o.cedar ? C.cedar : C.woodDark)
  windowAt(g, -0.9, 1.9, bz + backD / 2)
  windowAt(g, 2.0, 1.9, bz + backD / 2)
  sideWindow(g, wx + wingW / 2, 1.6, h - 1.4)
  // Flat roofs.
  const roofWall = o.cedar ? C.cedar : C.lime
  flatRoof(g, 0, 3.4, bz, s - 0.6, backD, C.roof, roofWall)
  g.box(wx, 3.1, (bz + backD / 2 + h) / 2, wingW + 0.2, 0.3, h - (bz + backD / 2) + 0.2, C.roof)
  if (o.cedar) g.box(-wx, 3.1, (bz + backD / 2 + h) / 2, wingW + 0.2, 0.3, h - (bz + backD / 2) + 0.2, C.roof)
  // The court: a tree, a cistern, jars.
  olive(g, 1.3, 1.6, o.cedar ? 1.15 : 0.9)
  g.cyl(-0.4, 0.12, 2.0, 0.5, 0.55, 0.45, C.limeDark, 8)
  g.cyl(o.cedar ? 0.4 : 2.4, 0.12, h - 0.8, 0.28, 0.22, 0.7, C.mud, 7)
  if (o.storey) {
    // A second storey on the back rooms, with a shaded roof terrace beside it.
    const ux2 = -s * 0.16
    const uw = s * 0.55
    g.box(ux2, 3.4, bz, uw, 2.8, backD - 0.2, o.wall)
    flatRoof(g, ux2, 6.2, bz, uw, backD - 0.2, C.roof, roofWall)
    windowAt(g, ux2 - 0.6, 4.6, bz + (backD - 0.2) / 2)
    windowAt(g, ux2 + 0.8, 4.6, bz + (backD - 0.2) / 2)
    const tx = ux2 + uw / 2 + (s / 2 - 0.3 - (ux2 + uw / 2)) / 2
    for (const [px2, pz] of [[-0.9, -0.8], [0.9, -0.8], [-0.9, 0.8], [0.9, 0.8]]) g.box(tx + px2, 3.7, bz + pz, 0.12, 1.7, 0.12, C.woodDark, { jitter: 0 })
    g.box(tx, 5.4, bz, 2.2, 0.1, 2.0, o.cedar ? C.red : C.ochre, { jitter: 0.02 })
  }
  if (o.upper) {
    // The upper room (aliyah) over the wing, with a little colonnade in the court.
    g.box(wx, 3.4, (bz + backD / 2 + h) / 2 - 0.2, wingW, 2.3, h - (bz + backD / 2) - 0.6, o.wall)
    flatRoof(g, wx, 5.7, (bz + backD / 2 + h) / 2 - 0.2, wingW, h - (bz + backD / 2) - 0.6, C.roof, roofWall)
    sideWindow(g, wx + wingW / 2, 4.4, (bz + backD / 2 + h) / 2)
    for (const x of [-0.6, 1.2, 3.0].slice(0, o.cedar ? 3 : 2)) g.cyl(x, 0.12, bz + backD / 2 + 0.9, 0.18, 0.2, 3.2, C.marble, 6)
    g.box(1.2, 3.3, bz + backD / 2 + 0.9, 4.6, 0.25, 1.0, o.cedar ? C.cedar : C.roof)
  }
  if (o.cedar) {
    // Cedar beams along the eaves and a touch of gold.
    g.box(0, 3.1, bz + backD / 2 + 0.05, s - 0.6, 0.25, 0.12, C.cedar, { jitter: 0 })
    g.box(0, 6.55, bz + (backD - 0.2) / 2 + 0.05, s * 0.55, 0.18, 0.12, C.gold, { jitter: 0 })
  }
}

/** Yard size of each house level 1…7 (the city's foundations follow it). */
export const HOUSE_YARD = [6.2, 6.4, 7, 7.4, 7.6, 8, 8.4]

const HOUSE: ((g: Geo) => void)[] = [
  tent,
  mudBrick,
  stoneHouse,
  (g) => courtyard(g, { size: 7.4, wall: C.lime }),
  (g) => courtyard(g, { size: 7.6, wall: C.limeLight, storey: true }),
  (g) => courtyard(g, { size: 8, wall: C.plaster, storey: true, upper: true }),
  (g) => courtyard(g, { size: 8.4, wall: C.marble, storey: true, upper: true, cedar: true }),
]

/** Draws house level 1…7 into g (the city adds its foundation first). */
export function drawHouse(g: Geo, level: number) {
  HOUSE[Math.min(HOUSE.length, Math.max(1, level)) - 1](g)
}

// ── The well: dug pit → stone-lined → pulley and trough → covered with a cistern → cistern with channels ──

function well(g: Geo, level: number, rand: () => number) {
  g.box(0, 0, 0, 4.6, 0.08, 4.6, '#cfae78', { jitter: 0.02 })
  if (level === 1) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2
      g.box(Math.cos(a) * 0.95, 0.05, Math.sin(a) * 0.95, 0.5, 0.3 + rand() * 0.15, 0.4, C.limeDark, { ry: -a, jitter: 0.1 })
    }
    g.cyl(0, 0.06, 0, 0.75, 0.75, 0.04, C.dark, 10)
    blob(g, 1.6, 0.1, -1.0, 0.9, 0.45, 0.7, C.mud)
    g.box(-1.5, 0.08, 0.9, 0.12, 1.4, 0.12, C.wood, { rz: 0.5, jitter: 0 })
    return
  }
  // A round stone well-head with water deep inside.
  g.cyl(0, 0.05, 0, 1.0, 1.05, 0.85, C.lime, 12)
  g.cyl(0, 0.84, 0, 0.78, 0.78, 0.04, C.water, 12)
  g.cyl(0, 0.9, 0, 1.08, 1.08, 0.08, C.limeLight, 12)
  if (level === 2) {
    // A rope and a bucket on the rim.
    g.cyl(0.85, 0.98, 0.2, 0.17, 0.13, 0.3, C.woodDark, 6)
    jar(g, -1.4, 0.9)
    return
  }
  // Pulley frame and a stone trough.
  for (const x of [-1.15, 1.15]) g.box(x, 0.05, 0, 0.18, 2.5, 0.18, C.wood, { jitter: 0 })
  g.box(0, 2.45, 0, 2.6, 0.16, 0.16, C.woodDark, { jitter: 0 })
  g.cyl(0, 2.05, 0, 0.28, 0.28, 0.14, C.woodDark, 8, { rx: Math.PI / 2 })
  g.box(0, 1.05, 0, 0.03, 1.1, 0.03, '#d8c49a', { jitter: 0 })
  g.cyl(0, 0.95, 0, 0.16, 0.12, 0.25, C.woodDark, 6)
  g.box(1.9, 0.05, 1.0, 0.7, 0.5, 1.6, C.limeDark)
  g.box(1.9, 0.5, 1.0, 0.5, 0.04, 1.4, C.water, { jitter: 0 })
  if (level === 3) {
    jar(g, -1.5, 1.0)
    return
  }
  // A little roof over the well, and a cistern beside it.
  for (const [x, z] of [[-1.15, -1.1], [1.15, -1.1], [-1.15, 1.1], [1.15, 1.1]]) g.box(x, 0.05, z, 0.16, 2.4, 0.16, C.wood, { jitter: 0 })
  g.prism(0, 2.5, 0, 3.0, 1.0, 2.8, C.tile)
  g.box(-1.7, 0.05, -0.6, 1.6, 0.6, 2.6, C.lime)
  g.box(-1.7, 0.6, -0.6, 1.3, 0.04, 2.3, C.water, { jitter: 0 })
  if (level === 4) return
  // Channels running out to the yard, and a second basin.
  g.box(0.8, 0.05, 1.9, 0.4, 0.22, 2.4, C.limeDark, { ry: 0.9 })
  g.box(0.8, 0.27, 1.9, 0.22, 0.02, 2.4, C.water, { ry: 0.9, jitter: 0 })
  g.box(-1.7, 0.05, 1.5, 0.36, 0.22, 1.6, C.limeDark)
  g.box(-1.7, 0.27, 1.5, 0.2, 0.02, 1.6, C.water, { jitter: 0 })
  g.cyl(-1.7, 0.05, 2.3, 0.6, 0.65, 0.45, C.limeLight, 10)
  g.cyl(-1.7, 0.48, 2.3, 0.48, 0.48, 0.03, C.water, 10)
}

// ── The storehouse: granary pit → granary → barn → storehouse → Joseph's storehouse ──

function store(g: Geo, level: number) {
  if (level === 1) {
    g.box(0, 0, 0, 3.8, 0.08, 3.8, '#cfae78')
    g.cyl(0, 0.05, 0, 1.1, 1.2, 0.35, C.limeDark, 10)
    g.cyl(0, 0.38, 0, 0.95, 1.05, 0.12, C.mud, 10)
    sack(g, 1.5, 0.6)
    sack(g, 1.4, -0.2, 1)
    sack(g, -1.5, 0.8, 2)
    return
  }
  if (level === 2) {
    // Two beehive silos of mud brick, a ladder and sacks.
    g.box(0, 0, 0, 4.4, 0.1, 3.6, '#cfae78')
    for (const [x, z, s] of [[-0.9, -0.3, 1], [1.1, 0.1, 0.85]] as const) {
      g.cyl(x, 0.08, z, 0.95 * s, 1.05 * s, 1.9 * s, C.mud, 10)
      g.cone(x, 0.08 + 1.9 * s, z, 0.98 * s, 1.0 * s, C.mudDark, 10)
      g.box(x, 1.4 * s, z + 0.92 * s, 0.4, 0.4, 0.06, C.dark, { jitter: 0 })
    }
    g.box(-0.9, 0.08, 0.95, 0.5, 2.2, 0.08, C.wood, { rx: -0.28, jitter: 0 })
    sack(g, 1.6, 1.3)
    sack(g, 0.3, 1.4, 1)
    return
  }
  if (level === 3) {
    // A timber barn under a pitched roof, its big doors open.
    g.box(0, 0, 0, 5, 0.12, 4.2, '#cfae78')
    g.box(0, 0.1, -0.2, 4.4, 2.3, 3.4, C.wood)
    g.prism(0, 2.4, -0.2, 4.8, 1.4, 3.8, C.woodDark)
    g.box(0, 0.1, 1.53, 1.6, 1.9, 0.06, C.dark, { jitter: 0 })
    g.box(-1.15, 0.1, 1.85, 0.7, 1.9, 0.08, C.woodDark, { ry: -0.7, jitter: 0 })
    g.box(1.15, 0.1, 1.85, 0.7, 1.9, 0.08, C.woodDark, { ry: 0.7, jitter: 0 })
    sack(g, 2.0, 1.8)
    blob(g, -2.0, 0.3, 1.7, 0.7, 0.45, 0.6, '#e0c26a')
    return
  }
  // Stone storehouses: a long hall with a flat roof; Joseph's has a colonnade and gold.
  const big = level >= 5
  const w = big ? 6 : 5
  const d = big ? 4 : 3.6
  g.box(0, 0, 0.3, w + 0.8, 0.14, d + 1.6, C.limeDark, { jitter: 0.03 })
  g.box(0, 0.12, -0.3, w, 2.9, d, big ? C.limeLight : C.lime)
  flatRoof(g, 0, 3.02, -0.3, w, d, C.roof, big ? C.limeLight : C.lime)
  door(g, 0, d / 2 - 0.3, 1.1, 2.0, big ? C.cedar : C.woodDark)
  for (const x of [-w / 2 + 0.9, w / 2 - 0.9]) windowAt(g, x, 2.1, d / 2 - 0.3, 0.4, 0.3)
  sack(g, -w / 2 + 0.4, d / 2 + 0.5)
  sack(g, -w / 2 + 1.0, d / 2 + 0.7, 1)
  jar(g, w / 2 - 0.4, d / 2 + 0.6)
  if (big) {
    for (const x of [-2.2, -0.8, 0.8, 2.2]) g.cyl(x, 0.14, d / 2 + 0.6, 0.2, 0.24, 2.9, C.marble, 8)
    g.box(0, 3.0, d / 2 + 0.3, w, 0.3, 1.0, C.limeLight)
    g.box(0, 3.3, d / 2 + 0.78, w, 0.16, 0.06, C.gold, { jitter: 0 })
    // Grain heaped in the yard, as in the seven good years.
    blob(g, w / 2 + 0.2, 0.2, -1.2, 0.8, 0.55, 0.8, '#e0c26a')
  }
}

// ── The workshop: bench → shop → lathe → apprentice → master's workshop ──

function bench(g: Geo, x: number, z: number, ry = 0) {
  g.box(x, 0.75, z, 1.8, 0.12, 0.6, C.wood, { ry })
  for (const dx of [-0.75, 0.75]) for (const dz of [-0.22, 0.22]) {
    const c = Math.cos(ry)
    const s = Math.sin(ry)
    g.box(x + dx * c + dz * s, 0.05, z - dx * s + dz * c, 0.1, 0.7, 0.1, C.woodDark, { ry, jitter: 0 })
  }
}
function logPile(g: Geo, x: number, z: number, n = 3) {
  for (let r = 0; r < n; r++) for (let k = 0; k < n - r; k++) log(g, x, 0.18 + r * 0.28, z + (k - (n - r - 1) / 2) * 0.32, 1.8, 0.15)
}

function workshop(g: Geo, level: number) {
  g.box(0, 0, 0, 5, 0.08, 4, '#c9a46c', { jitter: 0.02 })
  // Wood shavings on the ground.
  g.box(0.3, 0.08, 0.9, 1.6, 0.02, 0.9, '#e6cf8f', { ry: 0.3, jitter: 0.05 })
  if (level === 1) {
    bench(g, 0, 0.5)
    logPile(g, -1.4, -0.9)
    g.box(1.6, 0.05, -0.6, 0.12, 0.9, 0.9, C.woodDark, { rz: 0.3, jitter: 0 })
    g.box(1.6, 0.05, -0.6, 0.12, 0.9, 0.9, C.woodDark, { rz: -0.3, jitter: 0 })
    log(g, 1.6, 0.95, -0.6, 1.6, 0.13, Math.PI / 2)
    return
  }
  // A shed: a back wall and posts under a lean-to roof.
  const stone = level >= 3
  const wall = stone ? C.lime : C.mud
  const w = level >= 4 ? 4.4 : 3.8
  g.box(0, 0.05, -1.5, w, 2.4, 0.4, wall)
  g.box(-w / 2 + 0.2, 0.05, -0.6, 0.4, 2.2, 1.8, wall)
  for (const x of [w / 2 - 0.15, 0.2]) g.box(x, 0.05, 0.5, 0.16, 2.0, 0.16, C.wood, { jitter: 0 })
  g.slope(0, 2.0, -0.55, w + 0.4, 0.5, 2.4, 0.14, level >= 5 ? C.cedar : C.wood)
  bench(g, 0.6, -0.4)
  logPile(g, -1.0, 1.4, level >= 4 ? 4 : 3)
  if (stone) {
    // The lathe: a wheel and a bed.
    g.box(1.5, 0.05, 1.2, 1.2, 0.7, 0.3, C.woodDark)
    g.cyl(1.0, 0.75, 1.2, 0.35, 0.35, 0.1, C.wood, 10, { rx: Math.PI / 2 })
  }
  if (level >= 4) {
    // The apprentice's room: a small stone house at the side.
    g.box(w / 2 + 0.9, 0.05, -0.8, 1.8, 2.3, 2.2, C.lime)
    flatRoof(g, w / 2 + 0.9, 2.35, -0.8, 1.8, 2.2)
    door(g, w / 2 + 0.9, 0.3, 0.7, 1.5)
  }
  if (level >= 5) {
    // Cedar beams waiting, and a finished chest.
    for (let i = 0; i < 3; i++) g.box(-0.6 + i * 0.05, 0.1 + i * 0.22, 2.0, 3.2, 0.2, 0.3, C.cedar, { jitter: 0.06 })
    g.box(2.1, 0.08, 1.9, 0.9, 0.6, 0.6, C.cedar)
    g.box(2.1, 0.68, 1.9, 0.95, 0.08, 0.65, C.gold, { jitter: 0 })
  }
}

// ── The sheepfold: pen → small flock → with goats → shepherd's hut → great flock ──

function fold(g: Geo, level: number, rand: () => number) {
  const r = [0, 2.2, 2.6, 2.9, 3.0, 3.3][level]
  g.cyl(0, 0, 0, r + 0.2, r + 0.3, 0.06, '#c3a46a', 16)
  if (level === 1) {
    // A pen of posts and rails.
    const n = 10
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const b = ((i + 1) / n) * Math.PI * 2
      if (i === 0) continue
      rails(g, Math.sin(a) * r, Math.cos(a) * r, Math.sin(b) * r, Math.cos(b) * r, 0.9, 2)
    }
  } else {
    stoneRing(g, r, 1.0, 0, 0.42, rand)
    // Thorn branches along the top keep out the wolves.
    for (let i = 0; i < 6; i++) {
      const a = 0.7 + (i / 6) * (Math.PI * 2 - 1.4)
      blob(g, Math.sin(a) * r, 1.05, Math.cos(a) * r, 0.5, 0.22, 0.35, '#6f7a3a', a)
    }
  }
  // A water trough.
  g.box(r * 0.45, 0.05, -r * 0.35, 1.4, 0.4, 0.5, level >= 2 ? C.limeDark : C.wood, { ry: 0.5 })
  g.box(r * 0.45, 0.43, -r * 0.35, 1.2, 0.02, 0.32, C.water, { ry: 0.5, jitter: 0 })
  if (level >= 3) {
    // A shade of branches at the back.
    for (const [x, z] of [[-1.6, -r + 0.6], [0.2, -r + 0.6], [-1.6, -r + 1.8], [0.2, -r + 1.8]]) g.box(x, 0.05, z, 0.12, 1.7, 0.12, C.wood, { jitter: 0 })
    g.box(-0.7, 1.72, -r + 1.2, 2.3, 0.14, 1.7, '#9a8a4a', { jitter: 0.08 })
  }
  if (level >= 4) {
    // The shepherd's round hut, outside the gate.
    g.cyl(r - 0.2, 0.05, r - 0.1, 0.95, 1.0, 1.4, C.limeDark, 10)
    g.cone(r - 0.2, 1.45, r - 0.1, 1.2, 1.1, '#b59a55', 10)
    g.box(r - 0.2, 0.05, r + 0.85, 0.5, 1.0, 0.06, C.dark, { jitter: 0 })
  }
  if (level >= 5) {
    // Hay for the camel and the donkey.
    blob(g, -r + 0.3, 0.45, r - 0.4, 0.8, 0.55, 0.7, '#e0c26a')
    blob(g, -r + 1.2, 0.35, r - 0.1, 0.6, 0.4, 0.55, '#d8b85a')
  }
}

// ── The olive grove: two young trees → small grove → oil press → large grove → vineyard terraces ──

function oilPress(g: Geo, x: number, z: number) {
  g.cyl(x, 0.05, z, 0.9, 1.0, 0.5, C.limeDark, 12)
  g.cyl(x, 0.55, z, 0.7, 0.7, 0.03, '#6f6a2a', 12)
  g.cyl(x - 0.45, 0.55, z, 0.42, 0.42, 0.24, C.lime, 10, { rz: Math.PI / 2 })
  g.box(x, 0.65, z, 2.4, 0.12, 0.12, C.woodDark, { jitter: 0 })
  jar(g, x + 1.2, z + 0.4, 0.9)
}

function grove(g: Geo, level: number, rand: () => number) {
  g.box(0, 0, 0, 6.6, 0.06, 6.2, '#b9955c', { jitter: 0.02 })
  const trees: [number, number, number][] =
    level === 1
      ? [[-1.2, 0.6, 0.55], [1.3, -0.4, 0.5]]
      : level === 2
        ? [[-1.6, 1.4, 0.8], [1.5, 1.2, 0.75], [-1.4, -1.6, 0.85], [1.6, -1.6, 0.8]]
        : level === 3
          ? [[-1.9, 1.6, 0.9], [-1.8, -1.6, 0.95], [1.6, -1.7, 0.9], [0.0, -0.2, 0.85]]
          : level === 4
            ? [[-2.2, 1.8, 1.0], [-2.3, -0.4, 0.95], [-1.4, -2.3, 1.05], [0.6, -2.0, 0.95], [2.3, -1.6, 1.0], [0.0, 0.2, 0.9], [2.4, 0.6, 0.85]]
            : [[-2.3, 1.8, 1.05], [-2.4, -0.2, 1.0], [0.0, 0.0, 0.95], [2.4, 0.4, 0.9], [-0.8, 2.3, 0.85], [2.0, 2.2, 0.9]]
  for (const [x, z, s] of trees) {
    // A ring of earth round each trunk, then the tree.
    g.cyl(x, 0.05, z, 0.7 * s, 0.75 * s, 0.05, '#8f6e3e', 8)
    olive(g, x + (rand() - 0.5) * 0.2, z + (rand() - 0.5) * 0.2, s * 1.25)
  }
  if (level === 1) for (const [x, z] of trees) g.box(x + 0.35, 0.05, z, 0.06, 1.1, 0.06, C.wood, { jitter: 0 })
  if (level >= 3) oilPress(g, level === 3 ? 1.5 : 1.6, level === 3 ? 1.6 : 2.0)
  if (level >= 5) {
    // Terraces at the back with rows of vines.
    for (let k = 0; k < 2; k++) {
      const z = -2.0 - k * 1.1
      g.box(0, 0, z, 6.6, 0.35 + k * 0.35, 1.1, C.limeDark, { jitter: 0.05 })
      for (let i = 0; i < 7; i++) {
        const x = -2.8 + i * 0.93
        g.box(x, 0.35 + k * 0.35, z, 0.07, 0.9, 0.07, C.woodDark, { jitter: 0 })
        blob(g, x, 1.05 + k * 0.35, z, 0.42, 0.3, 0.32, i % 2 ? '#5f7f3a' : '#6f8a3c', i)
        if (i % 2) blob(g, x + 0.15, 0.85 + k * 0.35, z + 0.25, 0.1, 0.12, 0.1, '#5a2a5a')
      }
    }
  }
}

// ── The brick kiln: clay pit → kiln → double kiln → brickworks ──

function kilnDome(g: Geo, x: number, z: number, s = 1) {
  g.cyl(x, 0.05, z, 1.05 * s, 1.15 * s, 1.0 * s, '#b8683f', 10)
  g.cone(x, 1.05 * s, z, 1.08 * s, 1.1 * s, '#a85a35', 10)
  g.cyl(x, 2.0 * s, z, 0.22 * s, 0.26 * s, 0.4 * s, '#8a4a2c', 6)
  // The fire mouth, glowing.
  g.box(x, 0.05, z + 1.0 * s, 0.55 * s, 0.55 * s, 0.2, C.dark, { jitter: 0 })
  g.box(x, 0.08, z + 1.08 * s, 0.38 * s, 0.3 * s, 0.06, '#f08a2a', { jitter: 0 })
}

function kiln(g: Geo, level: number) {
  g.box(0, 0, 0, 5, 0.06, 4.4, '#b98a58', { jitter: 0.02 })
  if (level === 1) {
    // A clay pit, bricks drying in rows, a heap of straw.
    g.box(-0.8, 0.02, -0.4, 2.2, 0.06, 1.8, '#7a4a2a', { jitter: 0 })
    g.box(-0.8, 0.07, -0.4, 1.8, 0.02, 1.4, '#9a6a44', { jitter: 0 })
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) g.box(0.8 + k * 0.5, 0.06, 0.6 + r * 0.7 - 0.7, 0.4, 0.12, 0.55, '#c98d5a', { jitter: 0.1 })
    g.cone(-1.6, 0.05, 1.3, 0.8, 0.9, '#e0c26a', 8)
    return
  }
  kilnDome(g, level >= 3 ? -1.1 : 0, -0.5)
  if (level >= 3) kilnDome(g, 1.2, -0.7, 0.9)
  bricks(g, level >= 3 ? 0.1 : 1.6, 1.3)
  bricks(g, -1.8, 1.4, 2, 3, 0.3)
  log(g, 1.8, 0.2, 1.6, 1.4, 0.12, 0.5)
  if (level >= 4) {
    // A drying shed and more stacks: the brickworks.
    for (const [x, z] of [[2.6, -1.8], [2.6, 0.2], [0.8, -1.8], [0.8, 0.2]]) g.box(x + 0.2, 0.05, z - 0.4, 0.14, 1.8, 0.14, C.wood, { jitter: 0 })
    g.box(1.9, 1.85, -1.2, 2.3, 0.12, 2.6, '#9a8a4a', { jitter: 0.06 })
    bricks(g, 1.9, -1.2, 2, 3)
    bricks(g, -2.0, -1.6, 4, 2)
  }
}

// ── The gate in the fence (the `wall` spot): posts → gate → stone gateway → gatehouse → with banners ──

/** Half the gap the fence leaves for the gate (the gate spans it), in plot units. */
export const GATE_HALF = 2.4

function gate(g: Geo, level: number) {
  const h = GATE_HALF
  if (level === 1) {
    for (const x of [-h, h]) g.box(x, 0, 0, 0.22, 1.5, 0.22, C.wood, { jitter: 0 })
    // A hurdle of woven branches, swung open.
    g.box(-h + 1.0, 0.1, 0.9, 1.9, 1.0, 0.1, '#8a6a3a', { ry: -1.1, jitter: 0.08 })
    for (const x of [-h - 0.5, h + 0.5]) blob(g, x, 0.55, 0, 0.7, 0.6, 0.6, '#5f7a35')
    return
  }
  if (level === 2) {
    for (const x of [-h, h]) g.box(x, 0, 0, 0.32, 2.2, 0.32, C.woodDark, { jitter: 0 })
    g.box(0, 2.05, 0, 2 * h + 0.6, 0.22, 0.26, C.wood, { jitter: 0 })
    for (const [x, ry] of [[-h + 0.85, -0.9], [h - 0.85, 0.9]] as const) {
      g.box(x + (ry < 0 ? 0.3 : -0.3), 0.15, 0.75, 1.9, 1.3, 0.08, C.wood, { ry, jitter: 0.05 })
    }
    return
  }
  // Stone gateposts (3), a gatehouse with a lintel (4), merlons and banners (5).
  const tall = level >= 4
  const pw = tall ? 1.4 : 0.9
  const ph = tall ? 3.6 : 2.8
  for (const x of [-h - pw / 2 + 0.3, h + pw / 2 - 0.3]) {
    g.box(x, 0, 0, pw, ph, 1.2, C.lime)
    g.box(x, ph, 0, pw + 0.2, 0.25, 1.4, C.limeLight)
  }
  // Doors, swung open.
  g.box(-h + 0.75, 0.05, 0.8, 1.6, ph - 0.6, 0.12, C.woodDark, { ry: -1.0, jitter: 0.04 })
  g.box(h - 0.75, 0.05, 0.8, 1.6, ph - 0.6, 0.12, C.woodDark, { ry: 1.0, jitter: 0.04 })
  if (tall) {
    // The lintel and the room over the passage.
    g.box(0, ph - 0.6, 0, 2 * h + 2 * pw - 0.6, 1.4, 1.2, C.lime)
    for (let i = 0; i < 5; i++) g.box(-h - pw + 0.6 + i * ((2 * h + 2 * pw - 1.2) / 4), ph + 0.8, 0.45, 0.5, 0.55, 0.3, C.limeLight)
    g.box(0, ph - 0.6, 0.62, 2 * h - 0.4, 0.3, 0.06, C.woodDark, { jitter: 0 })
  }
  if (level >= 5) {
    for (const x of [-h - pw / 2 + 0.3, h + pw / 2 - 0.3]) {
      g.box(x, ph + 0.25, 0, 0.08, 2.0, 0.08, C.woodDark, { jitter: 0 })
      g.box(x + 0.45, ph + 1.3, 0, 0.8, 0.9, 0.04, C.red, { jitter: 0.03 })
    }
  }
}

// ── The courtyard spot (the Bakehouse's; the 3D yard keeps this model) ──

function courtyardSpot(g: Geo) {
  g.box(0, 0, 0, 4.2, 0.1, 4.2, '#d4b27c', { jitter: 0.02 })
  for (let i = 0; i < 16; i++) {
    const x = -1.5 + (i % 4) * 1.0
    const z = -1.5 + Math.floor(i / 4) * 1.0
    g.box(x, 0.1, z, 0.92, 0.04, 0.92, i % 3 ? C.limeLight : C.lime, { jitter: 0.06 })
  }
  // A stone bench, a fig tree in a ring, two planters.
  g.box(-0.6, 0.12, -1.6, 1.8, 0.42, 0.5, C.limeDark)
  g.cyl(1.2, 0.12, -1.0, 0.65, 0.7, 0.3, C.limeDark, 8)
  g.cyl(1.2, 0.3, -1.0, 0.1, 0.14, 1.1, C.trunk, 5)
  blob(g, 1.2, 1.7, -1.0, 0.9, 0.7, 0.9, C.leaf)
  for (const x of [-1.6, 1.6]) {
    g.cyl(x, 0.12, 1.5, 0.3, 0.24, 0.45, C.mud, 7)
    blob(g, x, 0.75, 1.5, 0.35, 0.3, 0.35, '#7d9a44')
  }
}

// ── Empty spots and building sites ──

/** Footprint (w × d) of each building's spot, for the site markers, scaffolds and tap boxes. */
export const FOOTPRINT: Record<YardSpot, [number, number]> = {
  house: [8.4, 8.4],
  well: [4.6, 4.6],
  wall: [7.4, 2.4],
  store: [6.2, 5.4],
  workshop: [5.6, 4.4],
  fold: [7, 7],
  grove: [6.6, 6.2],
  kiln: [5, 4.4],
  bake: [4.2, 4.2],
}

/** An empty spot: surveyor's pegs and a string round the ground. */
function emptySite(g: Geo, w: number, d: number) {
  g.box(0, 0, 0, w - 0.4, 0.04, d - 0.4, '#d8bb88', { jitter: 0.02 })
  const corners: [number, number][] = [[-w / 2 + 0.4, -d / 2 + 0.4], [w / 2 - 0.4, -d / 2 + 0.4], [w / 2 - 0.4, d / 2 - 0.4], [-w / 2 + 0.4, d / 2 - 0.4]]
  for (const [x, z] of corners) g.box(x, 0, z, 0.12, 0.7, 0.12, C.wood, { jitter: 0 })
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]
    const [bx, bz] = corners[(i + 1) % 4]
    const len = Math.hypot(bx - ax, bz - az)
    g.box((ax + bx) / 2, 0.55, (az + bz) / 2, len, 0.03, 0.03, '#efe3c6', { ry: -Math.atan2(bz - az, bx - ax), jitter: 0 })
  }
}

/** Scaffolding round a building going up: poles, ledgers, planks, a ladder, a heap of stone. */
function scaffold(g: Geo, w: number, d: number, h: number) {
  const hw = w / 2 + 0.25
  const hd = d / 2 + 0.25
  const top = Math.max(2.2, h)
  const xs = [-hw, 0, hw]
  const zs = [-hd, hd]
  for (const x of xs) for (const z of zs) g.cyl(x, 0, z, 0.07, 0.07, top + 0.6, C.wood, 5, { jitter: 0.1 })
  for (const z of [-hd / 3, hd / 3]) for (const x of [-hw, hw]) g.cyl(x, 0, z, 0.07, 0.07, top + 0.6, C.wood, 5, { jitter: 0.1 })
  const levels = top > 4 ? [top * 0.45, top] : [top]
  for (const y of levels) {
    for (const z of zs) g.box(0, y, z, 2 * hw + 0.2, 0.08, 0.08, C.woodDark, { jitter: 0 })
    for (const x of [-hw, hw]) g.box(x, y, 0, 0.08, 0.08, 2 * hd + 0.2, C.woodDark, { jitter: 0 })
    // Planks along the front.
    g.box(0, y + 0.08, hd + 0.05, 2 * hw, 0.06, 0.6, '#c8a06a', { jitter: 0.05 })
  }
  // A cross brace and a ladder.
  const len = Math.hypot(hw, top)
  g.box(-hw / 2, top / 2 - len / 2, -hd - 0.05, 0.06, len, 0.06, C.woodDark, { rz: Math.atan2(hw, top), jitter: 0 })
  for (const x of [hw * 0.55, hw * 0.55 + 0.5]) g.box(x, 0, hd + 0.75, 0.07, top + 0.4, 0.07, C.wood, { rx: -0.25, jitter: 0 })
  for (let i = 1; i < top / 0.45; i++) g.box(hw * 0.55 + 0.25, i * 0.45 * Math.cos(0.25), hd + 0.75 + i * 0.45 * Math.sin(0.25), 0.5, 0.05, 0.05, C.woodDark, { jitter: 0 })
  // Stone and timber waiting at the front.
  for (let i = 0; i < 6; i++) g.box(-hw + 0.7 + (i % 3) * 0.5, 0.02 + (i > 2 ? 0.34 : 0), hd + 0.9 + (i % 2) * 0.12, 0.45, 0.34, 0.42, C.lime, { ry: i * 0.4 })
  log(g, -hw + 1.0, 0.16, hd + 1.6, 2.2, 0.13)
  log(g, -hw + 1.0, 0.16, hd + 1.9, 2.2, 0.13)
}

// ── The catalogue ───────────────────────────────────────────────────────

export type Spot = YardSpot

/** The levels the models are drawn for; higher levels (copper and bread, shared/src/plot.ts) keep the top model. */
const MODELLED: Partial<Record<YardSpot, number>> = { house: 7, well: 5, wall: 5, store: 5, workshop: 5, fold: 5, grove: 5, kiln: 4 }

const cache = new Map<string, BufferGeometry>()
const make = (key: string, seed: number, f: (g: Geo, rand: () => number) => void): BufferGeometry => {
  let geo = cache.get(key)
  if (!geo) {
    const rand = rng(seed)
    const g = new Geo(rand)
    f(g, rand)
    geo = g.build(3)
    cache.set(key, geo)
  }
  return geo
}

/** The model of a building at a level (level 0 = the empty site; the Bakehouse's spot keeps the courtyard model). Cached. */
export function buildingGeometry(spot: Spot, level: number): BufferGeometry {
  if (spot === 'bake') return make('courtyard', 31, courtyardSpot)
  const lv = Math.min(MODELLED[spot] ?? maxLevel(spot), Math.max(0, level))
  const [w, d] = FOOTPRINT[spot]
  if (lv === 0) return make(`${spot}:0`, 41, (g) => emptySite(g, w, d))
  return make(`${spot}:${lv}`, 50 + lv, (g, rand) => {
    switch (spot) {
      case 'house':
        return drawHouse(g, lv)
      case 'well':
        return well(g, lv, rand)
      case 'store':
        return store(g, lv)
      case 'workshop':
        return workshop(g, lv)
      case 'fold':
        return fold(g, lv, rand)
      case 'grove':
        return grove(g, lv, rand)
      case 'kiln':
        return kiln(g, lv)
      case 'wall':
        return gate(g, lv)
    }
  })
}

/** Scaffolding sized to a spot and the height of what is going up there. Cached. */
export function scaffoldGeometry(spot: Spot, height: number): BufferGeometry {
  const [w, d] = FOOTPRINT[spot]
  const h = Math.round(height * 2) / 2
  return make(`scaffold:${spot}:${h}`, 61, (g) => scaffold(g, spot === 'wall' ? w * 0.8 : w * 0.82, spot === 'wall' ? d : d * 0.82, h))
}

/** How tall a model stands (for its name tag and tap box). */
export const topOf = (geo: BufferGeometry) => geo.boundingBox?.max.y ?? 1
