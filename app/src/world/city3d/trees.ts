import { BufferGeometry, Color, Matrix4, Quaternion, Vector3 } from 'three'
import { Geo } from './geo'
import { C } from './palette'
import { landmarkRects, OPEN_LOTS, PLAZA, rectDist, wallRects, type Rect } from './plan'
import { GROUND, HALF, heightAt, rng, wallSpace } from './space'
import { streetClearance } from './streets'

/**
 * Olive trees and cypresses, instanced: cypresses along the inside of the
 * wall, olives and cypresses on the rim outside it, olive groves on the
 * terraces beyond the city and a few between the outer houses. Their crowns
 * never reach over a lot's yard (every lot may get a house), a street, the
 * Temple Mount plaza, the wall or a landmark (the layout check tests it).
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
  /** Matrices, colours and each crown's radius (units). */
  olive: { matrices: Matrix4[]; colors: Color[]; radius: number[] }
  cypress: { matrices: Matrix4[]; colors: Color[]; radius: number[] }
}

/** Crown radius per unit of a tree's scale. */
const CROWN = { olive: 1.95, cypress: 1.05 }

export function placeTrees(): TreeSet {
  const rand = rng(77)
  // Lots in a coarse grid for quick "is this on a lot" checks.
  const cell = 10
  const grid = new Map<string, Rect[]>()
  for (const { r } of OPEN_LOTS) {
    const k = `${Math.floor(r.x / cell)},${Math.floor(r.z / cell)}`
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k)!.push(r)
  }
  const nearLot = (x: number, z: number, d: number) => {
    const cx = Math.floor(x / cell)
    const cz = Math.floor(z / cell)
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const l of grid.get(`${cx + i},${cz + j}`) ?? []) if (rectDist(l, x, z) < d) return true
    return false
  }
  const built = [...landmarkRects().map((l) => l.r), PLAZA]
  const walls = wallRects().map((w) => w.r)
  const ok = (x: number, z: number, crown: number) => {
    if (Math.abs(x) > GROUND / 2 - 4 || Math.abs(z) > GROUND / 2 - 4) return false
    if (nearLot(x, z, crown + 0.15)) return false
    if (built.some((r) => rectDist(r, x, z) < crown + 1)) return false
    if (walls.some((r) => Math.abs(r.x - x) < 12 && Math.abs(r.z - z) < 12 && rectDist(r, x, z) < crown + 0.3)) return false
    if (streetClearance(x, z) < crown * 0.6 + 0.3) return false
    return true
  }
  const out: TreeSet = { olive: { matrices: [], colors: [], radius: [] }, cypress: { matrices: [], colors: [], radius: [] } }
  /** Plants a tree if it fits there. */
  const add = (kind: 'olive' | 'cypress', x: number, z: number, s: number) => {
    if (!ok(x, z, CROWN[kind] * s)) return
    const m = new Matrix4().compose(new Vector3(x, heightAt(x, z), z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rand() * Math.PI * 2), new Vector3(s, s * (0.85 + rand() * 0.3), s))
    out[kind].matrices.push(m)
    out[kind].radius.push(CROWN[kind] * s)
    const k = 0.88 + rand() * 0.22
    out[kind].colors.push(new Color(k, k * (0.97 + rand() * 0.06), k * (0.9 + rand() * 0.1)))
  }
  // Along the wall, inside and out.
  for (let i = 0; i < 900; i++) {
    const x = (rand() * 2 - 1) * HALF
    const z = (rand() * 2 - 1) * HALF
    const { e } = wallSpace(x, z)
    const s = 0.75 + rand() * 0.35
    if (e > 0.935 && e < 0.975) add('cypress', x, z, s)
    else if (e > 1.035 && e < 1.11) add(rand() < 0.7 ? 'olive' : 'cypress', x, z, s)
  }
  // Groves on the terraces beyond the painted square, in loose rows.
  for (let i = 0; i < 1500; i++) {
    const x = (rand() * 2 - 1) * (GROUND / 2)
    const z = (rand() * 2 - 1) * (GROUND / 2)
    if (Math.abs(x) < HALF - 2 && Math.abs(z) < HALF - 2) continue
    if (rand() < 0.35) continue
    add(rand() < 0.88 ? 'olive' : 'cypress', x, z, 0.8 + rand() * 0.5)
  }
  // A few between the outer houses.
  for (let i = 0; i < 1400; i++) {
    const x = (rand() * 2 - 1) * HALF
    const z = (rand() * 2 - 1) * HALF
    if (wallSpace(x, z).e < 1.15) continue
    add(rand() < 0.8 ? 'olive' : 'cypress', x, z, 0.65 + rand() * 0.3)
  }
  return out
}
