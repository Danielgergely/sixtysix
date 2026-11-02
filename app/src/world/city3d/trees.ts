import { BufferGeometry, Color, Matrix4, Quaternion, Vector3 } from 'three'
import { LINKS, ROADS } from '../cityTownsfolk'
import { WORLD } from '../cityLayout'
import type { LandmarkSpot } from './buildings'
import { Geo } from './geo'
import { C } from './palette'
import { GROUND, HALF, heightAt, inPolygon, LOT_CENTRES, MOUNT_PTS, rng, ux, uz, wallSpace } from './space'

/**
 * Olive trees and cypresses, instanced: cypresses along the inside of the
 * wall, olives and cypresses on the rim outside it, olive groves on the
 * terraces beyond the city and a few between the outer houses. Never on a
 * lot (every lot may get a house), a road, the Temple Mount or a landmark.
 */

export function oliveGeometry(): BufferGeometry {
  const g = new Geo(rng(21))
  g.cyl(0, -0.5, 0, 0.22, 0.34, 2.2, C.trunk, 4)
  g.cyl(0.2, 1.5, 0.1, 1.5, 1.7, 1.3, C.olive, 6)
  g.cone(0.1, 2.8, 0, 1.4, 1.0, C.olive, 6)
  return g.build(3)
}

export function cypressGeometry(): BufferGeometry {
  const g = new Geo(rng(23))
  g.cyl(0, -0.5, 0, 0.18, 0.22, 1.4, C.trunk, 4)
  g.cone(0, 0.6, 0, 1.0, 6.2, C.cypress, 6)
  g.cone(0, 2.4, 0, 0.75, 5.4, '#4a6834', 6)
  return g.build(3)
}

export interface TreeSet {
  olive: { matrices: Matrix4[]; colors: Color[] }
  cypress: { matrices: Matrix4[]; colors: Color[] }
}

/** Distance from (x, z) to the nearest road (units). */
function roadDist(x: number, z: number, segs: [number, number, number, number][]): number {
  let best = Infinity
  for (const [ax, az, bx, bz] of segs) {
    const dx = bx - ax
    const dz = bz - az
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t))
  }
  return best
}

export function placeTrees(landmarks: LandmarkSpot[]): TreeSet {
  const rand = rng(77)
  const segs = LINKS.map(([a, b]) => [ux((ROADS[a][0] / 100) * WORLD), uz((ROADS[a][1] / 100) * WORLD), ux((ROADS[b][0] / 100) * WORLD), uz((ROADS[b][1] / 100) * WORLD)] as [number, number, number, number])
  // Lots in a coarse grid for quick "is this on a lot" checks.
  const cell = 10
  const grid = new Map<string, [number, number][]>()
  for (const p of LOT_CENTRES) {
    const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k)!.push(p)
  }
  const nearLot = (x: number, z: number, r: number) => {
    const cx = Math.floor(x / cell)
    const cz = Math.floor(z / cell)
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) for (const [px, pz] of grid.get(`${cx + i},${cz + j}`) ?? []) if (Math.abs(px - x) < r && Math.abs(pz - z) < r) return true
    return false
  }
  const ok = (x: number, z: number, lotGap = 4.4, roadGap = 2.6) => {
    if (Math.abs(x) > GROUND / 2 - 4 || Math.abs(z) > GROUND / 2 - 4) return false
    if (inPolygon(x, z, MOUNT_PTS, 3)) return false
    if (nearLot(x, z, lotGap)) return false
    if (landmarks.some((l) => Math.hypot(x - l.x, z - l.z) < Math.max(l.hw, l.hd) + 3)) return false
    if (roadDist(x, z, segs) < roadGap) return false
    return true
  }
  const out: TreeSet = { olive: { matrices: [], colors: [] }, cypress: { matrices: [], colors: [] } }
  const add = (kind: 'olive' | 'cypress', x: number, z: number, s: number) => {
    const m = new Matrix4().compose(new Vector3(x, heightAt(x, z), z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rand() * Math.PI * 2), new Vector3(s, s * (0.85 + rand() * 0.3), s))
    out[kind].matrices.push(m)
    const k = 0.88 + rand() * 0.22
    out[kind].colors.push(new Color(k, k * (0.97 + rand() * 0.06), k * (0.9 + rand() * 0.1)))
  }
  // Along the wall, inside and out.
  for (let i = 0; i < 900; i++) {
    const x = (rand() * 2 - 1) * HALF
    const z = (rand() * 2 - 1) * HALF
    const { e } = wallSpace(x, z)
    if (e > 0.935 && e < 0.975 && ok(x, z, 4.2)) add('cypress', x, z, 0.75 + rand() * 0.35)
    else if (e > 1.035 && e < 1.11 && ok(x, z, 4.2)) add(rand() < 0.7 ? 'olive' : 'cypress', x, z, 0.8 + rand() * 0.4)
  }
  // Groves on the terraces beyond the painted square, in loose rows.
  for (let i = 0; i < 1500; i++) {
    const x = (rand() * 2 - 1) * (GROUND / 2)
    const z = (rand() * 2 - 1) * (GROUND / 2)
    if (Math.abs(x) < HALF - 2 && Math.abs(z) < HALF - 2) continue
    if (rand() < 0.35 || !ok(x, z)) continue
    add(rand() < 0.88 ? 'olive' : 'cypress', x, z, 0.8 + rand() * 0.5)
  }
  // A few between the outer houses.
  for (let i = 0; i < 1400; i++) {
    const x = (rand() * 2 - 1) * HALF
    const z = (rand() * 2 - 1) * HALF
    if (wallSpace(x, z).e < 1.15 || !ok(x, z, 4.9, 2.4)) continue
    add(rand() < 0.8 ? 'olive' : 'cypress', x, z, 0.65 + rand() * 0.3)
  }
  return out
}
