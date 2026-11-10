import { BufferGeometry, IcosahedronGeometry, Matrix4, PlaneGeometry, type ColorRepresentation } from 'three'
import { maxLevel, type YardSpot } from '@sixtysix/shared'
import { Geo, place, type PartOpts } from './geo'
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
//
// The city draws up to 400 of these, so the small things are cheap: a window,
// a shutter, a stripe or a rug on a roof is a flat panel (two triangles) held
// a little off what is behind it, never a hole in the wall.

const PLANE = new PlaneGeometry(1, 1)
const STRAW = '#d9c283'
const PAVING = '#c98f66'

/** A wall facing +z turned by ry: which way is out, and which way runs along it ([out x, out z, along x, along z]). */
const wallDirs = (ry: number): [number, number, number, number] => [Math.sin(ry), Math.cos(ry), Math.cos(ry), -Math.sin(ry)]

/** A flat panel, seen from its front only: it stands on (x, y, z) facing +z, turned by ry (and leaning by rx about its middle). */
function panel(g: Geo, x: number, y: number, z: number, w: number, h: number, color: string, o: PartOpts = {}) {
  g.add(PLANE, place(x, y + h / 2, z, o).multiply(new Matrix4().makeScale(w, h, 1)), color, o.jitter ?? 0)
}

/** A flat panel lying face up, its middle at (x, y, z): a cloth or a rug spread out on a roof. */
function lying(g: Geo, x: number, y: number, z: number, w: number, d: number, color: string, ry = 0) {
  g.add(PLANE, place(x, y, z, { ry, rx: -Math.PI / 2 }).multiply(new Matrix4().makeScale(w, d, 1)), color, 0.05)
}

/** A rug spread out on a roof (y = the roof's top), with a stripe near each end. */
function rugFlat(g: Geo, x: number, y: number, z: number, w: number, d: number, color: string, stripe: string, ry = 0) {
  lying(g, x, y + 0.04, z, w, d, color, ry)
  for (const k of [-0.32, 0.32]) lying(g, x + Math.cos(ry) * k * w, y + 0.08, z - Math.sin(ry) * k * w, w * 0.12, d, stripe, ry)
}

interface WinOpts {
  w?: number
  h?: number
  /** Wooden shutters folded back against the wall, in this colour. */
  shutters?: string
  /** A lattice across the opening, in this colour. */
  lattice?: string
  /** A sill under it, in this colour. */
  sill?: string
}

/** A small deep-set window: (x, z) on the wall's face, y its foot; the wall faces +z turned by ry. */
function win(g: Geo, x: number, y: number, z: number, ry = 0, o: WinOpts = {}) {
  const w = o.w ?? 0.5
  const h = o.h ?? 0.62
  const [ox, oz, ax, az] = wallDirs(ry)
  panel(g, x + ox * 0.05, y, z + oz * 0.05, w, h, C.dark, { ry })
  if (o.sill) g.box(x + ox * 0.05, y - 0.11, z + oz * 0.05, w + 0.3, 0.11, 0.22, o.sill, { ry, jitter: 0 })
  if (o.shutters) {
    for (const k of [-1, 1]) {
      const d = k * (w * 0.76 + 0.02)
      panel(g, x + ox * 0.09 + ax * d, y - 0.02, z + oz * 0.09 + az * d, w * 0.5, h + 0.04, o.shutters, { ry, jitter: 0.1 })
    }
  }
  if (o.lattice) {
    for (const k of [-1, 1]) panel(g, x + ox * 0.09 + (ax * k * w) / 6, y, z + oz * 0.09 + (az * k * w) / 6, 0.05, h, o.lattice, { ry })
    panel(g, x + ox * 0.09, y + h / 2 - 0.025, z + oz * 0.09, w, 0.05, o.lattice, { ry })
  }
}

