import { CanvasTexture, Color, Matrix4, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3, type BufferGeometry, type Texture } from 'three'
import { graph, type Pt } from '../life/nav'
import { YARD_EDGES, type YardLayout, type YardNode } from '../yard'
import { Geo } from './geo'
import { onFarm, FIELD_3D, FIELD_D, FIELD_W, THRESH_3D, THRESH_R } from './fields3d'
import { blob, GATE_HALF, PROP, type PropId, type Spot } from './models'
import { FIELD_IDS } from '@sixtysix/shared'
import { rng } from './space'
import { releaseAfterUpload } from './textures'

/**
 * My Home in 3D: where everything stands. Units are the city's (a person is
 * ~2.2 tall), x east, z south, y up; the camera starts south of the yard
 * looking north, so the house is at the back, the gate at the front corner.
 *
 * The yard is a square turned 45° (a diamond, corners north, east, south,
 * west) with half-diagonal R; the fence runs along its edges, the gate fills
 * a gap at the south corner. The yard's people walk the same path graph as
 * in the painting (yard.ts YARD_EDGES), laid out here round the 3D spots.
 */

export const R = 31

/** Each spot's centre and turn (radians about y; 0 = front to the south, towards the camera). */
export const SPOT_3D: Record<Spot, { x: number; z: number; ry: number }> = {
  house: { x: 0, z: -15, ry: 0 },
  store: { x: 12.5, z: -6.5, ry: -0.6 },
  grove: { x: 16, z: 8.5, ry: -0.5 },
  well: { x: 5.5, z: 6.5, ry: 0 },
  bake: { x: -5, z: 1, ry: 0 },
  fold: { x: -15, z: 6.5, ry: 0.4 },
  workshop: { x: -9, z: 17, ry: 0.5 },
  kiln: { x: 8.5, z: 17.5, ry: -0.5 },
  // The Stable, inside the west corner, its open front to the yard.
  stable: { x: -20.5, z: -2.5, ry: 1.28 },
  wall: { x: 0, z: R - GATE_HALF, ry: 0 },
}

/** Walkers' world px per unit (the sim and the 2D yard think in px). */
export const PX = 20
const u = (x: number, z: number): Pt => ({ x: x * PX, y: z * PX })

/** The path graph's nodes in units: a stop in front of each building's door, the crossing in front of the house, the open earth between. */
const NODES: Record<YardNode, [number, number]> = {
  hd: [0.6, -10.2],
  x: [1, -5],
  n1: [-7, -8.5],
  n0: [-13, -11],
  e1: [6, -3],
  st: [10.5, -3.6],
  e2: [10.5, 2],
  e3: [12.8, 11],
  wl: [4, 9.6],
  c1: [-0.5, 4.5],
  ct: [-3.5, 4],
  s1: [-6, 9],
  t1: [-9.5, 3.5],
  s2: [-11, 11.5],
  fd: [-13, 10.5],
  s3: [-16.5, 11.5],
  w1: [-4, 13],
  ws: [-6.5, 20],
  y1: [0, 14],
  kl: [6.5, 20.5],
  g: [0, 25],
  f1: [9, 13],
  sb: [-16.8, -1.4],
}

const area = (x: number, z: number, rx: number, rz: number) => ({ x: x * PX, y: z * PX, rx: rx * PX, ry: rz * PX })

/** The yard's layout for its people and animals (walker px: units × `PX`). */
export const YARD_3D: YardLayout = {
  graph: graph(Object.fromEntries(Object.entries(NODES).map(([k, [x, z]]) => [k, u(x, z)])), YARD_EDGES),
  spots: { camel: u(-19.5, 9.5), carpenter: u(-4.4, 19.6), brickmaker: u(4.4, 19.4), watchman: u(-25.5, 2.2) },
  areas: { front: area(0, 19.5, 2.6, 2.2), house: area(5, -8, 2.5, 1.2), cat: area(-1.8, -9.8, 2, 0.6) },
  P: 6.4,
}

/** Figure px → units (an adult, 44.8 px, stands 2.24). */
export const FIG_UNITS = 1 / PX

// ── The fence line ──

