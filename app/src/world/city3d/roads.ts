import type { Geo } from './geo'
import { C } from './palette'
import { ellipseE, PLATFORM, PLAZA, PLAZA_OUT, type Rect } from './plan'
import { heightAt } from './space'
import { STREETS, type StreetSeg } from './streets'

/**
 * The paving: the plaza round the Temple Mount, the main roads with kerb
 * stones, and the narrower streets and alleys between the houses. Every
 * surface is draped over the hills a hand's breadth above the ground (each
 * kind at its own height, so crossings don't flicker) and merged into the
 * city's stone geometry, whose ashlar texture reads as paving slabs.
 */

const LIFT = { plaza: 0.16, main: 0.13, street: 0.09, alley: 0.07 }
const KERB = { w: 0.34, h: 0.26 }
const PAVE = {
  plaza: '#ead8b0',
  main: '#dcc59a',
  mainOut: '#cfb98e',
  street: '#cdb284',
  alley: '#c4a879',
  kerb: C.limeDark,
}

/** Two triangles over four corners (x, y, z), wound so the face looks along `want`. */
function face(g: Geo, v: [number, number, number][], want: [number, number, number], color: string) {
  const [a, b, c] = v
  const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])]
  const o = n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]
  g.tris(o.flatMap((i) => v[i]), color, 0.03)
}

/** A quad on the ground: corners (x, z) in order round it, each `lift` above the hill. */
function quad(g: Geo, p: [number, number][], lift: number, color: string) {
  face(g, p.map(([x, z]) => [x, heightAt(x, z) + lift, z] as [number, number, number]), [0, 1, 0], color)
}

/** A strip along a → b, `half` either side of the line offset by `off`, cut every `step` so it follows the ground. */
function strip(g: Geo, s: { a: [number, number]; b: [number, number] }, off: number, half: number, lift: number, color: (x: number, z: number) => string, step = 1.5, skip?: (x: number, z: number) => boolean) {
  const [ax, az] = s.a
  const [bx, bz] = s.b
  const len = Math.hypot(bx - ax, bz - az)
  if (len < 0.01) return
  const dx = (bx - ax) / len
  const dz = (bz - az) / len
  // Left normal.
  const nx = -dz
  const nz = dx
  const n = Math.max(1, Math.ceil(len / step))
  for (let i = 0; i < n; i++) {
    const t0 = (len * i) / n
    const t1 = (len * (i + 1)) / n
    const mx = ax + dx * (t0 + t1) / 2 + nx * off
    const mz = az + dz * (t0 + t1) / 2 + nz * off
    if (skip?.(mx, mz)) continue
    const P = (t: number, o: number): [number, number] => [ax + dx * t + nx * (off + o), az + dz * t + nz * (off + o)]
    quad(g, [P(t0, -half), P(t1, -half), P(t1, half), P(t0, half)], lift, color(mx, mz))
  }
}