/** A house door in a wall facing +z at z: a frame, the dark doorway, a wooden leaf standing half open and a lintel. */
function houseDoor(g: Geo, x: number, z: number, o: { w?: number; h?: number; frame?: string; leaf?: string; lintel?: string } = {}) {
  const w = o.w ?? 0.9
  const h = o.h ?? 1.8
  g.box(x, 0, z + 0.03, w + 0.3, h + 0.2, 0.06, o.frame ?? C.woodDark, { jitter: 0 })
  panel(g, x, 0.14, z + 0.1, w, h - 0.14, C.dark)
  panel(g, x - w * 0.2, 0.14, z + 0.14, w * 0.6, h - 0.14, o.leaf ?? C.wood, { jitter: 0.06 })
  g.box(x, h + 0.08, z + 0.06, w + 0.55, 0.2, 0.24, o.lintel ?? C.wood, { jitter: 0 })
}

/**
 * A cloth awning on a wall facing +z turned by ry: the middle of its back
 * edge is at (x, y, z); it reaches d out and drops by `drop` (0 = a flat
 * shade). Stripes run down it.
 */
function awning(g: Geo, x: number, y: number, z: number, w: number, d: number, drop: number, color: string, o: { ry?: number; stripe?: string; n?: number } = {}) {
  const ry = o.ry ?? 0
  const [ox, oz] = wallDirs(ry)
  const cx = x + (ox * d) / 2
  const cz = z + (oz * d) / 2
  g.slope(cx, y - drop, cz, w, drop, d, 0.06, color, { ry, jitter: 0.04 })
  if (!o.stripe) return
  const n = o.n ?? 3
  const len = Math.hypot(drop, d)
  const base = place(cx, y - drop / 2, cz, { ry }).multiply(new Matrix4().makeRotationX(Math.atan2(drop, d)))
  for (let i = 0; i < n; i++) {
    const m = base
      .clone()
      .multiply(new Matrix4().makeTranslation(((i + 0.5) / n - 0.5) * w, 0.07, 0))
      .multiply(new Matrix4().makeRotationX(-Math.PI / 2))
      .multiply(new Matrix4().makeScale(w / (2 * n), len, 1))
    g.add(PLANE, m, o.stripe, 0)
  }
}

/** A rug hung over a parapet to air: (x, z) the parapet's middle, `top` its top edge; it faces +z turned by ry. */
function rug(g: Geo, x: number, top: number, z: number, w: number, color: string, stripe: string, ry = 0) {
  g.box(x, top - 0.5, z, w, 0.54, 0.32, color, { ry, jitter: 0.04 })
  const [ox, oz, ax, az] = wallDirs(ry)
  for (const k of [-0.3, 0.3]) panel(g, x + ox * 0.2 + ax * k * w, top - 0.5, z + oz * 0.2 + az * k * w, w * 0.14, 0.54, stripe, { ry })
}

/** A storage jar on a roof or in a corner (cheaper than `jar`). */
const pot = (g: Geo, x: number, y: number, z: number, s = 1, color: string = C.mud) => g.cyl(x, y, z, 0.13 * s, 0.24 * s, 0.52 * s, color, 5)

/** A reed mat rolled up. */
const matRoll = (g: Geo, x: number, y: number, z: number, len = 1.3, ry = 0) => g.box(x, y, z, len, 0.26, 0.28, STRAW, { ry, jitter: 0.05 })

/** A ladder against a wall facing +z turned by ry: its top at (x, y + hgt, z), its feet `foot` out from there. */
function ladder(g: Geo, x: number, y: number, z: number, hgt: number, foot: number, ry = 0) {
  const [ox, oz, ax, az] = wallDirs(ry)
  const lean = -Math.atan2(foot, hgt)
  const len = Math.hypot(foot, hgt)
  for (const k of [-0.2, 0.2]) g.box(x + (ox * foot) / 2 + ax * k, y + hgt / 2 - len / 2, z + (oz * foot) / 2 + az * k, 0.07, len, 0.07, C.wood, { ry, rx: lean, jitter: 0 })
  for (let i = 1; i <= 4; i++) {
    const d = foot * (1 - i / 5) + 0.06
    panel(g, x + ox * d, y + (hgt * i) / 5 - 0.035, z + oz * d, 0.4, 0.07, C.woodDark, { ry, rx: lean })
  }
}

