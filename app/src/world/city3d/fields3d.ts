import { Color, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three'
import { FIELD_IDS, type FieldId } from '@sixtysix/shared'
import { Geo } from './geo'
import { C } from './palette'
import { rng } from './space'

/**
 * The fields and the threshing floor round My Home in 3D: six beds outside
 * the fence, south of the yard either side of the lane, with the threshing
 * floor where the lane ends. Units are the yard's (plotSpace.ts). A bed is a
 * model per field level (pegged out, ploughed, terraced, irrigated); what
 * grows on it is two instanced meshes for all six beds (rows and ears).
 */

/** A bed's size: along x, along z. */
export const FIELD_W = 13
export const FIELD_D = 9

/** Each bed's centre, in unlock order: nearest the gate first, left before right. */
export const FIELD_3D: Record<FieldId, { x: number; z: number }> = {
  field1: { x: -13.5, z: 34 },
  field2: { x: 13.5, z: 34 },
  field3: { x: -28.5, z: 34 },
  field4: { x: 28.5, z: 34 },
  field5: { x: -13.5, z: 45.5 },
  field6: { x: 13.5, z: 45.5 },
}

/** The threshing floor, at the end of the lane between the far beds. */
export const THRESH_3D = { x: 0, z: 45.5 }
export const THRESH_R = 4.5

/** Is (x, z) on a bed or the floor (with `pad` round them)? Trees, bushes and grass keep off. */
export function onFarm(x: number, z: number, pad = 0): boolean {
  if (Math.hypot(x - THRESH_3D.x, z - THRESH_3D.z) < THRESH_R + pad) return true
  return FIELD_IDS.some((f) => Math.abs(x - FIELD_3D[f].x) < FIELD_W / 2 + pad && Math.abs(z - FIELD_3D[f].z) < FIELD_D / 2 + pad)
}

/** How high the soil lies at a field level (a terrace is raised behind its wall). */
export const bedTop = (level: number) => (level >= 2 ? 0.5 : 0.16)

const ROWS = 8
/** Ears along a row. */
const EARS = 22
const rowZ = (i: number) => -FIELD_D / 2 + 0.75 + (i * (FIELD_D - 1.5)) / (ROWS - 1)

const cache = new Map<number, BufferGeometry>()
/** A bed at a field level: 0 pegged out in the scrub, 1 ploughed, 2 behind a terrace wall, 3 with a water channel and a cistern. */
export function fieldBedGeometry(level: number): BufferGeometry {
  const lv = Math.max(0, Math.min(3, level))
  let geo = cache.get(lv)
  if (geo) return geo
  const g = new Geo(rng(120 + lv))
  const w = FIELD_W
  const d = FIELD_D
  if (lv === 0) {
    // Not bought or not cleared yet: pegs, a string, stones lying about.
    const corners: [number, number][] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
    corners.forEach(([x, z], i) => {
      g.box(x, 0, z, 0.14, 0.9, 0.14, C.wood, { jitter: 0 })
      const [bx, bz] = corners[(i + 1) % 4]
      g.box((x + bx) / 2, 0.7, (z + bz) / 2, Math.hypot(bx - x, bz - z), 0.03, 0.03, C.cream, { ry: -Math.atan2(bz - z, bx - x), jitter: 0 })
    })
    for (let i = 0; i < 9; i++) g.box(Math.sin(i * 2.3) * 4.8, 0, Math.cos(i * 1.7) * 3.2, 0.5 + (i % 3) * 0.2, 0.3, 0.45, C.limeDark, { ry: i })
  } else {
    const top = bedTop(lv)
    g.box(0, 0, 0, w, top, d, '#7d5132', { jitter: 0.02 })
    // Furrows: a ridge of turned earth along each row.
    for (let i = 0; i < ROWS; i++) g.box(0, top, rowZ(i), w - 0.9, 0.09, 0.55, i % 2 ? '#94633f' : '#8a5a38', { jitter: 0.05 })
    if (lv >= 2) {
      // The terrace wall, stone by stone, a little higher than the soil.
      const stones = (ax: number, az: number, bx: number, bz: number) => {
        const len = Math.hypot(bx - ax, bz - az)
        const n = Math.round(len / 1.1)
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n
          g.box(ax + (bx - ax) * t, 0, az + (bz - az) * t, len / n + 0.03, top + 0.1 + ((i * 7) % 3) * 0.05, 0.5, i % 3 ? C.lime : C.limeLight, { ry: -Math.atan2(bz - az, bx - ax), jitter: 0.08 })
        }
      }
      const hw = w / 2 + 0.2
      const hd = d / 2 + 0.2
      stones(-hw, -hd, hw, -hd)
      stones(hw, -hd, hw, hd)
      stones(hw, hd, -hw, hd)
      stones(-hw, hd, -hw, -hd)
    }
    if (lv >= 3) {
      // Water: a channel along the back and down the middle, a small cistern at the corner.
      g.box(0, top + 0.02, -d / 2 + 0.3, w - 0.6, 0.08, 0.34, C.water, { jitter: 0 })
      g.box(0, top + 0.02, 0, 0.34, 0.08, d - 0.9, C.water, { jitter: 0 })
      g.cyl(-w / 2 - 0.9, 0, -d / 2 - 0.2, 0.75, 0.85, 0.8, C.limeDark, 9)
      g.cyl(-w / 2 - 0.9, 0.78, -d / 2 - 0.2, 0.6, 0.6, 0.05, C.water, 9, { jitter: 0 })
    }
  }
  geo = g.build(3, { ao: { ground: () => 0 } })
  cache.set(lv, geo)
  return geo
}