type P2 = [number, number]
const GX = GATE_HALF
/** Back half (behind the house) and the two front sides either side of the gate. */
export const FENCE_PATHS: P2[][] = [
  [[-R, 0], [0, -R], [R, 0]],
  [[R, 0], [GX, R - GX]],
  [[-GX, R - GX], [-R, 0]],
]
export const FENCE_CORNERS: P2[] = [[-R, 0], [0, -R], [R, 0], [GX, R - GX], [-GX, R - GX]]
/** The watchtower (wall level 5) on the west corner, turned with the fence. */
export const TOWER: [number, number, number] = [-R + 2.3, 0, Math.PI / 4]

// ── Ground ──

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** The ground's size (units) and its height: flat in and round the yard, rising into low hills beyond. */
export const GROUND = 220
export function groundAt(x: number, z: number): number {
  // The valley south of the gate (the fields) stays flat much further out than the other sides.
  const r = Math.hypot(x, z > 0 ? z * 0.55 : z)
  const hills = smooth(R + 10, R + 55, r)
  return hills * (7 + 3 * Math.sin(x * 0.07 + 1) * Math.cos(z * 0.06)) + hills * 1.2 * Math.sin(x * 0.21 - z * 0.17)
}

export function groundGeometry(): BufferGeometry {
  const g = new PlaneGeometry(GROUND, GROUND, 96, 96)
  g.rotateX(-Math.PI / 2)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) p.setY(i, groundAt(p.getX(i), p.getZ(i)))
  g.computeVertexNormals()
  return g
}

type RGB = [number, number, number]
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
// The yard's colours: terracotta earth, lush grass going gold further out.
const GRASS = hex('#8ea443')
const LUSH = hex('#6c8a32')
const DRY = hex('#b8ad5a')
const EARTH = hex('#d6904f')
const EARTH_LIGHT = hex('#e8b273')
const EARTH_DARK = hex('#b4622f')
const LANE = hex('#dcc08a')
const noise = (x: number, z: number) => 0.5 + 0.25 * Math.sin(x * 0.19 + Math.sin(z * 0.11) * 2) * Math.cos(z * 0.16 - 1.7) + 0.25 * Math.sin((x + z) * 0.09 + Math.cos(x * 0.07) * 1.5)

/** The two flagstone paths that cross in front of the house (stops of the path graph), and the lane out of the gate. */
const STONE_PATHS: YardNode[][] = [
  ['hd', 'x', 'c1', 'y1', 'g'],
  ['n1', 'x', 'e1', 'st'],
]

/**
 * The ground painting: terracotta earth in the
 * diamond with a darker rim where it meets the grass, worn paths, two
 * flagstone paths crossing in front of the house on a pale dusty bed, the
 * lane out of the gate, pebbles; outside, grass painted blade by blade with a
 * few flowers, drying to gold on the hills. Painted once at load.
 */