/** Stone steps rising towards −z, from zLow up to zHigh: w wide, open on the −x side (and on +x with `both`). */
function stairs(g: Geo, x: number, y: number, zLow: number, zHigh: number, w: number, rise: number, n: number, color: string, both = false) {
  const xl = x - w / 2
  const xr = x + w / 2
  const t: number[] = []
  for (let i = 0; i < n; i++) {
    const z0 = zLow + ((zHigh - zLow) * i) / n
    const z1 = zLow + ((zHigh - zLow) * (i + 1)) / n
    const y0 = y + (rise * i) / n
    const y1 = y + (rise * (i + 1)) / n
    // The riser, the tread, then the side from the ground up to the tread.
    t.push(xl, y0, z0, xr, y0, z0, xr, y1, z0, xl, y0, z0, xr, y1, z0, xl, y1, z0)
    t.push(xl, y1, z0, xr, y1, z0, xr, y1, z1, xl, y1, z0, xr, y1, z1, xl, y1, z1)
    t.push(xl, y, z1, xl, y, z0, xl, y1, z0, xl, y, z1, xl, y1, z0, xl, y1, z1)
    if (both) t.push(xr, y, z0, xr, y, z1, xr, y1, z1, xr, y, z0, xr, y1, z1, xr, y1, z0)
  }
  const top = y + rise
  t.push(xr, y, zHigh, xl, y, zHigh, xl, top, zHigh, xr, y, zHigh, xl, top, zHigh, xr, top, zHigh)
  g.tris(t, color)
}

const post = (g: Geo, x: number, y: number, z: number, h: number, color: string = C.wood) => g.box(x, y, z, 0.1, h, 0.1, color, { jitter: 0 })

function tent(g: Geo) {
  plate(g, 6.2)
  g.prism(0, 0.1, -0.2, 4.4, 2.3, 3.6, C.goatHair)
  g.prism(0, 0.1, -0.2, 4.0, 2.36, 3.7, '#5a443a', { jitter: 0.02 })
  // Woven bands over the ridge.
  g.prism(0, 0.1, -0.2, 0.55, 2.42, 3.8, C.madder, { jitter: 0.02 })
  for (const x of [-1.3, 1.3]) g.prism(x, 0.1, -0.2, 0.26, 2.42, 3.8, C.cream, { jitter: 0.02 })
  // The doorway under a flap held up on two poles.
  g.box(0, 0.1, 1.62, 1.5, 1.3, 0.05, C.dark, { jitter: 0 })
  awning(g, 0, 1.42, 0.6, 2.0, 1.75, -0.08, C.saffron, { stripe: C.madder, n: 2 })
  for (const x of [-0.9, 0.9]) g.cyl(x, 0.1, 2.25, 0.05, 0.05, 1.38, C.wood, 4)
  // A fire ring, a water jar, a rug to sit on and a pack.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    g.box(2.05 + Math.cos(a) * 0.45, 0.12, 2.2 + Math.sin(a) * 0.45, 0.25, 0.2, 0.25, C.limeDark)
  }
  g.cyl(-2.55, 0.12, 1.7, 0.28, 0.22, 0.7, C.mud, 7)
  rugFlat(g, -1.75, 0.14, 2.45, 1.5, 0.85, C.madder, C.cream, 0.12)
  g.box(2.6, 0.12, 0.5, 0.5, 0.42, 0.8, '#c9b07a', { ry: 0.2 })
}

