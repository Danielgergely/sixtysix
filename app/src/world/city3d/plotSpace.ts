import { CanvasTexture, Color, Matrix4, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3, type BufferGeometry, type Texture } from 'three'
import { graph, type Pt } from '../life/nav'
import { YARD_EDGES, type YardLayout, type YardNode } from '../yard'
import { GATE_HALF, type Spot } from './models'
import { rng } from './space'

/**
 * My Home in 3D: where everything stands. Units are the city's (a person is
 * ~2.2 tall), x east, z south, y up; the camera starts south of the yard
 * looking north, so the view is the painted yard's (PlotScene): the house at
 * the back, the gate at the front corner.
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
  courtyard: { x: -5, z: 1, ry: 0 },
  fold: { x: -15, z: 6.5, ry: 0.4 },
  workshop: { x: -9, z: 17, ry: 0.5 },
  kiln: { x: 8.5, z: 17.5, ry: -0.5 },
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
}

const area = (x: number, z: number, rx: number, rz: number) => ({ x: x * PX, y: z * PX, rx: rx * PX, ry: rz * PX })

/** The 3D yard's layout for PlotLife's people and animals (heights in the painting's px, so P is the same). */
export const YARD_3D: YardLayout = {
  graph: graph(Object.fromEntries(Object.entries(NODES).map(([k, [x, z]]) => [k, u(x, z)])), YARD_EDGES),
  spots: { camel: u(-19.5, 9.5), carpenter: u(-4.4, 19.6), brickmaker: u(4.4, 19.4), watchman: u(-25.5, 2.2) },
  areas: { front: area(0, 19.5, 2.6, 2.2), house: area(5, -8, 2.5, 1.2), cat: area(-1.8, -9.8, 2, 0.6) },
  P: 6.4,
}

/** Figure px → units (an adult, 44.8 px in the painting, stands 2.24). */
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
export const GROUND = 170
export function groundAt(x: number, z: number): number {
  const r = Math.hypot(x, z)
  const hills = smooth(R + 10, R + 55, r)
  return hills * (7 + 3 * Math.sin(x * 0.07 + 1) * Math.cos(z * 0.06)) + hills * 1.2 * Math.sin(x * 0.21 - z * 0.17)
}

export function groundGeometry(): BufferGeometry {
  const g = new PlaneGeometry(GROUND, GROUND, 72, 72)
  g.rotateX(-Math.PI / 2)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) p.setY(i, groundAt(p.getX(i), p.getZ(i)))
  g.computeVertexNormals()
  return g
}

type RGB = [number, number, number]
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const GRASS = hex('#9aa356')
const LUSH = hex('#7f9446')
const DRY = hex('#b9a868')
const EARTH = hex('#d3b17a')
const DUST = hex('#e2c58f')
const noise = (x: number, z: number) => 0.5 + 0.25 * Math.sin(x * 0.19 + Math.sin(z * 0.11) * 2) * Math.cos(z * 0.16 - 1.7) + 0.25 * Math.sin((x + z) * 0.09 + Math.cos(x * 0.07) * 1.5)