export function groundTexture(size = 1024): Texture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const unit = size / GROUND
  const toPx = (v: number) => (v + GROUND / 2) * unit
  const rand = rng(91)

  // 1. Grass and earth per cell, smoothed up.
  const N = 220
  const small = document.createElement('canvas')
  small.width = small.height = N
  const sg = small.getContext('2d')!
  const img = sg.createImageData(N, N)
  const step = GROUND / N
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -GROUND / 2 + (i + 0.5) * step
      const z = -GROUND / 2 + (j + 0.5) * step
      const n = noise(x, z)
      let col = mix(mix(GRASS, LUSH, n), DRY, smooth(R + 14, R + 50, Math.hypot(x, z)) * 0.75)
      // The yard: earth in broad light and dark washes, darker towards the rim.
      const d = Math.abs(x) + Math.abs(z)
      const wash = noise(z * 1.3 + 7, x * 1.1 - 3)
      let earth = mix(mix(EARTH, EARTH_LIGHT, smooth(0.45, 0.8, wash)), EARTH_DARK, smooth(0.5, 0.15, wash) * 0.55)
      earth = mix(earth, EARTH_DARK, smooth(R - 4, R - 0.6, d) * 0.6)
      col = mix(col, earth, 1 - smooth(R - 0.6, R + 0.3, d))
      // The lane from the gate out to the south.
      const lane = z > R - 3 && z < THRESH_3D.z ? 1 - smooth(2.2, 3.6, Math.abs(x)) : 0
      col = mix(col, LANE, lane * 0.9)
      // Trodden earth round the beds and the threshing floor, and the paths from the lane to the beds.
      let worn = 1 - smooth(THRESH_R + 0.5, THRESH_R + 3, Math.hypot(x - THRESH_3D.x, z - THRESH_3D.z))
      for (const f of FIELD_IDS) {
        const p = FIELD_3D[f]
        const dx = Math.abs(x - p.x) - FIELD_W / 2
        const dz = Math.abs(z - p.z) - FIELD_D / 2
        worn = Math.max(worn, 1 - smooth(0.4, 2.2, Math.max(dx, dz)))
        if (Math.abs(z - p.z) < 1.1 && Math.abs(x) < Math.abs(p.x)) worn = Math.max(worn, 0.8)
      }
      col = mix(col, mix(LANE, EARTH, 0.35), worn * 0.8)
      const k = (j * N + i) * 4
      img.data[k] = col[0]
      img.data[k + 1] = col[1]
      img.data[k + 2] = col[2]
      img.data[k + 3] = 255
    }
  }
  sg.putImageData(img, 0, 0)
  g.imageSmoothingEnabled = true
  g.drawImage(small, 0, 0, size, size)

  // 2. Brushwork on the earth: soft strokes of lighter and darker paint.
  for (let i = 0; i < 900; i++) {
    const x = (rand() * 2 - 1) * R
    const z = (rand() * 2 - 1) * R
    if (Math.abs(x) + Math.abs(z) > R - 1.2) continue
    const light = rand() < 0.5
    g.fillStyle = light ? `rgba(240,180,110,${0.12 + rand() * 0.15})` : `rgba(150,70,30,${0.08 + rand() * 0.12})`
    g.beginPath()
    g.ellipse(toPx(x), toPx(z), (0.8 + rand() * 2.4) * unit, (0.3 + rand() * 0.7) * unit, -0.4 + rand() * 0.8, 0, Math.PI * 2)
    g.fill()
  }

  // 3. The rim: an inked edge where the earth meets the grass.
  g.lineJoin = 'round'
  g.strokeStyle = 'rgba(95,45,20,0.55)'
  g.lineWidth = Math.max(1.5, 0.28 * unit)
  g.beginPath()
  const RIM = R - 0.15
  const corners: [number, number][] = [[0, -RIM], [RIM, 0], [0, RIM], [-RIM, 0], [0, -RIM]]
  corners.forEach(([x, z], i) => {
    const wob = i ? (rand() - 0.5) * 0.4 : 0
    if (i === 0) g.moveTo(toPx(x), toPx(z))
    else g.lineTo(toPx(x + wob), toPx(z + wob))
  })
  g.stroke()

  // 4. Worn paths between the stops.
  g.lineCap = 'round'
  g.strokeStyle = 'rgba(240,196,132,0.5)'
  g.lineWidth = 1.8 * unit
  for (const [a, b] of YARD_EDGES) {
    g.beginPath()
    g.moveTo(toPx(NODES[a][0]), toPx(NODES[a][1]))
    g.lineTo(toPx(NODES[b][0]), toPx(NODES[b][1]))
    g.stroke()
  }

  // 5. The flagstone paths: a pale dusty bed, then the stones with dark grout.
  const route = (pts: YardNode[]) => {
    g.beginPath()
    pts.forEach((k, i) => (i ? g.lineTo : g.moveTo).call(g, toPx(NODES[k][0]), toPx(NODES[k][1])))
    g.stroke()
  }
  g.strokeStyle = 'rgba(214,196,150,0.95)'
  g.lineWidth = 2.9 * unit
  STONE_PATHS.forEach(route)
  for (const pts of STONE_PATHS) {
    for (let s = 0; s + 1 < pts.length; s++) {
      const [ax, az] = NODES[pts[s]]
      const [bx, bz] = NODES[pts[s + 1]]
      const len = Math.hypot(bx - ax, bz - az)
      const n = Math.ceil(len / 0.8)
      const ang = Math.atan2(bz - az, bx - ax)
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n
        for (const side of [-0.62, 0.62]) {
          const ox = -Math.sin(ang) * side + (rand() - 0.5) * 0.18
          const oz = Math.cos(ang) * side + (rand() - 0.5) * 0.18
          const l = 222 + Math.floor(rand() * 26)
          g.save()
          g.translate(toPx(ax + (bx - ax) * t + ox), toPx(az + (bz - az) * t + oz))
          g.rotate(ang + (rand() - 0.5) * 0.35)
          g.fillStyle = `rgb(${l},${l - 8},${l - 30})`
          g.strokeStyle = 'rgba(120,95,60,0.6)'
          g.lineWidth = Math.max(1, unit * 0.07)
          const w = (0.66 + rand() * 0.14) * unit
          const h = (0.52 + rand() * 0.14) * unit
          g.beginPath()
          g.roundRect(-w / 2, -h / 2, w, h, unit * 0.12)
          g.fill()
          g.stroke()
          g.restore()
        }
      }
    }
  }

  // 6. Pebbles on the earth: pale stones with a shadow under them.
  for (let i = 0; i < 260; i++) {
    const x = (rand() * 2 - 1) * R
    const z = (rand() * 2 - 1) * R
    if (Math.abs(x) + Math.abs(z) > R - 1) continue
    const r = (0.12 + rand() * 0.22) * unit
    g.fillStyle = 'rgba(110,55,25,0.35)'
    g.beginPath()
    g.ellipse(toPx(x) + r * 0.25, toPx(z) + r * 0.35, r, r * 0.7, 0, 0, Math.PI * 2)
    g.fill()
    const l = 200 + Math.floor(rand() * 40)
    g.fillStyle = `rgb(${l},${l - 10},${l - 25})`
    g.beginPath()
    g.ellipse(toPx(x), toPx(z), r, r * 0.7, 0, 0, Math.PI * 2)
    g.fill()
  }

  // 7. Grass, blade by blade: short strokes leaning "up" the painting (north, away from the camera), greener near the yard.
  const blades = Math.round(size * size * 0.016)
  g.lineCap = 'round'
  for (let i = 0; i < blades; i++) {
    const a = rand() * Math.PI * 2
    const r = R + rand() * 85
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (Math.abs(x) + Math.abs(z) < R + 0.15) continue
    if (z > R - 3 && z < THRESH_3D.z && Math.abs(x) < 3) continue
    if (onFarm(x, z, 1.6)) continue
    const far = smooth(R + 12, R + 50, r)
    const t = rand()
    const col = mix(t < 0.4 ? LUSH : t < 0.8 ? GRASS : hex('#c8c070'), DRY, far * rand())
    const shade = rand() < 0.35 ? 0.72 : 1.05
    g.strokeStyle = `rgba(${col[0] * shade | 0},${col[1] * shade | 0},${col[2] * shade | 0},0.85)`
    g.lineWidth = Math.max(1, unit * 0.09)
    const len = (0.35 + rand() * 0.6) * unit
    const lean = (rand() - 0.5) * 0.9
    g.beginPath()
    g.moveTo(toPx(x), toPx(z))
    g.lineTo(toPx(x) + Math.sin(lean) * len, toPx(z) - Math.cos(lean) * len)
    g.stroke()
  }
  // A few flowers in the grass.
  const FLOWERS = ['#fff6dc', '#f3d34a', '#e0583a', '#c9a3e0']
  for (let i = 0; i < 380; i++) {
    const a = rand() * Math.PI * 2
    const r = R + 1 + rand() * 30
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (Math.abs(x) + Math.abs(z) < R + 1 || onFarm(x, z, 1)) continue
    g.fillStyle = FLOWERS[Math.floor(rand() * FLOWERS.length)]
    g.beginPath()
    g.arc(toPx(x), toPx(z), Math.max(1, unit * 0.11), 0, Math.PI * 2)
    g.fill()
  }

  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return releaseAfterUpload(t)
}

