import { ANTONIA, ellipseE, LANDMARK_RECTS, PLATFORM, rectDist, SANCTUARY, W_CX, W_CZ, W_RX, W_RZ, WALL_H, type Rect } from './plan'
import { heightAt, MOUNT_TOP } from './space'

/**
 * Where the camera can look at a spot without the Temple Mount, a landmark
 * or the wall in the way: the tall things of the plan as boxes, a line of
 * sight sampled against them, and a search over headings and tilts.
 */

interface Tall {
  r: Rect
  top: number
}

const k = SANCTUARY.scale
const TALL: Tall[] = [
  // The platform with its porticoes, the sanctuary's porch, Antonia's towers.
  { r: PLATFORM, top: MOUNT_TOP + 7 },
  { r: { x: SANCTUARY.x, z: SANCTUARY.z, hw: 18.5 * k, hd: 12.5 * k, ry: 0 }, top: MOUNT_TOP + 19 * k },
  { r: { x: ANTONIA.x, z: ANTONIA.z, hw: 7.8 * ANTONIA.scale, hd: 6.8 * ANTONIA.scale, ry: 0 }, top: MOUNT_TOP + 15 * ANTONIA.scale },
  { r: LANDMARK_RECTS.governor, top: heightAt(LANDMARK_RECTS.governor.x, LANDMARK_RECTS.governor.z) + 12.5 },
  { r: LANDMARK_RECTS.pool, top: heightAt(LANDMARK_RECTS.pool.x, LANDMARK_RECTS.pool.z) + 4.5 },
]

/** Is the line from (x, y, z) to the camera at azimuth/polar (camera-controls' sense) and `dist` clear? */
function clear(x: number, y: number, z: number, dist: number, az: number, polar: number): boolean {
  const dx = Math.sin(polar) * Math.sin(az)
  const dy = Math.cos(polar)
  const dz = Math.sin(polar) * Math.cos(az)
  for (let i = 1; i <= 48; i++) {
    const t = (i / 48) * dist
    const px = x + dx * t
    const py = y + dy * t
    const pz = z + dz * t
    for (const b of TALL) if (py < b.top && rectDist(b.r, px, pz) === 0) return false
    // The wall and its towers.
    const e = ellipseE(px, pz)
    if (e > 0.97 && e < 1.04 && py < heightAt(px, pz) + 9.5) return false
  }
  return true
}

/**
 * A heading and tilt from which the spot (x, z) can be seen at `dist`: the
 * current one if it is clear, else the nearest turn (in eighths) that is,
 * looking a little more from above if need be.
 */
export function clearView(x: number, z: number, dist: number, az: number, polar: number): [number, number] {
  const y = heightAt(x, z) + 1.5
  for (const p of [polar, Math.min(polar, 0.75), Math.min(polar, 0.45)]) {
    for (const turn of [0, 1, -1, 2, -2, 3, -3, 4]) {
      const a = az + (turn * Math.PI) / 4
      if (clear(x, y, z, dist, a, p)) return [a, p]
    }
  }
  return [az, 0.2]
}

/**
 * Is the city wall between the eye and a point? The wall is the ellipse of
 * the plan, as high as its merlons; the line of sight is cut with it (in the
 * ellipse's own space, where it is a circle) and hidden where it passes
 * below the top. For the name tags, which are HTML and would otherwise show
 * through the wall from a low camera outside it.
 */
export function wallHides(ex: number, ey: number, ez: number, x: number, y: number, z: number): boolean {
  const ax = (ex - W_CX) / W_RX
  const az = (ez - W_CZ) / W_RZ
  const dx = (x - W_CX) / W_RX - ax
  const dz = (z - W_CZ) / W_RZ - az
  const a = dx * dx + dz * dz
  if (a < 1e-9) return false
  const b = 2 * (ax * dx + az * dz)
  const c = ax * ax + az * az - 1
  const disc = b * b - 4 * a * c
  if (disc <= 0) return false
  const root = Math.sqrt(disc)
  for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
    if (t <= 0.02 || t >= 0.98) continue
    const wx = ex + (x - ex) * t
    const wz = ez + (z - ez) * t
    if (ey + (y - ey) * t < heightAt(wx, wz) + WALL_H + 0.6) return true
  }
  return false
}
