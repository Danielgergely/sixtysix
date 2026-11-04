import { BufferGeometry, IcosahedronGeometry, Matrix4 } from 'three'
import { Geo, place } from '../../world/city3d/geo'
import { rng } from '../../world/city3d/space'

/**
 * Every model of the run, built once from boxes, cylinders and triangles
 * (`Geo`, the city's mesh builder) with baked vertex colours: one geometry
 * per kind, drawn instanced. Units: the runner is 2.25 tall, a lane 2.4
 * wide; models stand on y = 0, centred on x = 0, the track runs along −z.
 */

/** Egypt's paint box: sandstone, mud brick, the painted bands of temples, palms. */
export const E = {
  sand: '#e8c890',
  sandstone: '#e3c08a',
  stoneDark: '#c79c66',
  brick: '#b9784e',
  brickDark: '#94593a',
  plaster: '#f1e6cf',
  blue: '#2f6fb8',
  red: '#c4472f',
  gold: '#e7b63e',
  green: '#4f9a5e',
  wood: '#8a5a33',
  woodDark: '#5e3b20',
  palm: '#5fa03c',
  palmDark: '#3f7d2f',
  straw: '#e9c45e',
  linen: '#f4ecd8',
  door: '#4a2c1a',
}

/** The sea floor's: wet sand, rock, coral, weed. */
export const S = {
  rock: '#7d6f63',
  rockDark: '#5b5049',
  moss: '#4f8a5a',
  coralPink: '#ef7b8f',
  coralOrange: '#f29a4a',
  coralPurple: '#a46ad1',
  weed: '#3f9a6a',
  weedDark: '#2b7552',
  shell: '#f6e1d0',
  star: '#f08a3c',
  driftwood: '#8c7a62',
}

const R = new Matrix4()

// ── Egypt scenery ────────────────────────────────────────────────────────

/** A flat-roofed mud-brick house front: plaster, a dark door, a painted band, maybe an awning. */
export function house(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const w = 4 + r() * 3
  const h = 3.2 + r() * 2.6
  const d = 4.5
  const wall = r() < 0.5 ? E.plaster : r() < 0.5 ? E.sandstone : '#e7cfa6'
  g.box(0, 0, 0, w, h, d, wall)
  // Parapet and roof edge.
  g.box(0, h, 0, w + 0.2, 0.35, d + 0.2, E.stoneDark)
  // Painted band under the roof.
  const band = [E.blue, E.red, E.green, E.gold][Math.floor(r() * 4)]
  g.box(0, h - 0.7, 0, w + 0.04, 0.32, d + 0.04, band, { jitter: 0.02 })
  g.box(0, h - 0.95, 0, w + 0.05, 0.1, d + 0.05, E.gold, { jitter: 0.02 })
  // A door and two windows on the side facing the track (+x when placed left, turned for the right).
  g.box(w / 2 + 0.01, 0, 0.2, 0.1, 1.9, 1.1, E.door)
  g.box(w / 2 + 0.02, 0, 0.2, 0.14, 2.1, 1.35, E.wood, { jitter: 0.02 })
  g.box(w / 2 + 0.03, 0, 0.2, 0.12, 1.95, 1.15, E.door)
  if (h > 4) {
    g.box(w / 2 + 0.02, h - 2, -1.4, 0.1, 0.7, 0.6, E.door)
    g.box(w / 2 + 0.02, h - 2, 1.6, 0.1, 0.7, 0.6, E.door)
  }
  // Striped awning over the door, on two poles.
  if (r() < 0.65) {
    const c = [E.red, E.blue, '#d9822b'][Math.floor(r() * 3)]
    for (let i = 0; i < 4; i++) g.slope(w / 2 + 0.9, 2.3, -0.55 + 0.2 + i * 0.5, 1.8, 0.5, 0.5, 0.06, i % 2 ? E.linen : c, { ry: Math.PI / 2 })
    g.cyl(w / 2 + 1.7, 0, -0.4, 0.05, 0.06, 2.3, E.wood, 5)
    g.cyl(w / 2 + 1.7, 0, 1.6, 0.05, 0.06, 2.3, E.wood, 5)
  }
  // Jars or a basket on the roof.
  if (r() < 0.6) {
    jar(g, -w / 4, h + 0.35, -1, 0.35, '#c98a55')
    jar(g, -w / 4 + 0.7, h + 0.35, -0.7, 0.28, '#b5733f')
  }
  return g.build(2)
}

function jar(g: Geo, x: number, y: number, z: number, s: number, color: string) {
  g.cyl(x, y, z, s * 0.55, s * 0.35, s * 0.5, color, 8)
  g.cyl(x, y + s * 0.5, z, s * 0.35, s * 0.55, s * 0.7, color, 8)
  g.cyl(x, y + s * 1.2, z, s * 0.22, s * 0.3, s * 0.25, color, 8)
  g.cyl(x, y + s * 1.45, z, s * 0.28, s * 0.22, s * 0.1, color, 8)
}

/** A cluster of storage jars. */
export function jars(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const n = 3 + Math.floor(r() * 3)
  for (let i = 0; i < n; i++) jar(g, (r() - 0.5) * 1.6, 0, (r() - 0.5) * 1.6, 0.6 + r() * 0.35, r() < 0.5 ? '#c98a55' : '#b5733f')
  return g.build(2)
}