/** Olive trees and cypresses round the homestead (outside the fence, off the lane). */
export function placeYardTrees(): { olive: { m: Matrix4[]; c: Color[] }; cypress: { m: Matrix4[]; c: Color[] } } {
  const rand = rng(57)
  const out = { olive: { m: [] as Matrix4[], c: [] as Color[] }, cypress: { m: [] as Matrix4[], c: [] as Color[] } }
  const up = new Vector3(0, 1, 0)
  const spots: [number, number][] = []
  let tries = 0
  while (spots.length < 110 && tries++ < 5000) {
    const a = rand() * Math.PI * 2
    const r = R + 5 + rand() * 75
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (Math.abs(x) + Math.abs(z) < R + 4) continue
    if (z > R - 4 && Math.abs(x) < 6) continue
    if (onFarm(x, z, 3.5)) continue
    if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 4.5)) continue
    spots.push([x, z])
  }
  spots.forEach(([x, z], i) => {
    const cypress = i % 5 === 0
    const s = cypress ? 0.8 + rand() * 0.4 : 0.85 + rand() * 0.5
    const set = cypress ? out.cypress : out.olive
    set.m.push(new Matrix4().compose(new Vector3(x, groundAt(x, z), z), new Quaternion().setFromAxisAngle(up, rand() * 6.3), new Vector3(s, s, s)))
    // Greener than the city's dusty olives.
    const k = 0.9 + rand() * 0.2
    set.c.push(cypress ? new Color(k, k, k) : new Color(k * 0.8, k * 1.05, k * 0.62))
  })
  return out
}