/** A raiders' camp by a field (Judg 6): two goat-hair tents, spears stuck in the ground, a banner. */
export function raidersGeometry(): BufferGeometry {
  const g = new Geo(rng(141))
  g.prism(-1.1, 0, 0, 2.4, 1.5, 2.0, C.goatHair, { ry: 0.3 })
  g.prism(1.4, 0, 0.5, 2.0, 1.25, 1.7, '#4a3a30', { ry: -0.5 })
  for (const [x, z, r] of [[0.2, 1.4, 0.1], [0.5, 1.5, -0.12], [-2.6, 0.9, 0.08]]) {
    g.box(x, 0, z, 0.06, 2.3, 0.06, C.woodDark, { rz: r, jitter: 0 })
    g.cone(x - Math.sin(r) * 1.1, 2.25, z, 0.09, 0.3, '#b9b4ac', 4, { rz: r, jitter: 0 })
  }
  g.box(2.7, 0, -0.4, 0.07, 2.6, 0.07, C.woodDark, { jitter: 0 })
  g.box(3.12, 1.8, -0.4, 0.8, 0.7, 0.04, '#7a1f1f', { jitter: 0.03 })
  for (let i = 0; i < 5; i++) g.box(Math.sin(i * 1.26) * 0.4 - 0.2, 0, 2.2 + Math.cos(i * 1.26) * 0.4, 0.22, 0.14, 0.2, C.limeDark, { ry: i })
  g.cone(-0.2, 0.02, 2.2, 0.2, 0.34, '#f08a2a', 5, { jitter: 0 })
  return g.build(3, { ao: { ground: () => 0 } })
}

/** One ear: a few thin stalks fanning out, 1 unit tall (scaled and coloured per crop). */
export function earGeometry(): BufferGeometry {
  const g = new Geo(rng(131))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    g.cone(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, 0.07, 1, '#ffffff', 3, { rz: Math.cos(a) * 0.28, rx: Math.sin(a) * 0.28, jitter: 0.12 })
  }
  return g.build(3)
}

/** One row of a crop: a unit box (scaled to the row). */
export function rowGeometry(): BufferGeometry {
  const g = new Geo(rng(133))
  g.box(0, 0, 0, 1, 1, 1, '#ffffff', { jitter: 0 })
  return g.build(3)
}

/** What a bed shows: nothing sown, shoots, or the ripe crop. */
export type BedCrop = '' | 'shoots' | 'barley' | 'wheat'

const LOOK: Record<Exclude<BedCrop, ''>, { row: string; ear: string; h: number; rowH: number }> = {
  shoots: { row: '#6f9a3c', ear: '#8fbf4a', h: 0.55, rowH: 0.12 },
  barley: { row: '#b8902f', ear: '#f0d060', h: 1.15, rowH: 0.3 },
  wheat: { row: '#b57f26', ear: '#f2b23c', h: 1.5, rowH: 0.4 },
}

/** The instances for everything growing: per bed its rows (boxes) and ears (stalks), in the crop's colours. */
export function placeCrops(beds: { level: number; crop: BedCrop }[]): { rows: { m: Matrix4[]; c: Color[] }; ears: { m: Matrix4[]; c: Color[] } } {
  const rand = rng(137)
  const out = { rows: { m: [] as Matrix4[], c: [] as Color[] }, ears: { m: [] as Matrix4[], c: [] as Color[] } }
  const up = new Vector3(0, 1, 0)
  const q = new Quaternion()
  beds.forEach((bed, k) => {
    if (!bed.crop || bed.level < 1) return
    const look = LOOK[bed.crop]
    const { x, z } = FIELD_3D[FIELD_IDS[k]]
    const y = bedTop(bed.level) + 0.06
    const row = new Color(look.row)
    const ear = new Color(look.ear)
    for (let i = 0; i < ROWS; i++) {
      const rz = z + rowZ(i)
      const shade = 0.9 + rand() * 0.2
      out.rows.m.push(new Matrix4().compose(new Vector3(x, y, rz), q.identity(), new Vector3(FIELD_W - 1.1, look.rowH, 0.62)))
      out.rows.c.push(row.clone().multiplyScalar(shade))
      const n = EARS
      for (let j = 0; j < n; j++) {
        const ex = x - (FIELD_W - 1.6) / 2 + ((j + rand() * 0.6) / n) * (FIELD_W - 1.6)
        const s = look.h * (0.8 + rand() * 0.4)
        out.ears.m.push(new Matrix4().compose(new Vector3(ex, y + look.rowH * 0.5, rz + (rand() - 0.5) * 0.2), q.setFromAxisAngle(up, rand() * 6.3), new Vector3(1.7, s, 1.7)))
        out.ears.c.push(ear.clone().multiplyScalar(0.85 + rand() * 0.3))
      }
    }
  })
  return out
}

/** The most instances `placeCrops` can return (every bed sown). */
export const MAX_ROWS = FIELD_IDS.length * ROWS
export const MAX_EARS = MAX_ROWS * EARS