/** A date palm: a curved, ringed trunk and drooping fronds. */
export function palm(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const h = 6 + r() * 3
  const lean = (r() - 0.5) * 0.5
  const segs = 9
  let x = 0
  for (let i = 0; i < segs; i++) {
    const y = (i / segs) * h
    const nx = lean * ((i + 1) / segs) ** 2 * h * 0.3
    g.cyl(x, y, 0, 0.2 - i * 0.008, 0.25 - i * 0.008, h / segs + 0.05, i % 2 ? E.wood : '#9b6a3e', 6, { rz: -lean * 0.35 })
    x = nx
  }
  const top = h
  // Dates.
  g.cyl(x, top - 0.6, 0, 0.35, 0.2, 0.5, '#c0662c', 6)
  // Fronds: a spine of tris drooping out and down.
  const n = 9
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3
    const len = 2.6 + r() * 1
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const tri: number[] = []
    const steps = 4
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps
      const t1 = (k + 1) / steps
      const p0 = [x + ca * len * t0, top + Math.sin(t0 * 2.2) * 0.9 - t0 * t0 * 1.8, sa * len * t0]
      const p1 = [x + ca * len * t1, top + Math.sin(t1 * 2.2) * 0.9 - t1 * t1 * 1.8, sa * len * t1]
      const wd = 0.55 * (1 - t0 * 0.7)
      const wd1 = 0.55 * (1 - t1 * 0.7)
      const px = -sa
      const pz = ca
      // Two halves of the leaf, folded slightly along the spine.
      tri.push(p0[0], p0[1], p0[2], p1[0] + px * wd1, p1[1] - 0.15, p1[2] + pz * wd1, p1[0], p1[1], p1[2])
      tri.push(p0[0], p0[1], p0[2], p0[0] + px * wd, p0[1] - 0.15, p0[2] + pz * wd, p1[0] + px * wd1, p1[1] - 0.15, p1[2] + pz * wd1)
      tri.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p1[0] - px * wd1, p1[1] - 0.15, p1[2] - pz * wd1)
      tri.push(p0[0], p0[1], p0[2], p1[0] - px * wd1, p1[1] - 0.15, p1[2] - pz * wd1, p0[0] - px * wd, p0[1] - 0.15, p0[2] - pz * wd)
    }
    // Both faces, so a frond seen from below is not missing.
    const back: number[] = []
    for (let k = 0; k < tri.length; k += 9) back.push(...tri.slice(k, k + 3), ...tri.slice(k + 6, k + 9), ...tri.slice(k + 3, k + 6))
    g.tris(tri, i % 2 ? E.palm : E.palmDark, 0.08)
    g.tris(back, i % 2 ? E.palm : E.palmDark, 0.08)
  }
  return g.build(2)
}

/** An obelisk with a gilded tip and carved bands. */
export function obelisk(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const h = 8 + r() * 3
  g.box(0, 0, 0, 2, 0.8, 2, E.stoneDark)
  g.cyl(0, 0.8, 0, 0.5, 0.75, h, E.sandstone, 4, { ry: Math.PI / 4 })
  g.cone(0, 0.8 + h, 0, 0.5 * Math.SQRT2 * 0.72, 0.9, E.gold, 4, { ry: Math.PI / 4 })
  for (let i = 1; i < 5; i++) {
    const y = 0.8 + (h * i) / 5.5
    const k = 0.75 - (0.25 * i) / 5.5
    g.cyl(0, y, 0, k * 1.02, k * 1.02, 0.12, E.stoneDark, 4, { ry: Math.PI / 4 })
  }
  return g.build(2)
}

/** A temple pylon: two battered towers with painted reliefs and a gate between, banners on poles. */
export function pylon(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const tower = (x: number) => {
    const w = 5
    const d = 3
    const h = 9
    const top = 0.78
    g.poly(
      [
        [x - w / 2, -d / 2],
        [x + w / 2, -d / 2],
        [x + w / 2, d / 2],
        [x - w / 2, d / 2],
      ],
      0,
      0.01,
      E.sandstone,
    )
    // Battered (tapering) tower as stacked slabs.
    const slabs = 6
    for (let i = 0; i < slabs; i++) {
      const k = 1 - (1 - top) * (i / slabs)
      g.box(x, (h * i) / slabs, 0, w * k, h / slabs + 0.02, d * k, i % 2 ? E.sandstone : '#dfb983', { jitter: 0.02 })
    }
    g.box(x, h, 0, w * top + 0.3, 0.5, d * top + 0.3, E.stoneDark)
    // Painted relief panels on the face (+z).
    g.box(x, 2.2, d / 2 - 0.2, w * 0.7, 2.6, 0.12, E.blue, { jitter: 0.02 })
    g.box(x, 2.4, d / 2 - 0.14, w * 0.5, 2.2, 0.08, E.gold, { jitter: 0.02 })
    g.box(x, 5.6, d / 2 - 0.5, w * 0.62, 1.4, 0.12, E.red, { jitter: 0.02 })
    // A banner pole in front.
    g.cyl(x + w * 0.32, 0, d / 2 + 0.3, 0.07, 0.09, h + 3, E.wood, 5)
    g.box(x + w * 0.32 + 0.45, h - 1, d / 2 + 0.3, 0.8, 3.4, 0.05, r() < 0.5 ? E.red : E.blue, { jitter: 0.02 })
  }
  tower(-4.6)
  tower(4.6)
  // The gate between.
  g.box(0, 0, 0, 4.2, 6.5, 2.6, '#dfb983')
  g.box(0, 0, 1.32, 2.2, 4.4, 0.1, E.door)
  g.box(0, 6.5, 0, 4.8, 0.6, 2.9, E.gold)
  return g.build(2)
}

/** Rows of mud bricks drying in the sun, as in a brick yard. */
export function brickRows(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  for (let row = 0; row < 4; row++)
    for (let i = 0; i < 7; i++) g.box(i * 0.75 - 2.3, 0, row * 0.95 - 1.4, 0.6, 0.22, 0.35, r() < 0.5 ? E.brick : '#c58658', { ry: (r() - 0.5) * 0.15 })
  // Two stacks drying higher.
  for (let k = 0; k < 2; k++) for (let l = 0; l < 4; l++) g.box(3.2 + k * 0.9, l * 0.24, -0.6 + (l % 2) * 0.2, 0.62, 0.22, 0.36, E.brick, { ry: (l % 2) * Math.PI / 2 })
  // A mould and a heap of straw.
  g.cone(-3.6, 0, 0.4, 0.9, 0.8, E.straw, 7)
  return g.build(2)
}

