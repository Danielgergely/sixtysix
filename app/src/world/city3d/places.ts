import type { HuntPlace } from '@sixtysix/shared'
import { ANTONIA, GATES, GATE_W, PEN, PLATFORM, TOWER_AT, TOWER_SIZE, WALL_H, onWall, tAt, wallDir } from './plan'
import { MOUNT_TOP, heightAt } from './space'

/**
 * The scroll hunt's places that are not landmarks of the map (shared/src/hunt.ts):
 * Solomon's Porch, the Antonia, the sheep pen, the three plain gates and the
 * wall's towers. Each is a box to tap (CityScene ray-tests them with the
 * landmarks) and, except the towers, a name tag shown close up. Three-free:
 * everything comes from the plan.
 */
export interface PlaceSpot {
  id: HuntPlace
  x: number
  z: number
  /** Ground under it and the height of its name tag. */
  y: number
  top: number
  /** Tap box: half width/depth, rotation. */
  hw: number
  hd: number
  ry: number
  /** A name tag stands over it (not over every tower). */
  tag: boolean
}

/** The main roads' gates by name: north, south and west (the east one is the Sheep Gate, a landmark). */
const GATE_PLACE: Record<string, HuntPlace> = { N: 'fishGate', S: 'fountainGate', W: 'valleyGate' }

export function placeSpots(): PlaceSpot[] {
  const out: PlaceSpot[] = []
  // Solomon's Porch: the double colonnade along the platform's east side (buildings.ts, edge 1).
  out.push({ id: 'porch', x: PLATFORM.x + PLATFORM.hw - 2, z: PLATFORM.z, y: MOUNT_TOP, top: MOUNT_TOP + 4.6, hw: 2.2, hd: PLATFORM.hd - 1, ry: 0, tag: true })
  // The Antonia in the north-west corner (local ±7.8 × ±6.8, its tallest tower 15 high, before scaling).
  const k = ANTONIA.scale
  out.push({ id: 'antonia', x: ANTONIA.x, z: ANTONIA.z, y: MOUNT_TOP, top: MOUNT_TOP + 15 * k + 0.6, hw: 7.8 * k, hd: 6.8 * k, ry: 0, tag: true })
  const penY = heightAt(PEN.x, PEN.z)
  out.push({ id: 'pen', x: PEN.x, z: PEN.z, y: penY, top: penY + 2.6, hw: PEN.rx, hd: PEN.rz, ry: 0, tag: true })
  for (const g of GATES) {
    const id = GATE_PLACE[g.id]
    if (!id) continue
    const y = heightAt(g.x, g.z)
    out.push({ id, x: g.x, z: g.z, y, top: y + 11, hw: GATE_W / 2 + 5.2, hd: 3.6, ry: wallDir(g.t).ry, tag: true })
  }
  for (const s of TOWER_AT) {
    const t = tAt(s)
    const [x, z] = onWall(t)
    const { nx, nz, ry } = wallDir(t)
    const y = heightAt(x, z)
    out.push({ id: 'towers', x: x + nx * 0.8, z: z + nz * 0.8, y, top: y + WALL_H + 4.6, hw: TOWER_SIZE / 2 + 0.3, hd: TOWER_SIZE / 2 + 0.3, ry, tag: false })
  }
  return out
}