function mudBrick(g: Geo) {
  plate(g, 6.4)
  g.box(0, 0.1, -0.3, 4.2, 2.7, 3.8, C.mud)
  g.box(0, 2.8, -0.3, 4.5, 0.3, 4.1, C.mudDark)
  for (const x of [-1.6, -0.55, 0.55, 1.6]) g.box(x, 2.82, 1.75, 0.16, 0.16, 0.5, C.woodDark, { jitter: 0 })
  houseDoor(g, -0.6, 1.6, { w: 0.85, h: 1.7 })
  win(g, 1.1, 1.45, 1.6, 0, { w: 0.5, h: 0.5, shutters: C.wood, sill: C.woodDark })
  win(g, -2.1, 1.5, -0.6, -Math.PI / 2, { h: 0.5 })
  win(g, 0.7, 1.5, -2.2, Math.PI, { h: 0.5 })
  // A cloth shade over the door, hung from the roof beams.
  awning(g, -0.6, 2.62, 1.6, 1.8, 1.25, 0.5, C.ochre, { stripe: C.cream, n: 3 })
  // The roof is the family's second room: a ladder up, a mat, cloth drying.
  ladder(g, 2.3, 0.14, -1.1, 3.1, 0.8, Math.PI / 2)
  matRoll(g, -1.1, 3.1, -1.5, 1.3, 0.3)
  lying(g, 0.7, 3.14, -0.7, 1.5, 0.95, C.indigo, 0.1)
  lying(g, -0.9, 3.14, 0.5, 1.0, 0.7, C.cream, -0.2)
  g.cyl(1.9, 0.12, 2.4, 0.3, 0.24, 0.75, C.mudDark, 7)
  g.box(-2.1, 0.12, 2.3, 1.2, 0.5, 0.7, '#c9b07a')
}

function stoneHouse(g: Geo) {
  plate(g, 7)
  g.box(0, 0.1, -0.4, 5, 3.2, 4.4, C.lime)
  flatRoof(g, 0, 3.3, -0.4, 5, 4.4)
  houseDoor(g, -0.9, 1.8, { frame: C.limeDark })
  win(g, 1.1, 1.7, 1.8, 0, { shutters: C.wood, sill: C.limeLight })
  win(g, 2.5, 1.7, -0.4, Math.PI / 2, { shutters: C.wood })
  for (const x of [-1.2, 1.2]) win(g, x, 1.8, -2.6, Math.PI)
  // Outside steps up to the roof.
  stairs(g, -2.95, 0.1, 1.5, -2.2, 0.9, 3.4, 5, C.limeDark)
  // A striped shade over the door on two posts.
  awning(g, -0.9, 2.75, 1.8, 1.9, 1.3, 0.4, C.indigo, { stripe: C.cream, n: 3 })
  for (const x of [-1.75, -0.05]) post(g, x, 0.12, 3.02, 2.24)
  // On the roof: a rug airing over the parapet, a mat, a cloth.
  rug(g, 1.2, 4.05, 1.8, 1.3, C.madder, C.cream)
  matRoll(g, 1.0, 3.6, -1.6, 1.4, -0.3)
  lying(g, -0.6, 3.64, -0.6, 1.5, 1.0, C.saffron, 0.15)
  g.cyl(1.9, 0.12, 2.6, 0.32, 0.25, 0.8, C.mud, 7)
}

interface CourtOpts {
  size: number
  wall: string
  /** The flat roofs' floor. */
  roof: string
  /** The two cloth colours of the house (awnings and rugs), and the shutters' colour. */
  a: string
  b: string
  shutter: string
  storey?: boolean
  upper?: boolean
  cedar?: boolean
}