/** A clump of papyrus: green stalks with fanned heads. */
export function papyrus(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  for (let i = 0; i < 9; i++) {
    const x = (r() - 0.5) * 1.4
    const z = (r() - 0.5) * 1.4
    const h = 1.6 + r() * 1.1
    const rz = (r() - 0.5) * 0.4
    const rx = (r() - 0.5) * 0.4
    g.cyl(x, 0, z, 0.03, 0.05, h, E.green, 4, { rz, rx })
    g.cone(x - Math.sin(rz) * h, h - 0.05, z + Math.sin(rx) * h, 0.35, 0.45, '#7cba4c', 6, { rx: Math.PI })
  }
  return g.build(2)
}

/** Dunes beyond the town: long low hills. */
export function dune(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  g.add(new IcosahedronGeometry(1, 1), R.makeScale(12 + r() * 10, 3 + r() * 3, 9 + r() * 6), E.sand, 0.03)
  return g.build(6)
}

// ── Egypt obstacles ──────────────────────────────────────────────────────

/** Jump: a pallet of bricks, knee high, the width of a lane. */
export function brickPile(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  g.box(0, 0, 0, 2.1, 0.18, 1.1, E.woodDark)
  for (let l = 0; l < 3; l++)
    for (let i = 0; i < 3; i++) g.box(-0.66 + i * 0.66, 0.18 + l * 0.26, 0, 0.62, 0.25, l % 2 ? 0.9 : 1, l % 2 ? E.brickDark : E.brick)
  return g.build(2)
}

/** Duck: linen hung to dry on a beam across the lane. The beam's underside is at 1.5. */
export function linenBeam(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  g.cyl(-1.15, 0, 0, 0.1, 0.12, 3.1, E.wood, 6)
  g.cyl(1.15, 0, 0, 0.1, 0.12, 3.1, E.wood, 6)
  g.box(0, 2.9, 0, 2.7, 0.2, 0.25, E.woodDark)
  const cloth = [E.linen, E.red, E.blue, '#e6a13a']
  for (let i = 0; i < 4; i++) g.box(-0.82 + i * 0.55, 1.55, 0.02, 0.5, 1.35, 0.04, cloth[(i + Math.floor(r() * 4)) % 4], { jitter: 0.03 })
  return g.build(2)
}

/** Change lanes: a straw cart, taller than a jump. */
export function strawCart(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  g.box(0, 0.6, 0, 2.1, 0.25, 2.8, E.wood)
  g.box(-1.0, 0.85, 0, 0.1, 0.6, 2.8, E.woodDark)
  g.box(1.0, 0.85, 0, 0.1, 0.6, 2.8, E.woodDark)
  for (const z of [-0.9, 0.9]) for (const x of [-1.15, 1.15]) {
    g.cyl(x, 0.62, z, 0.62, 0.62, 0.14, E.woodDark, 10, { rz: Math.PI / 2 })
    g.cyl(x * 1.04, 0.62, z, 0.16, 0.16, 0.16, E.wood, 6, { rz: Math.PI / 2 })
  }
  g.prism(0, 0.85, 0, 2.0, 1.8, 2.6, E.straw, { ry: Math.PI / 2 })
  g.box(0, 0.85, 0, 1.9, 0.6, 2.6, '#e0b44f')
  g.box(0, 0.35, 1.9, 0.12, 0.12, 1.2, E.woodDark)
  return g.build(2)
}

/** Change lanes: a statue block on its sledge, waiting to be hauled. */
export function stoneSledge(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  g.box(-0.8, 0, 0, 0.25, 0.25, 3, E.woodDark)
  g.box(0.8, 0, 0, 0.25, 0.25, 3, E.woodDark)
  g.box(0, 0.25, 0, 2, 2.4, 2.2, E.sandstone)
  g.box(0, 2.65, 0, 1.4, 0.5, 1.4, E.stoneDark)
  for (let i = 0; i < 3; i++) g.box(0, 0.6 + i * 0.6, 1.11, 1.6, 0.12, 0.04, E.stoneDark, { jitter: 0.02 })
  g.cyl(0, 0.2, 1.65, 0.05, 0.05, 1.6, '#c7a46a', 5, { rx: Math.PI / 2 - 0.3 })
  return g.build(2)
}

// ── Red Sea scenery ──────────────────────────────────────────────────────