/** A tuft of long grass: a fan of thin blades. */
export function grassTuftGeometry(): BufferGeometry {
  const g = new Geo(rng(31))
  const cols = ['#6c8a32', '#8ea443', '#a8ad55', '#7c9a3a']
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    g.cone(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18, 0.09, 0.9 + (i % 3) * 0.35, cols[i % 4], 3, { rz: Math.cos(a) * 0.45, rx: Math.sin(a) * 0.45 })
  }
  g.cone(0, 0, 0, 0.12, 1.4, '#c2b866', 3)
  return g.build(3)
}

/** A round bush of three leafy lumps. */
export function bushGeometry(): BufferGeometry {
  const g = new Geo(rng(33))
  blob(g, 0, 0.55, 0, 1.15, 0.85, 1.0, '#5f7f2e')
  blob(g, 0.7, 0.45, 0.35, 0.8, 0.65, 0.75, '#759a38')
  blob(g, -0.6, 0.4, 0.4, 0.75, 0.6, 0.7, '#6a8c34')
  return g.build(3)
}

/** Long grass and bushes outside the fence (and a little grass hugging its inside), off the lane, as in the painting. */
export function placeYardGreens(): { tufts: { m: Matrix4[]; c: Color[] }; bushes: { m: Matrix4[]; c: Color[] } } {
  const rand = rng(61)
  const up = new Vector3(0, 1, 0)
  const out = { tufts: { m: [] as Matrix4[], c: [] as Color[] }, bushes: { m: [] as Matrix4[], c: [] as Color[] } }
  const onLane = (x: number, z: number, w: number) => z > R - 5 && Math.abs(x) < w
  const put = (set: { m: Matrix4[]; c: Color[] }, x: number, z: number, s: number, k: number) => {
    set.m.push(new Matrix4().compose(new Vector3(x, groundAt(x, z) - 0.05, z), new Quaternion().setFromAxisAngle(up, rand() * 6.3), new Vector3(s, s * (0.8 + rand() * 0.5), s)))
    set.c.push(new Color(k, k, k * (0.9 + rand() * 0.15)))
  }
  for (let tries = 0; out.tufts.m.length < 340 && tries < 6000; tries++) {
    const x = (rand() * 2 - 1) * (R + 26)
    const z = (rand() * 2 - 1) * (R + 26)
    const d = Math.abs(x) + Math.abs(z)
    // Mostly in a band just outside the fence, thinning out; a few just inside it.
    const inside = d > R - 2.2 && d < R - 0.9
    if (!inside && (d < R + 0.8 || rand() > 1.15 - (d - R) / 26)) continue
    if (onLane(x, z, 4.5) || onFarm(x, z, 1.2)) continue
    put(out.tufts, x, z, 0.8 + rand() * 0.7, 0.85 + rand() * 0.3)
  }
  const bushes: [number, number][] = []
  for (let tries = 0; bushes.length < 34 && tries < 3000; tries++) {
    const x = (rand() * 2 - 1) * (R + 22)
    const z = (rand() * 2 - 1) * (R + 22)
    const d = Math.abs(x) + Math.abs(z)
    if (d < R + 2.5 || d > R + 22 || onLane(x, z, 6) || onFarm(x, z, 2.5)) continue
    if (bushes.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 3.5)) continue
    bushes.push([x, z])
    put(out.bushes, x, z, 0.8 + rand() * 0.7, 0.85 + rand() * 0.3)
  }
  return out
}

// ── Camera (units; polar = tilt away from straight down). The yard always stays framed. ──