/** Kerb stones along a line: a raised strip with its outer face. */
function kerb(g: Geo, s: StreetSeg | { a: [number, number]; b: [number, number] }, off: number, lift: number, skip: (x: number, z: number) => boolean) {
  strip(g, s, off, KERB.w / 2, lift + KERB.h, () => PAVE.kerb, 1.2, skip)
  // The face towards the road's edge (seen from the outside), down to the ground.
  const [ax, az] = s.a
  const [bx, bz] = s.b
  const len = Math.hypot(bx - ax, bz - az)
  const dx = (bx - ax) / len
  const dz = (bz - az) / len
  const side = Math.sign(off) || 1
  const o = off + (side * KERB.w) / 2
  const n = Math.max(1, Math.ceil(len / 1.2))
  for (let i = 0; i < n; i++) {
    const t0 = (len * i) / n
    const t1 = (len * (i + 1)) / n
    const p0: [number, number] = [ax + dx * t0 - dz * o, az + dz * t0 + dx * o]
    const p1: [number, number] = [ax + dx * t1 - dz * o, az + dz * t1 + dx * o]
    if (skip((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)) continue
    const h0 = heightAt(...p0)
    const h1 = heightAt(...p1)
    const top = lift + KERB.h
    face(g, [[p0[0], h0 - 0.1, p0[1]], [p1[0], h1 - 0.1, p1[1]], [p1[0], h1 + top, p1[1]], [p0[0], h0 + top, p0[1]]], [-dz * side, 0, dx * side], PAVE.kerb)
  }
}

/** Where a main road, a street or an alley meets the plaza or another road: the kerb opens there. */
function opening(x: number, z: number, w: number): boolean {
  for (const [jx, jz] of STREETS.junctions) if (Math.hypot(jx - x, jz - z) < w) return true
  return false
}

/** Inside a rectangle (axis-aligned). */
const inside = (r: Rect, x: number, z: number, by = 0) => Math.abs(x - r.x) < r.hw + by && Math.abs(z - r.z) < r.hd + by

/** Adds every paved surface to the city's stone geometry. */
export function buildStreets(stone: Geo) {
  // The plaza: a band from the foot of the platform out to PLAZA, in tiles that follow the hill.
  const T = 1.6
  for (let x = PLAZA.x - PLAZA.hw; x < PLAZA.x + PLAZA.hw - 1e-6; x += T) {
    for (let z = PLAZA.z - PLAZA.hd; z < PLAZA.z + PLAZA.hd - 1e-6; z += T) {
      const x1 = Math.min(x + T, PLAZA.x + PLAZA.hw)
      const z1 = Math.min(z + T, PLAZA.z + PLAZA.hd)
      // Under the platform nothing shows.
      if (inside(PLATFORM, (x + x1) / 2, (z + z1) / 2, -0.8)) continue
      quad(stone, [[x, z], [x1, z], [x1, z1], [x, z1]], LIFT.plaza, PAVE.plaza)
    }
  }
  // Its kerb, open where the roads and streets come in.
  const pc: [number, number][] = [
    [PLAZA.x - PLAZA.hw, PLAZA.z - PLAZA.hd],
    [PLAZA.x + PLAZA.hw, PLAZA.z - PLAZA.hd],
    [PLAZA.x + PLAZA.hw, PLAZA.z + PLAZA.hd],
    [PLAZA.x - PLAZA.hw, PLAZA.z + PLAZA.hd],
  ]
  const onRoad = (x: number, z: number) =>
    STREETS.segs.some((s) => {
      if (s.kind === 'stair' || s.kind === 'mount') return false
      const [ax, az] = s.a
      const [bx, bz] = s.b
      const dx = bx - ax
      const dz = bz - az
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
      return Math.hypot(x - ax - dx * t, z - az - dz * t) < s.w / 2 + 0.3
    })
  for (let i = 0; i < 4; i++) {
    // The plaza lies to the left of each side, so a negative offset is outside it.
    kerb(stone, { a: pc[i], b: pc[(i + 1) % 4] }, -KERB.w / 2, LIFT.plaza, onRoad)
  }

  for (const s of STREETS.segs) {
    if (s.kind === 'stair' || s.kind === 'mount') continue
    const lift = LIFT[s.kind]
    // Main roads start at the plaza's edge (the plaza is paved already).
    let seg = s
    if (s.kind === 'main') {
      const [ax, az] = s.a
      const [bx, bz] = s.b
      const inA = inside(PLAZA, ax, az, 0.01)
      const inB = inside(PLAZA, bx, bz, 0.01)
      if (inA && inB) continue
      if (inA) {
        const len = Math.hypot(bx - ax, bz - az)
        const back = PLAZA_OUT - 5.5
        seg = { ...s, a: [ax + ((bx - ax) / len) * back, az + ((bz - az) / len) * back] }
      }
      const colour = (x: number, z: number) => (ellipseE(x, z) > 1.04 ? PAVE.mainOut : PAVE.main)
      strip(stone, seg, 0, s.w / 2, lift, colour, 1)
      const skip = (x: number, z: number) => opening(x, z, 1.9) || inside(PLAZA, x, z, 0.2)
      kerb(stone, seg, s.w / 2 + KERB.w / 2, lift, skip)
      kerb(stone, seg, -(s.w / 2 + KERB.w / 2), lift, skip)
    } else {
      strip(stone, seg, 0, s.w / 2, lift, () => (s.kind === 'street' ? PAVE.street : PAVE.alley), 1.6)
    }
  }
}