function lump(g: Geo, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, seed: number) {
  const r = rng(seed)
  // Rounded, then dented: the same corner moves the same way on every face it belongs to.
  const ico = new IcosahedronGeometry(1, 1)
  const p = ico.getAttribute('position')
  const dent = new Map<string, number>()
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`
    if (!dent.has(key)) dent.set(key, 0.82 + r() * 0.3)
    const k = dent.get(key)!
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k)
  }
  ico.computeVertexNormals()
  g.add(ico, place(x, y, z, { ry: r() * 6 }).multiply(new Matrix4().makeScale(sx, sy, sz)), color, 0.05)
  ico.dispose()
}

/** A sea rock with moss and weed. */
export function seaRock(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const s = 0.8 + r() * 1.2
  lump(g, 0, s * 0.4, 0, s * 1.3, s, s * 1.1, r() < 0.5 ? S.rock : S.rockDark, seed)
  lump(g, s * 0.2, s * 1.1, 0, s * 0.8, s * 0.35, s * 0.7, S.moss, seed + 1)
  for (let i = 0; i < 3; i++) weedBlade(g, (r() - 0.5) * s * 2, 0, s * 0.9 + r() * 0.3, 0.8 + r() * 0.8, r)
  return g.build(2)
}

function weedBlade(g: Geo, x: number, y: number, z: number, h: number, r: () => number) {
  let px = x
  let py = y
  const segs = 4
  for (let i = 0; i < segs; i++) {
    const nx = px + (r() - 0.5) * 0.3
    const ny = py + h / segs
    g.tris([px - 0.08, py, z, nx + 0.06, ny, z, px + 0.08, py, z, px - 0.08, py, z, nx - 0.06, ny, z, nx + 0.06, ny, z], i % 2 ? S.weed : S.weedDark)
    g.tris([px - 0.08, py, z, px + 0.08, py, z, nx + 0.06, ny, z, px - 0.08, py, z, nx + 0.06, ny, z, nx - 0.06, ny, z], i % 2 ? S.weed : S.weedDark)
    px = nx
    py = ny
  }
}

/** Branching coral in a bright colour. */
export function coral(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const color = [S.coralPink, S.coralOrange, S.coralPurple][Math.floor(r() * 3)]
  const branch = (x: number, y: number, z: number, len: number, rx: number, rz: number, depth: number) => {
    g.cyl(x, y, z, 0.07 * (depth + 1), 0.1 * (depth + 1), len, color, 5, { rx, rz })
    if (depth === 0) {
      g.cyl(x - Math.sin(rz) * len, y + Math.cos(rz) * Math.cos(rx) * len, z + Math.sin(rx) * len, 0.13, 0.08, 0.15, '#fff0e0', 5)
      return
    }
    const ex = x - Math.sin(rz) * len
    const ey = y + Math.cos(rz) * Math.cos(rx) * len
    const ez = z + Math.sin(rx) * len
    for (let i = 0; i < 2 + Math.floor(r() * 2); i++) branch(ex, ey, ez, len * 0.7, rx + (r() - 0.5) * 1.1, rz + (r() - 0.5) * 1.1, depth - 1)
  }
  lump(g, 0, 0.1, 0, 0.6, 0.3, 0.6, S.rockDark, seed)
  for (let i = 0; i < 3; i++) branch((r() - 0.5) * 0.4, 0.2, (r() - 0.5) * 0.4, 0.6 + r() * 0.4, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6, 2)
  return g.build(2)
}

/** A tall stand of sea weed. */
export function kelp(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  for (let i = 0; i < 6; i++) weedBlade(g, (r() - 0.5) * 1.2, 0, (r() - 0.5) * 1.2, 1.4 + r() * 1.8, r)
  return g.build(2)
}

/** Shells and a starfish on the sand. */
export function shells(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  for (let i = 0; i < 5; i++) g.cone((r() - 0.5) * 2.5, 0, (r() - 0.5) * 2.5, 0.16, 0.12, S.shell, 7, { rx: -Math.PI / 2 + 0.3 })
  const star: number[] = []
  const cx = (r() - 0.5) * 2
  const cz = (r() - 0.5) * 2
  for (let a = 0; a < 5; a++) {
    const t = (a / 5) * Math.PI * 2
    const t0 = t - 0.45
    const t1 = t + 0.45
    star.push(cx, 0.09, cz, cx + Math.cos(t1) * 0.14, 0.05, cz + Math.sin(t1) * 0.14, cx + Math.cos(t) * 0.5, 0.03, cz + Math.sin(t) * 0.5)
    star.push(cx, 0.09, cz, cx + Math.cos(t) * 0.5, 0.03, cz + Math.sin(t) * 0.5, cx + Math.cos(t0) * 0.14, 0.05, cz + Math.sin(t0) * 0.14)
  }
  g.tris(star, S.star)
  return g.build(2)
}

/** A chariot wheel lost in the sea bed (Exodus 14:25). */
export function wheel(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const spokes = 6
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.box(Math.cos(a) * 0.85, 0.05, Math.sin(a) * 0.85, 0.48, 0.12, 0.16, E.woodDark, { ry: -a + Math.PI / 2 })
  }
  for (let i = 0; i < spokes; i++) g.box(0, 0.05, 0, 0.06, 0.08, 1.6, E.wood, { ry: (i / spokes) * Math.PI })
  g.cyl(0, 0.04, 0, 0.18, 0.18, 0.2, E.gold, 8)
  return g.build(2)
}

// ── Red Sea obstacles ────────────────────────────────────────────────────

/** Jump: a ridge of rock and weed across the lane. */
export function reef(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  lump(g, -0.55, 0.35, 0, 0.75, 0.6, 0.6, S.rock, seed)
  lump(g, 0.5, 0.3, 0.05, 0.8, 0.55, 0.55, S.rockDark, seed + 3)
  lump(g, 0, 0.75, 0, 0.9, 0.25, 0.4, S.moss, seed + 5)
  for (let i = 0; i < 4; i++) weedBlade(g, -0.9 + i * 0.6, 0.5, 0.35, 0.5 + r() * 0.4, r)
  return g.build(2)
}

/** Duck: an arch of coral across the lane, its underside at about 1.5. */
export function coralArch(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  lump(g, -1.05, 1, 0, 0.45, 1.1, 0.5, S.rock, seed)
  lump(g, 1.05, 1, 0, 0.45, 1.1, 0.5, S.rockDark, seed + 1)
  lump(g, 0, 2.2, 0, 1.5, 0.55, 0.55, S.rock, seed + 2)
  for (let i = 0; i < 5; i++) {
    const x = -1 + i * 0.5
    g.cone(x, 2.5, (r() - 0.5) * 0.3, 0.16, 0.5 + r() * 0.4, [S.coralPink, S.coralOrange, S.coralPurple][i % 3], 5)
    g.cone(x + 0.2, 1.95, 0.25, 0.12, 0.35, [S.coralPink, S.coralOrange, S.coralPurple][(i + 1) % 3], 5, { rx: Math.PI })
  }
  return g.build(2)
}

/** Change lanes: a great boulder grown with coral. */
export function boulder(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  lump(g, 0, 1.3, 0, 1.25, 1.5, 1.3, S.rock, seed)
  lump(g, 0.3, 2.6, 0.1, 0.8, 0.4, 0.7, S.moss, seed + 1)
  for (let i = 0; i < 4; i++) g.cone((r() - 0.5) * 1.4, 2.4 + r() * 0.3, (r() - 0.5) * 1, 0.14, 0.5, [S.coralPink, S.coralOrange, S.coralPurple][i % 3], 5)
  for (let i = 0; i < 4; i++) weedBlade(g, (r() - 0.5) * 2, 0, 1.2, 1 + r(), r)
  return g.build(2)
}

// ── Gates and coins ──────────────────────────────────────────────────────

/** One answer gate (a lane wide): two pillars with lotus tops and a lintel; the sign goes under the lintel. */
export function gateFrame(): BufferGeometry {
  const g = new Geo(rng(7))
  for (const x of [-1.12, 1.12]) {
    g.box(x, 0, 0, 0.46, 0.4, 0.6, E.stoneDark)
    g.cyl(x, 0.4, 0, 0.17, 0.21, 4.4, E.sandstone, 8)
    for (let i = 0; i < 3; i++) g.cyl(x, 0.9 + i * 0.7, 0, 0.22, 0.22, 0.1, E.blue, 8, { jitter: 0.02 })
    g.cone(x, 4.8, 0, 0.36, 0.45, E.green, 8, { rx: Math.PI })
    g.cyl(x, 4.8, 0, 0.36, 0.26, 0.1, E.gold, 8)
  }
  g.box(0, 4.9, 0, 2.9, 0.45, 0.7, E.sandstone)
  g.box(0, 5.35, 0, 3.1, 0.18, 0.8, E.gold)
  return g.build(2)
}

/** A gold shekel, standing on its edge (spun by the scene). */
export function coin(): BufferGeometry {
  const g = new Geo(rng(3))
  // `cyl` stands a part on y; y = −h/2 centres it before it is turned flat-side forward.
  g.cyl(0, -0.045, 0, 0.34, 0.34, 0.09, '#f2c443', 14, { rx: Math.PI / 2, jitter: 0 })
  g.cyl(0, -0.005, 0.05, 0.25, 0.25, 0.01, '#ffd96a', 14, { rx: Math.PI / 2, jitter: 0 })
  g.cyl(0, -0.005, -0.05, 0.25, 0.25, 0.01, '#ffd96a', 14, { rx: Math.PI / 2, jitter: 0 })
  return g.build(1)
}

/** A tile's length of brick kerb along the road edge (on the −x side; turned for +x). */
export function kerb(length: number): BufferGeometry {
  const g = new Geo(rng(5))
  const n = Math.round(length / 0.8)
  for (let i = 0; i < n; i++) g.box(0, 0, -length / 2 + (i + 0.5) * (length / n), 0.5, 0.28, length / n - 0.06, i % 2 ? E.brick : '#c58658')
  g.box(-0.5, 0, 0, 0.6, 0.12, length, E.stoneDark)
  return g.build(2)
}

// ── Pharaoh's chariots (Exodus 14:9) ─────────────────────────────────────

/**
 * A chariot and its pair of horses, facing −z (the horses ahead): a red and
 * gold car, the pole and yoke, plumed horses, a charioteer in a blue crown.
 * The wheels are `chariotWheel`, turned by the scene; they sit at
 * `CHARIOT_WHEELS`.
 */
export function chariot(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const red = '#b5461f'
  const coat = r() < 0.5 ? '#efe9df' : '#cdbfae'
  const mane = '#3b2a1e'
  const harness = '#b33b2a'
  // The car.
  g.box(0, 0.85, 1.2, 1.5, 0.12, 1.1, E.woodDark)
  g.box(0, 0.97, 0.68, 1.5, 0.85, 0.1, red)
  g.box(0, 1.6, 0.68, 1.56, 0.1, 0.16, E.gold)
  for (const x of [-0.74, 0.74]) {
    g.box(x, 0.97, 1.15, 0.08, 0.55, 1.0, red)
    g.box(x, 1.5, 1.15, 0.1, 0.08, 1.0, E.gold)
  }
  g.cyl(0, 0.62, 1.3, 0.07, 0.07, 1.9, E.woodDark, 6, { rz: Math.PI / 2 })
  // The charioteer: white kilt, bare arms, a blue crown.
  g.cone(0, 0.97, 1.2, 0.34, 0.7, E.linen, 8)
  g.box(0, 1.6, 1.2, 0.5, 0.6, 0.32, '#c98d5a')
  g.box(0, 1.85, 1.2, 0.56, 0.16, 0.36, E.gold)
  g.cyl(0, 2.2, 1.2, 0.2, 0.2, 0.32, '#c98d5a', 8)
  g.cone(0, 2.44, 1.2, 0.26, 0.5, '#2f5fae', 8)
  g.cyl(0, 2.44, 1.2, 0.27, 0.27, 0.06, E.gold, 8)
  for (const x of [-0.3, 0.3]) g.box(x, 1.65, 0.9, 0.12, 0.12, 0.6, '#c98d5a', { rx: 0.4 })
  // Pole and yoke.
  g.box(0, 0.95, -0.6, 0.12, 0.12, 2.6, E.woodDark)
  g.box(0, 1.75, -1.8, 1.4, 0.1, 0.12, E.gold)
  // Two horses side by side.
  for (const x of [-0.45, 0.45]) {
    g.box(x, 1.05, -1.6, 0.48, 0.62, 1.5, coat)
    g.box(x, 1.12, -1.6, 0.5, 0.18, 0.5, harness)
    // Neck rising forward, head angled down.
    g.box(x, 1.45, -2.35, 0.3, 0.75, 0.36, coat, { rx: -0.55 })
    g.box(x, 1.95, -2.7, 0.26, 0.3, 0.62, coat, { rx: 0.5 })
    g.box(x, 1.75, -2.25, 0.08, 0.6, 0.34, mane, { rx: -0.55 })
    g.cone(x - 0.07, 2.2, -2.5, 0.05, 0.14, coat, 4)
    g.cone(x + 0.07, 2.2, -2.5, 0.05, 0.14, coat, 4)
    // A plume of red and gold.
    g.cone(x, 2.25, -2.42, 0.1, 0.42, harness, 6)
    g.cyl(x, 2.24, -2.42, 0.08, 0.08, 0.06, E.gold, 6)
    // Legs mid-stride and a tail.
    for (const [dz, rx] of [
      [-2.15, 0.35],
      [-1.05, -0.3],
    ] as const)
      for (const dx of [-0.14, 0.14]) g.box(x + dx, 0, dz + (dx > 0 ? 0.08 : -0.08), 0.12, 1.0, 0.14, coat, { rx: dx > 0 ? rx : -rx })
    g.box(x, 0.85, -0.82, 0.1, 0.55, 0.12, mane, { rx: 0.5 })
  }
  return g.build(2)
}

/** Where a chariot's wheels turn (x, y, z of each hub). */
export const CHARIOT_WHEELS: readonly [number, number, number][] = [
  [-0.9, 0.62, 1.3],
  [0.9, 0.62, 1.3],
]

/** A six-spoked chariot wheel, its axle along x, centred on the hub. */
export function chariotWheel(): BufferGeometry {
  const g = new Geo(rng(9))
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.box(0, Math.sin(a) * 0.56 - 0.06, Math.cos(a) * 0.56, 0.1, 0.12, 0.32, E.woodDark, { rx: -a, jitter: 0.02 })
  }
  for (let i = 0; i < 3; i++) g.box(0, -0.55, 0, 0.06, 1.1, 0.06, E.wood, { rx: (i / 3) * Math.PI })
  g.cyl(0, -0.06, 0, 0.12, 0.12, 0.14, E.gold, 8, { rz: Math.PI / 2 })
  return g.build(1)
}

// ── The wilderness (Exodus 15–Numbers 21) ────────────────────────────────

/** The wilderness's paint box: red rock and sand, goat-hair tents, acacia wood. */
export const W = {
  rock: '#b8764a',
  rockDark: '#94583a',
  rockPale: '#d6a16e',
  goat: '#3a2c24',
  goatStripe: '#6a5240',
  acacia: '#6b4a2a',
  leaf: '#7f9a3e',
  leafDark: '#5f7a2e',
  linen: '#f4ecd8',
  bronze: '#b0753a',
  fire: '#ff9a2e',
}

/** A desert boulder in red sandstone (also the river's, in grey). */
export function desertBoulder(seed: number, colors: [string, string] = [W.rock, W.rockDark]): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  lump(g, 0, 1.2, 0, 1.3, 1.4, 1.3, colors[0], seed)
  lump(g, 0.5, 2.3, 0.2, 0.7, 0.5, 0.7, colors[1], seed + 1)
  lump(g, -0.7, 0.5, 0.6, 0.6, 0.5, 0.6, colors[1], seed + 2)
  return g.build(2)
}

/** Jump: a low row of stones across the lane. */
export function stoneRow(seed: number, colors: [string, string] = [W.rock, W.rockDark]): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  for (let i = 0; i < 4; i++) lump(g, -0.9 + i * 0.6, 0.32, (r() - 0.5) * 0.3, 0.42, 0.42 + r() * 0.2, 0.42, i % 2 ? colors[0] : colors[1], seed + i)
  return g.build(2)
}

/** Duck: a goat-hair awning stretched across the lane on two poles (underside at 1.5). */
export function awning(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  g.cyl(-1.15, 0, 0, 0.08, 0.1, 3, W.acacia, 6)
  g.cyl(1.15, 0, 0, 0.08, 0.1, 3, W.acacia, 6)
  for (let i = 0; i < 5; i++) g.box(-1.1 + i * 0.55, 1.55, 0, 0.55, 1.3, 0.05, i % 2 ? W.goatStripe : W.goat, { jitter: 0.03 })
  g.box(0, 2.85, 0, 2.6, 0.12, 0.12, W.acacia)
  return g.build(2)
}

/** A rocky outcrop, scenery. */
export function outcrop(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const n = 3 + Math.floor(r() * 3)
  for (let i = 0; i < n; i++) {
    const s = 0.8 + r() * 1.8
    lump(g, (r() - 0.5) * 4, s * 0.6, (r() - 0.5) * 4, s * 1.2, s * (0.8 + r() * 0.8), s, [W.rock, W.rockDark, W.rockPale][i % 3], seed + i)
  }
  return g.build(3)
}

/** An acacia: a leaning trunk forking into a flat, wide crown. */
export function acacia(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const h = 2.8 + r() * 1.2
  g.cyl(0, 0, 0, 0.14, 0.22, h, W.acacia, 6, { rz: (r() - 0.5) * 0.3 })
  for (const a of [0.6, -0.7, 2.4]) g.cyl(Math.cos(a) * 0.5, h - 0.4, Math.sin(a) * 0.5, 0.07, 0.1, 1.4, W.acacia, 5, { rz: Math.cos(a) * 0.7, rx: -Math.sin(a) * 0.7 })
  for (let i = 0; i < 4; i++) {
    const x = (r() - 0.5) * 2.6
    const z = (r() - 0.5) * 2.6
    g.add(new IcosahedronGeometry(1, 0), place(x, h + 0.5 + r() * 0.3, z).multiply(new Matrix4().makeScale(1.6 + r() * 0.6, 0.35, 1.4 + r() * 0.6)), i % 2 ? W.leaf : W.leafDark, 0.06)
  }
  return g.build(2)
}

/** A tent of the camp: black goat hair with a striped front, ropes and pegs, an open door. */
export function tent(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const w = 4 + r() * 1.5
  g.prism(0, 0, 0, w, 2.2, 3.4, W.goat, { ry: Math.PI / 2 })
  for (let i = 0; i < 3; i++) g.box(0, 0.5 + i * 0.55, 1.68, w * (0.85 - i * 0.22), 0.14, 0.05, W.goatStripe, { jitter: 0.02 })
  g.box(0, 0, 1.72, 0.9, 1.4, 0.04, '#1a120c')
  for (const x of [-w / 2 - 0.6, w / 2 + 0.6]) {
    g.cyl(x, 0, 1.2, 0.03, 0.03, 0.3, W.acacia, 4)
    g.box(x * 0.85, 0.9, 1.2, Math.abs(x) * 0.35, 0.03, 0.03, '#c9b07a', { rz: x > 0 ? 0.6 : -0.6 })
  }
  // Cushions or a pot at the door.
  if (r() < 0.6) g.cyl(0.9, 0, 2.2, 0.28, 0.2, 0.45, '#b5733f', 7)
  return g.build(2)
}

/** A cooking fire ringed with stones (its flames flicker in the scene's sparks). */
export function campfire(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    lump(g, Math.cos(a) * 0.6, 0.12, Math.sin(a) * 0.6, 0.18, 0.15, 0.18, W.rockDark, seed + i)
  }
  g.cone(0, 0, 0, 0.32, 0.8, W.fire, 6)
  g.cone(0.1, 0, 0.05, 0.18, 1.05, '#ffd257', 5)
  return g.build(2)
}

/** The Tabernacle (Exodus 26–27): a linen court on bronze-footed posts, the tent of meeting inside. */
export function tabernacle(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const W2 = 7
  const D2 = 14
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    for (const [x, z] of [
      [-W2, -D2 + t * 2 * D2],
      [W2, -D2 + t * 2 * D2],
      [-W2 + t * 2 * W2, -D2],
      [-W2 + t * 2 * W2, D2],
    ] as const) {
      g.cyl(x, 0, z, 0.07, 0.07, 2.4, '#d8c9a8', 5)
      g.cyl(x, 0, z, 0.12, 0.12, 0.2, W.bronze, 5)
    }
  }
  g.box(-W2, 0.2, 0, 0.05, 2.1, 2 * D2, W.linen, { jitter: 0.01 })
  g.box(W2, 0.2, 0, 0.05, 2.1, 2 * D2, W.linen, { jitter: 0.01 })
  g.box(0, 0.2, -D2, 2 * W2, 2.1, 0.05, W.linen, { jitter: 0.01 })
  // The gate screen: blue, purple and scarlet.
  g.box(-W2 * 0.55, 0.2, D2, W2 * 0.9, 2.1, 0.05, W.linen, { jitter: 0.01 })
  g.box(W2 * 0.55, 0.2, D2, W2 * 0.9, 2.1, 0.05, W.linen, { jitter: 0.01 })
  for (const [k, c] of [
    [-1, '#2f5fae'],
    [0, '#6b2a7a'],
    [1, '#b8302a'],
  ] as const)
    g.box(k * 0.9, 0.2, D2 + 0.05, 0.9, 2.1, 0.05, c, { jitter: 0.01 })
  // The tent: dark coverings over gold boards.
  g.box(0, 0, -6, 4, 4.4, 9, '#d9a63e')
  g.prism(0, 4.4, -6, 4.6, 1.2, 9.6, '#4a3a2e', { ry: Math.PI / 2 })
  g.box(0, 0, -1.4, 3.8, 4.2, 0.08, '#6b2a7a')
  // The bronze altar and the basin.
  g.box(0, 0, 6, 2.4, 1.3, 2.4, W.bronze)
  g.cyl(0, 0, 2.6, 0.7, 0.5, 0.8, W.bronze, 10)
  void r
  return g.build(3)
}

/** The bronze serpent on a pole (Numbers 21:9). */
export function bronzeSerpent(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  lump(g, 0, 0.3, 0, 0.8, 0.4, 0.8, W.rockDark, seed)
  g.cyl(0, 0.5, 0, 0.1, 0.12, 5.2, W.acacia, 6)
  g.box(0, 4.6, 0, 1.6, 0.12, 0.12, W.acacia)
  // The serpent winding up the pole and over the cross-piece.
  for (let i = 0; i < 14; i++) {
    const a = i * 0.9
    g.box(Math.cos(a) * 0.2, 2.2 + i * 0.2, Math.sin(a) * 0.2, 0.16, 0.16, 0.16, W.bronze, { jitter: 0.04 })
  }
  g.cone(0.75, 4.75, 0, 0.12, 0.3, W.bronze, 5, { rz: -Math.PI / 2 })
  return g.build(2)
}

// ── The Jordan (Joshua 3–4) ───────────────────────────────────────────────

export const J = {
  stone: '#8d8a80',
  stoneDark: '#6c6a62',
  willow: '#6f9a4a',
  willowDark: '#4f7a3a',
  ark: '#e2b23b',
  priest: '#efe6cf',
}

/** Duck: a fallen tree across the riverbed, resting on two rocks (underside at 1.5). */
export function fallenTrunk(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  lump(g, -1.2, 0.75, 0, 0.45, 0.8, 0.5, J.stone, seed)
  lump(g, 1.2, 0.75, 0, 0.45, 0.8, 0.5, J.stoneDark, seed + 1)
  g.cyl(0, 1.75, 0, 0.28, 0.32, 3.4, '#6b5038', 8, { rz: Math.PI / 2 })
  g.cyl(0.6, 1.95, 0.1, 0.06, 0.08, 0.7, '#6b5038', 5, { rz: -0.8 })
  return g.build(2)
}

/** A willow by the river. */
export function willow(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const h = 3 + r() * 1.5
  g.cyl(0, 0, 0, 0.2, 0.3, h, '#6b5038', 6)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    g.add(new IcosahedronGeometry(1, 0), place(Math.cos(a) * 1.1, h - 0.3 - r() * 0.8, Math.sin(a) * 1.1).multiply(new Matrix4().makeScale(0.8, 1.5, 0.8)), i % 2 ? J.willow : J.willowDark, 0.06)
  }
  return g.build(2)
}

/** Twelve stones heaped as a memorial (Joshua 4:9). */
export function memorial(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const rows = [5, 4, 2, 1]
  let n = 0
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + row
      const rad = (rows.length - row) * 0.28
      lump(g, Math.cos(a) * rad, 0.3 + row * 0.5, Math.sin(a) * rad, 0.35, 0.3, 0.35, n++ % 2 ? J.stone : J.stoneDark, seed + n)
    }
  })
  return g.build(2)
}

/** The ark of the covenant on its poles, carried by four priests in linen. */
export function arkBearers(seed: number): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  g.box(0, 1.65, 0, 1.1, 0.7, 0.7, J.ark)
  g.box(0, 2.35, 0, 1.2, 0.1, 0.8, '#f2c94e')
  for (const x of [-0.35, 0.35]) g.box(x, 2.45, 0, 0.3, 0.45, 0.25, '#f2c94e', { rz: x > 0 ? -0.3 : 0.3 })
  for (const z of [-0.3, 0.3]) g.box(0, 1.85, z, 3.2, 0.07, 0.07, J.ark)
  for (const x of [-1.3, 1.3])
    for (const z of [-0.3, 0.3]) {
      g.cone(x, 0, z, 0.3, 1.55, J.priest, 8)
      g.cyl(x, 1.55, z, 0.15, 0.15, 0.3, '#c98d5a', 8)
      g.cyl(x, 1.85, z, 0.17, 0.12, 0.14, J.priest, 8)
    }
  void r
  return g.build(2)
}

// ── Jericho (Joshua 6) ────────────────────────────────────────────────────

/** A tile's length of Jericho's wall (on the +x side, its face to −x): mud brick, a tower, houses on top, maybe Rahab's red cord. */
export function cityWall(seed: number, length: number, rahab: boolean): BufferGeometry {
  const r = rng(seed)
  const g = new Geo(r)
  const h = 8
  g.box(0, 0, 0, 2.4, h, length, E.brick, { jitter: 0.03 })
  g.box(-1.2, 0, 0, 0.3, 1.2, length, E.brickDark)
  // Merlons along the top.
  for (let z = -length / 2 + 0.6; z < length / 2; z += 1.3) g.box(-1, h, z, 0.45, 0.7, 0.7, E.brick)
  // A tower at the start of the stretch.
  g.box(0, 0, -length / 2 + 2, 3.6, h + 3, 3.6, '#c58658')
  for (let z = -1; z <= 1; z++) g.box(-1.9, h + 3, -length / 2 + 2 + z * 1.1, 0.5, 0.7, 0.6, '#c58658')
  g.box(-1.82, h, -length / 2 + 2, 0.06, 1.2, 0.5, E.door)
  // Houses built on the wall (Joshua 2:15).
  for (let i = 0; i < 2; i++) {
    const z = -length / 2 + 7 + i * 7 + r() * 2
    const w = 2.6 + r()
    g.box(0.3, h, z, 2.2, 2 + r(), w, r() < 0.5 ? E.plaster : '#e7cfa6')
    g.box(-0.82, h + 0.8, z, 0.06, 0.7, 0.6, E.door)
    if (rahab && i === 0) {
      // A scarlet cord hanging from the window (Joshua 2:18).
      g.box(-0.88, h - 2.6, z + 0.1, 0.05, 3.4, 0.08, '#d0202a', { jitter: 0 })
    }
  }
  return g.build(2)
}

// ── Power-ups ─────────────────────────────────────────────────────────────

/** The golden jar of manna (Exodus 16:33), its lid off, manna heaped in it; centred on its middle. */
export function mannaJar(): BufferGeometry {
  const g = new Geo(rng(61))
  g.cyl(0, -0.45, 0, 0.32, 0.22, 0.25, E.gold, 10)
  g.cyl(0, -0.2, 0, 0.26, 0.32, 0.45, '#f2c94e', 10)
  g.cyl(0, 0.25, 0, 0.3, 0.26, 0.12, E.gold, 10)
  g.add(new IcosahedronGeometry(0.26, 1), place(0, 0.36, 0).multiply(new Matrix4().makeScale(1, 0.5, 1)), '#fff6e0', 0.02)
  return g.build(1)
}

/** A small pillar of cloud: white puffs stacked; centred on its middle. */
export function cloudPillar(): BufferGeometry {
  const g = new Geo(rng(62))
  const puff = new IcosahedronGeometry(1, 1)
  for (const [x, y, z, s] of [
    [0, -0.4, 0, 0.36],
    [0.15, -0.05, 0.05, 0.3],
    [-0.12, 0.25, -0.05, 0.28],
    [0.05, 0.52, 0, 0.22],
  ] as const)
    g.add(puff, place(x, y, z).multiply(new Matrix4().makeScale(s, s, s)), '#ffffff', 0.04)
  puff.dispose()
  return g.build(1)
}

/** Moses' staff: a shepherd's crook of dark wood; centred on its middle. */
export function staff(): BufferGeometry {
  const g = new Geo(rng(63))
  g.cyl(0, -0.75, 0, 0.05, 0.06, 1.4, '#6b4a2a', 6)
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI
    g.box(Math.sin(a) * -0.16 + 0.16, 0.65 + Math.sin(a) * 0.16 + (1 - Math.cos(a)) * 0.02, 0, 0.09, 0.12, 0.09, '#6b4a2a', { rz: a })
  }
  return g.build(1)
}
