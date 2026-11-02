import { BufferGeometry } from 'three'
import { Geo } from './geo'
import { C } from './palette'
import { rng } from './space'

/**
 * The families' homes, one model per house level (shared/src/plot.ts:
 * tent → mud-brick → stone house → courtyard house → two storeys → villa →
 * house of cedar), each standing on a yard whose foundation reaches into the
 * slope. They are drawn instanced: one draw call per level for the whole city.
 * The front faces +z; the city turns each house a quarter (or not) by lot.
 */

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

/** The yard and its foundation (the part below 0 sinks into the hillside). */
function yard(g: Geo, size: number, color: string = C.earth) {
  g.box(0, -3, 0, size + 0.4, 3.0, size + 0.4, C.limeDark, { jitter: 0.03 })
  g.box(0, 0, 0, size, 0.14, size, color, { jitter: 0.03 })
}

function olive(g: Geo, x: number, z: number, s = 1) {
  g.cyl(x, 0.1, z, 0.12 * s, 0.18 * s, 1.3 * s, C.trunk, 5)
  g.cyl(x, 1.1 * s, z, 0.9 * s, 1.0 * s, 0.9 * s, C.olive, 7)
  g.cone(x, 1.95 * s, z, 0.8 * s, 0.6 * s, C.olive, 7)
}

function tent(g: Geo) {
  yard(g, 6.2)
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
  yard(g, 6.4)
  g.box(0, 0.1, -0.3, 4.2, 2.7, 3.8, C.mud)
  g.box(0, 2.8, -0.3, 4.5, 0.3, 4.1, C.mudDark)
  for (const x of [-1.6, -0.55, 0.55, 1.6]) g.box(x, 2.82, 1.75, 0.16, 0.16, 0.5, C.woodDark, { jitter: 0 })
  door(g, -0.6, 1.6, 0.85, 1.7)
  windowAt(g, 1.1, 1.5, 1.6, 0.5, 0.45)
  g.cyl(1.9, 0.12, 2.4, 0.3, 0.24, 0.75, C.mudDark, 7)
  g.box(-2.1, 0.12, 2.3, 1.2, 0.5, 0.7, '#c9b07a')
}

function stoneHouse(g: Geo) {
  yard(g, 7)
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
  yard(g, s, '#d4b27c')
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

/** One geometry per house level 1…7. */
export function houseGeometries(): BufferGeometry[] {
  const rand = rng(5)
  const make = (f: (g: Geo) => void) => {
    const g = new Geo(rand)
    f(g)
    return g.build(3)
  }
  return [
    make(tent),
    make(mudBrick),
    make(stoneHouse),
    make((g) => courtyard(g, { size: 7.4, wall: C.lime })),
    make((g) => courtyard(g, { size: 7.6, wall: C.limeLight, storey: true })),
    make((g) => courtyard(g, { size: 8, wall: C.plaster, storey: true, upper: true })),
    make((g) => courtyard(g, { size: 8.4, wall: C.marble, storey: true, upper: true, cedar: true })),
  ]
}

/** Free land: a pegged-out plot with a low stone border and a heap of stones. */
export function freeLotGeometry(): BufferGeometry {
  const g = new Geo(rng(9))
  g.box(0, -3, 0, 7, 3.05, 7, C.limeDark, { jitter: 0.02 })
  g.box(0, 0, 0, 6.8, 0.1, 6.8, '#d7b886', { jitter: 0.02 })
  for (const [x, z, w, d] of [[0, -3.3, 6.8, 0.3], [0, 3.3, 6.8, 0.3], [-3.3, 0, 0.3, 6.8], [3.3, 0, 0.3, 6.8]]) g.box(x, 0, z, w, 0.32, d, C.lime)
  for (const [x, z] of [[-3.3, -3.3], [3.3, -3.3], [-3.3, 3.3], [3.3, 3.3]]) g.box(x, 0, z, 0.16, 1.1, 0.16, C.wood, { jitter: 0 })
  for (let i = 0; i < 5; i++) g.box(1.6 + (i % 3) * 0.45, 0.1 + (i > 2 ? 0.35 : 0), -1.6 + (i % 2) * 0.4, 0.45, 0.35, 0.4, C.lime, { ry: i })
  return g.build(3)
}

/** A tuft of weeds: grass blades and a thistle. */
export function weedGeometry(): BufferGeometry {
  const g = new Geo(rng(13))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    g.cone(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25, 0.14, 0.7 + (i % 3) * 0.25, i % 2 ? '#7d8f3a' : '#9aa448', 4, { rz: Math.cos(a) * 0.35, rx: Math.sin(a) * 0.35 })
  }
  g.cone(0, 0, 0, 0.2, 1.1, '#8a9a40', 4)
  return g.build(3)
}

/** The "For sale" sign's post; its board is a textured plane (see City3D). */
export function signPostGeometry(): BufferGeometry {
  const g = new Geo(rng(17))
  g.box(0, 0, 0, 0.2, 3.2, 0.2, C.woodDark, { jitter: 0 })
  g.box(0, 3.0, 0, 3.3, 1.65, 0.1, C.wood, { jitter: 0 })
  return g.build(3)
}