/** The courtyard house and every level above it share this plan: rooms at the back and left, a walled court in front. */
function courtyard(g: Geo, o: CourtOpts) {
  const s = o.size
  const h = s / 2 - 0.3
  plate(g, s, '#d4b27c')
  // Back rooms (their front at zf) and the left wing (its court side at xw).
  const backD = s * 0.38
  const bz = -h + backD / 2
  const zf = bz + backD / 2
  const wingW = s * 0.3
  const wx = -h + wingW / 2
  const xw = wx + wingW / 2
  const wz = (zf + h) / 2
  const wd = h - zf
  /** The court's right side: the court wall, or the house of cedar's right wing. */
  const xr = o.cedar ? -xw : h - 0.24
  const trim = o.cedar ? C.cedar : C.lime
  const timber = o.cedar ? C.cedar : C.woodDark
  const sh = { shutters: o.shutter }
  g.box(0, 0.1, bz, s - 0.6, 3.3, backD, o.wall)
  g.box(wx, 0.1, wz, wingW, 3.0, wd, o.wall)
  if (o.cedar) g.box(-wx, 0.1, wz, wingW, 3.0, wd, o.wall)
  else g.box(h - 0.12, 0.1, wz, 0.24, 1.7, wd, o.wall)
  // The court's front wall and its gate, the leaves swung in.
  const gx = o.cedar ? 0 : (xw + xr) / 2 + 0.3
  const gh = o.cedar ? 0.75 : 0.6
  const fr = o.cedar ? xr : h
  g.box((xw + gx - gh) / 2, 0.1, h - 0.12, gx - gh - xw, 1.7, 0.24, o.wall)
  g.box((gx + gh + fr) / 2, 0.1, h - 0.12, fr - gx - gh, 1.7, 0.24, o.wall)
  g.box(gx, 1.8, h - 0.12, 2 * gh + 0.5, 0.25, 0.3, timber, { jitter: 0 })
  const swing = 1.1
  const leaf = (k: 1 | -1, len: number) =>
    g.box(gx - k * gh + (k * Math.cos(swing) * len) / 2, 0.14, h - 0.14 - (Math.sin(swing) * len) / 2, len, 1.5, 0.08, o.cedar ? C.cedar : C.wood, { ry: k * swing, jitter: 0.05 })
  leaf(1, o.cedar ? 0.74 : 1.15)
  if (o.cedar) {
    leaf(-1, 0.74)
    panel(g, gx, 1.87, h + 0.07, 2 * gh + 0.3, 0.1, C.gold)
  }
  // Doors and windows on the court, and windows to the street and the back.
  const dx = o.cedar ? 0 : 0.6
  houseDoor(g, dx, zf, { h: 1.9, frame: timber, leaf: o.cedar ? C.cedar : C.wood, lintel: o.cedar ? C.gold : C.wood })
  win(g, Math.max(xw + 0.45, dx - 1.5), 1.9, zf, 0, { lattice: timber })
  win(g, o.cedar ? 0.93 : 2.0, 1.9, zf, 0, { lattice: timber })
  win(g, xw, 1.6, h - 1.4, Math.PI / 2, sh)
  win(g, wx, 1.7, h, 0, { ...sh, sill: C.limeLight })
  for (const z of [wz - 0.9, wz + 0.9]) win(g, -h, 1.8, z, -Math.PI / 2)
  for (const x of [-2.2, 0, 2.2]) win(g, x, 1.9, -h, Math.PI)
  if (o.cedar) {
    win(g, -wx, 1.7, h, 0, { ...sh, sill: C.limeLight })
    win(g, -xw, 1.6, h - 1.4, -Math.PI / 2, sh)
    for (const z of [wz - 0.9, wz + 0.9]) win(g, h, 1.8, z, Math.PI / 2)
  } else win(g, h, 1.9, bz, Math.PI / 2, sh)
  // Flat roofs: the back rooms', and each wing's a step lower.
  flatRoof(g, 0, 3.4, bz, s - 0.6, backD, o.roof, trim)
  const wingRoof = (k: 1 | -1, parapet: boolean) => {
    g.box(k * wx, 3.1, wz, wingW + 0.2, 0.3, wd + 0.2, o.roof)
    g.box(k * wx, 3.4, h, wingW + 0.2, 0.4, 0.22, trim)
    if (!parapet) return
    g.box(-k * h, 3.4, wz, 0.22, 0.4, wd + 0.2, trim)
    g.box(k * xw, 3.4, wz, 0.22, 0.4, wd + 0.2, trim)
  }
  wingRoof(1, !o.upper)
  if (o.cedar) wingRoof(-1, true)
  rug(g, wx, 3.8, h, 1.2, o.b, C.cream)
  // The court: a tree, a cistern, a jar, and steps up to the roof.
  olive(g, o.cedar ? 0.45 : 1.3, o.cedar ? 1.8 : 1.6, o.cedar ? 1.0 : 0.9)
  g.cyl(-0.4, 0.12, 2.0, 0.5, 0.55, 0.45, C.limeDark, 7)
  pot(g, o.cedar ? -1.05 : xr - 0.4, 0.12, h - 0.65, 1.3)
  if (!o.cedar) stairs(g, xr - 0.4, 0.1, zf + 3.0, zf, 0.8, 3.3, 5, C.limeDark, true)
  if (!o.upper) {
    // A cloth shade over the door, and washing spread out on the wing's roof.
    awning(g, dx, 2.75, zf, 1.9, 1.2, 0.35, o.a, { stripe: C.cream, n: 3 })
    for (const x of [dx - 0.86, dx + 0.86]) post(g, x, 0.12, zf + 1.12, 2.26)
    lying(g, wx - 0.1, 3.44, wz - 0.7, 1.2, 0.8, C.cream, 0.2)
    lying(g, wx + 0.15, 3.44, wz + 0.8, 1.0, 0.7, o.a, -0.3)
  }
  if (!o.storey) {
    rugFlat(g, 1.2, 3.7, bz, 1.7, 1.1, o.b, C.cream, 0.1)
    matRoll(g, -1.2, 3.7, bz - 0.3, 1.4, 0.4)
    pot(g, 2.7, 3.7, bz + 0.6)
  }
  if (o.storey) {
    // A second storey on the back rooms, with a shaded roof terrace beside it.
    const ux = -s * 0.16
    const uw = s * 0.55
    const ud = backD - 0.2
    const zu = bz + ud / 2
    g.box(ux, 3.4, bz, uw, 2.8, ud, o.wall)
    flatRoof(g, ux, 6.2, bz, uw, ud, o.roof, trim)
    // Its windows on the court, clear of the upper room.
    const cu = o.upper ? (xw + ux + uw / 2) / 2 : ux
    const gap = o.upper ? 0.6 : 0.9
    for (const k of [-1, 1]) win(g, cu + k * gap, 4.6, zu, 0, { ...sh, sill: o.cedar ? C.gold : C.limeLight })
    for (const x of [ux - 1.0, ux + 1.0]) win(g, x, 4.6, bz - ud / 2, Math.PI)
    win(g, ux - uw / 2, 4.6, bz, -Math.PI / 2)
    rug(g, cu, 6.95, zu, 0.7, o.b, C.cream)
    const tx = (ux + uw / 2 + h) / 2
    for (const [px, pz] of [[-0.9, -0.8], [0.9, -0.8], [-0.9, 0.8], [0.9, 0.8]]) g.box(tx + px, 3.7, bz + pz, 0.12, 1.7, 0.12, timber, { jitter: 0 })
    awning(g, tx, 5.45, bz - 1.0, 2.2, 2.0, 0, o.a, { stripe: C.cream, n: 3 })
    pot(g, tx + 0.7, 3.7, zf - 0.4, 1.1)
    blob(g, tx + 0.7, 4.5, zf - 0.4, 0.34, 0.32, 0.34, C.green)
    // On the top roof: a rug, a mat, a jar.
    rugFlat(g, ux + 0.7, 6.5, bz, 1.6, 1.0, o.cedar ? C.blue : C.green, C.cream, 0.12)
    matRoll(g, ux - 1.0, 6.5, bz + 0.2, 1.3, 1.2)
    pot(g, ux - uw / 2 + 0.6, 6.5, bz - 0.5)
    if (o.cedar) g.box(ux, 6.55, zu + 0.1, uw, 0.18, 0.1, C.gold, { jitter: 0 })
  }
  if (o.upper) {
    // The upper room (aliyah) over the wing, with a little colonnade in the court.
    const rz = wz - 0.2
    const rd = wd - 0.6
    g.box(wx, 3.4, rz, wingW, 2.3, rd, o.wall)
    flatRoof(g, wx, 5.7, rz, wingW, rd, o.roof, trim)
    win(g, xw, 4.4, wz, Math.PI / 2, sh)
    win(g, wx, 4.3, rz + rd / 2, 0, { lattice: timber, sill: o.cedar ? C.gold : C.limeLight })
    for (const z of [wz - 0.8, wz + 0.6]) win(g, -h, 4.4, z, -Math.PI / 2)
    rugFlat(g, wx, 6.0, rz, 1.3, 0.9, o.a, C.cream, Math.PI / 2 + 0.1)
    const c0 = xw
    const c1 = o.cedar ? xr : xr - 0.9
    for (const x of [c0 + 0.2, c1 - 0.2]) g.cyl(x, 0.12, zf + 0.95, 0.18, 0.2, 3.05, C.marble, 6)
    g.box((c0 + c1) / 2, 3.17, zf + 0.95, c1 - c0, 0.16, 0.2, timber, { jitter: 0 })
    if (o.cedar) {
      // A cedar roof on the colonnade, edged with gold.
      g.box((c0 + c1) / 2, 3.33, zf + 0.6, c1 - c0, 0.2, 1.2, C.cedar)
      g.box((c0 + c1) / 2, 3.36, zf + 1.2, c1 - c0, 0.14, 0.08, C.gold, { jitter: 0 })
      g.box(wx, 6.05, rz + rd / 2 + 0.1, wingW, 0.18, 0.1, C.gold, { jitter: 0 })
    } else awning(g, (c0 + c1) / 2, 3.62, zf, c1 - c0, 1.25, 0.3, C.tile, { stripe: '#cf7a52', n: 6 })
  }
  if (o.cedar) {
    // The right wing's roof: a blue shade and a rug.
    awning(g, -wx, 4.9, wz - 1.0, 1.7, 1.8, 0, C.blue, { stripe: C.gold, n: 2 })
    for (const [px, pz] of [[-0.75, 0.1], [0.75, 0.1], [-0.75, 1.7], [0.75, 1.7]]) post(g, -wx + px, 3.4, wz - 1.0 + pz, 1.47, C.cedar)
    rug(g, -wx, 3.8, h, 1.2, C.red, C.gold)
  }
}

/** Yard size of each house level 1…7 (the city's foundations follow it). */
export const HOUSE_YARD = [6.2, 6.4, 7, 7.4, 7.6, 8, 8.4]

const HOUSE: ((g: Geo) => void)[] = [
  tent,
  mudBrick,
  stoneHouse,
  (g) => courtyard(g, { size: 7.4, wall: C.lime, roof: C.roof, a: C.madder, b: C.saffron, shutter: C.wood }),
  (g) => courtyard(g, { size: 7.6, wall: C.limeLight, roof: '#dcc59a', a: C.indigo, b: C.madder, shutter: C.wood, storey: true }),
  (g) => courtyard(g, { size: 8, wall: C.plaster, roof: PAVING, a: C.saffron, b: C.indigo, shutter: C.green, storey: true, upper: true }),
  (g) => courtyard(g, { size: 8.4, wall: C.marble, roof: C.cream, a: C.red, b: C.blue, shutter: C.cedar, storey: true, upper: true, cedar: true }),
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
    // Shade baked into the colours: where walls meet the ground and each other (ao.ts).
    geo = g.build(3, { ao: { ground: () => 0 } })
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