/** The ground painting: grass round the yard, the yard's earth in its diamond, the worn paths, two stone paths crossing in front of the house, the lane out of the gate. */
export function groundTexture(size = 1024): Texture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const unit = size / GROUND
  const toPx = (v: number) => (v + GROUND / 2) * unit
  const rand = rng(91)

  // 1. Grass and earth per cell, smoothed up.
  const N = 200
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
      let col = mix(mix(GRASS, LUSH, n), DRY, smooth(R + 20, R + 60, Math.hypot(x, z)) * 0.6)
      // The yard: earth inside the diamond, fading into the grass just outside the fence.
      const d = Math.abs(x) + Math.abs(z)
      const yard = 1 - smooth(R - 1.5, R + 1.5, d)
      col = mix(col, mix(EARTH, DUST, noise(z * 1.7, x * 1.3)), yard)
      // The lane from the gate out to the south.
      const lane = z > R - 3 ? 1 - smooth(2.2, 3.6, Math.abs(x + Math.sin(z * 0.08) * 1.5)) : 0
      col = mix(col, DUST, lane * 0.85)
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

  // 2. Worn paths between the stops.
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = 'rgba(236, 214, 168, 0.55)'
  g.lineWidth = 1.7 * unit
  for (const [a, b] of YARD_EDGES) {
    g.beginPath()
    g.moveTo(toPx(NODES[a][0]), toPx(NODES[a][1]))
    g.lineTo(toPx(NODES[b][0]), toPx(NODES[b][1]))
    g.stroke()
  }

  // 3. The two stone paths that cross in front of the house: flags along each.
  const flags = (pts: YardNode[]) => {
    for (let s = 0; s + 1 < pts.length; s++) {
      const [ax, az] = NODES[pts[s]]
      const [bx, bz] = NODES[pts[s + 1]]
      const len = Math.hypot(bx - ax, bz - az)
      const n = Math.ceil(len / 0.75)
      const ang = Math.atan2(bz - az, bx - ax)
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n
        for (const side of [-0.55, 0.55]) {
          const ox = -Math.sin(ang) * side + (rand() - 0.5) * 0.15
          const oz = Math.cos(ang) * side + (rand() - 0.5) * 0.15
          const l = 205 + Math.floor(rand() * 30)
          g.save()
          g.translate(toPx(ax + (bx - ax) * t + ox), toPx(az + (bz - az) * t + oz))
          g.rotate(ang + (rand() - 0.5) * 0.3)
          g.fillStyle = `rgb(${l},${l - 12},${l - 34})`
          g.strokeStyle = 'rgba(110,80,50,0.45)'
          g.lineWidth = Math.max(1, unit * 0.06)
          const w = (0.62 + rand() * 0.12) * unit
          const h = (0.5 + rand() * 0.12) * unit
          g.beginPath()
          g.rect(-w / 2, -h / 2, w, h)
          g.fill()
          g.stroke()
          g.restore()
        }
      }
    }
  }
  flags(['hd', 'x', 'c1', 'y1', 'g'])
  flags(['n1', 'x', 'e1', 'st'])

  // 4. Pebbles and tufts.
  for (let i = 0; i < 1400; i++) {
    const x = (rand() - 0.5) * GROUND
    const z = (rand() - 0.5) * GROUND
    const inYard = Math.abs(x) + Math.abs(z) < R - 1
    g.fillStyle = inYard ? `rgba(120,90,55,${0.15 + rand() * 0.2})` : `rgba(70,90,35,${0.15 + rand() * 0.25})`
    g.beginPath()
    g.ellipse(toPx(x), toPx(z), (0.1 + rand() * 0.25) * unit, (0.08 + rand() * 0.15) * unit, rand() * 3, 0, Math.PI * 2)
    g.fill()
  }

  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Olive trees and cypresses round the homestead (outside the fence, off the lane). */
export function placeYardTrees(): { olive: { m: Matrix4[]; c: Color[] }; cypress: { m: Matrix4[]; c: Color[] } } {
  const rand = rng(57)
  const out = { olive: { m: [] as Matrix4[], c: [] as Color[] }, cypress: { m: [] as Matrix4[], c: [] as Color[] } }
  const up = new Vector3(0, 1, 0)
  const spots: [number, number][] = []
  let tries = 0
  while (spots.length < 70 && tries++ < 3000) {
    const a = rand() * Math.PI * 2
    const r = R + 5 + rand() * 45
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (Math.abs(x) + Math.abs(z) < R + 4) continue
    if (z > R - 4 && Math.abs(x) < 6) continue
    if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 4.5)) continue
    spots.push([x, z])
  }
  spots.forEach(([x, z], i) => {
    const cypress = i % 5 === 0
    const s = cypress ? 0.8 + rand() * 0.4 : 0.85 + rand() * 0.5
    const set = cypress ? out.cypress : out.olive
    set.m.push(new Matrix4().compose(new Vector3(x, groundAt(x, z), z), new Quaternion().setFromAxisAngle(up, rand() * 6.3), new Vector3(s, s, s)))
    const k = 0.9 + rand() * 0.2
    set.c.push(new Color(k, k, k))
  })
  return out
}

// ── Camera (units; polar = tilt away from straight down). The yard always stays framed. ──

export const PLOT_MIN_DIST = 14
export const PLOT_START_POLAR = 0.92
/** Half the width and half the (foreshortened) depth the first view shows (units), and the most it may ever show. */
const START_HALF: [number, number] = [21, 16]
const MAX_HALF: [number, number] = [34, 25]
export const PLOT_FOV = 42
const tanHalf = Math.tan(((PLOT_FOV / 2) * Math.PI) / 180)
const fit = ([w, h]: [number, number], aspect: number) => Math.max(w / (tanHalf * Math.min(1.8, aspect)), h / tanHalf)

/** The start distance for a canvas of this aspect: the yard's middle fills the view. */
export function plotStartDist(aspect: number): number {
  return Math.min(80, Math.max(40, fit(START_HALF, aspect)))
}
/** The farthest out: the whole yard and a little round it. */
export const plotMaxDist = (aspect: number) => Math.max(plotStartDist(aspect) * 1.1, fit(MAX_HALF, aspect))