export const PLOT_MIN_DIST = 14
export const PLOT_START_POLAR = 0.92
/** Half the width and half the (foreshortened) depth the first view shows (units), and the most it may ever show. */
const START_HALF: [number, number] = [25, 19]
const MAX_HALF: [number, number] = [44, 36]
export const PLOT_FOV = 42
const tanHalf = Math.tan(((PLOT_FOV / 2) * Math.PI) / 180)
const fit = ([w, h]: [number, number], aspect: number) => Math.max(w / (tanHalf * Math.min(1.8, aspect)), h / tanHalf)

/** The start distance for a canvas of this aspect: the yard's middle fills the view. */
export function plotStartDist(aspect: number): number {
  return Math.min(90, Math.max(40, fit(START_HALF, aspect)))
}
/** The farthest out: the whole yard and a little round it. */
export const plotMaxDist = (aspect: number) => Math.max(plotStartDist(aspect) * 1.1, fit(MAX_HALF, aspect))

/** Names show up to a little beyond the start view ; further out only the ribbons. */
export const NAMES_AT = 1.12

/**
 * Weeds for an idle stage (shared/src/city.ts): none, 20 tufts at 20 days,
 * 46 bigger, yellowing ones at 40 (and when the home is for sale), spread over
 * the open yard off the buildings, the same tufts and tints as the city's lots.
 */
export function placeYardWeeds(stage: number): { m: Matrix4[]; c: Color[] } {
  const n = stage <= 0 ? 0 : stage === 1 ? 20 : 46
  const rand = rng(83)
  const out = { m: [] as Matrix4[], c: [] as Color[] }
  const up = new Vector3(0, 1, 0)
  const spots = Object.values(SPOT_3D)
  let tries = 0
  while (out.m.length < n && tries++ < 4000) {
    const x = (rand() * 2 - 1) * (R - 2)
    const z = (rand() * 2 - 1) * (R - 2)
    if (Math.abs(x) + Math.abs(z) > R - 2) continue
    if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 4.6) || YARD_PROPS.some((p) => Math.hypot(p.x - x, p.z - z) < 2.4)) continue
    const s = 1 + rand() * 0.6 + (stage >= 2 ? 0.45 : 0)
    out.m.push(new Matrix4().compose(new Vector3(x, 0.05, z), new Quaternion().setFromAxisAngle(up, rand() * 6.3), new Vector3(s, s, s)))
    out.c.push(stage >= 2 ? new Color(1.12, 1.0, 0.62) : new Color(1, 1, 1))
  }
  return out
}

// ── Things standing about the yard (models.ts PROP), more of them as the house grows ──

/** Where each thing stands (units, turn), and the house level it comes with. Clear of the spots and the paths. */
export const YARD_PROPS: { prop: PropId; x: number; z: number; ry?: number; house: number }[] = [
  { prop: 'fire', x: -3.2, z: 10.5, house: 1 },
  { prop: 'garden', x: -9.5, z: -15.8, ry: -0.785, house: 2 },
  { prop: 'washing', x: 7.8, z: -13.2, ry: 1.2, house: 2 },
  { prop: 'tree', x: -2.5, z: -25, house: 2 },
  { prop: 'bench', x: 22, z: -1, ry: -1.2, house: 3 },
  { prop: 'jars', x: -4.2, z: 25, ry: 0.4, house: 3 },
  { prop: 'tree', x: 4, z: -24, ry: 2, house: 3 },
  { prop: 'cart', x: 4.4, z: 24, ry: 0.9, house: 4 },
  { prop: 'dovecote', x: 9.5, z: -17, house: 4 },
  { prop: 'flowers', x: -2.6, z: -9.9, house: 5 },
  { prop: 'flowers', x: 3.4, z: -9.9, ry: 1, house: 5 },
  { prop: 'bench', x: -21, z: 6.5, ry: 1.9, house: 6 },
]

const propCache = new Map<number, BufferGeometry>()
/** Everything standing about the yard at a house level, as one geometry (one draw call). */
export function yardPropsGeometry(house: number): BufferGeometry {
  let geo = propCache.get(house)
  if (geo) return geo
  const g = new Geo(rng(97))
  const q = new Quaternion()
  const up = new Vector3(0, 1, 0)
  for (const p of YARD_PROPS) {
    if (p.house > house) continue
    g.frame = new Matrix4().compose(new Vector3(p.x, 0, p.z), q.setFromAxisAngle(up, p.ry ?? 0), new Vector3(1, 1, 1))
    PROP[p.prop](g)
  }
  geo = g.build(3, { ao: { ground: () => 0 } })
  propCache.set(house, geo)
  return geo
}
